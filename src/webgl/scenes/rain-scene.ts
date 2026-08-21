/**
 * Rain-scene factory (US-042) — the shared engine behind the Matrix digital rain
 * (scenes/matrix.ts) AND the Note-rain (scenes/note.ts).
 *
 * The two scenes are LITERALLY the same rain/terrain engine with the falling
 * glyphs swapped (manual §7.1 / §7.3, US-G2 AC: "same rain/terrain engine, glyph
 * atlas swapped to musical notes"): one full-screen fragment-shader rain pass over
 * a baked glyph atlas, composed with a GPU-displaced wireframe terrain + fog under
 * one perspective camera, flown forward on scroll (US-011), through the tier-gated
 * DOF+CRT post chain (US-012). So rather than duplicate ~300 lines, both scenes
 * call `createRainScene(config)` with their atlas + palette. The ONLY visible
 * differences between Matrix and Note-rain are the glyph sheet and a subtle violet
 * accent on the note heads (`palette.accentStrength` is 0 on Matrix → byte-identical).
 *
 * Each scene publishes its live camera readout under its own debug global
 * (`window.__MATRIX__` / `window.__NOTE__`) for headless verification.
 */
import {
  Scene as ThreeScene,
  PerspectiveCamera,
  PlaneGeometry,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
  FogExp2,
  Color,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { createAirportModel, FIELD_Y, type AirportModel } from './airport-model';
import type { Scene, SceneContext } from '../core/scene-manager';
import type { ScrollState } from '../core/scroll';
import type { AudioReactiveState } from '../core/audio-reactive';
import { prefersReducedMotion } from '../../theme/motion';
import { createPostPipeline, type PostPipeline } from '../core/post';
import vertexShader from '../shaders/rain.vert.glsl?raw';
import fragmentShader from '../shaders/rain.frag.glsl?raw';
import terrainVertexShader from '../shaders/terrain.vert.glsl?raw';
import terrainFragmentShader from '../shaders/terrain.frag.glsl?raw';
import terrainMaskFragmentShader from '../shaders/terrain-mask.frag.glsl?raw';
import terrainFillFragmentShader from '../shaders/terrain-fill.frag.glsl?raw';
import {
  SKY_HAZE,
  SKY_BLUE,
  SKY_SUN,
  SKY_TERRAIN_LOW,
  SKY_TERRAIN_HIGH,
  SKY_TERRAIN_LINE,
  NOTE_MID,
  NOTE_FAR,
} from '../palette';

/** Everything that differs between the Matrix rain and the Note-rain. */
export interface RainSceneConfig {
  /** Scene id registered with the SceneManager (`matrix` / `note` / `airport`). */
  readonly id: string;
  /** Which `window` debug global this scene publishes its camera readout to. */
  readonly debugKey: '__MATRIX__' | '__NOTE__' | '__AERO__';
  /**
   * Aeronautics variant (US-302): the airport scene reuses this exact chassis to
   * render the byte-identical Matrix cruise at morph 0 (the invisible zone handoff).
   * When set, the published debug global carries the extra aero fields
   * (morph / zoneProgress / cameraY) the choreography stories (US-303→US-305) drive;
   * everything else — Matrix and Note — is untouched (the fields stay undefined).
   */
  readonly aero?: boolean;
  /** The baked glyph sheet — Matrix katakana or Note-rain musical notes. */
  readonly atlas: {
    readonly cols: number;
    readonly rows: number;
    readonly glyphCount: number;
    /** Family baked immediately (never blank) until the self-hosted face resolves. */
    readonly fallbackFamily: string;
    /** Bake the sheet from `fontFamily` at `cellPx` resolution (tier-sized, US-048). */
    readonly bake: (fontFamily: string, cellPx: number) => Texture;
    readonly loadFont: () => Promise<string>;
  };
  /** Rain + terrain colours, all palette-token hexes (P7). */
  readonly palette: {
    readonly void: number;
    readonly head: number;
    readonly body: number;
    readonly trail: number;
    /** Head accent hex (Note-rain --note-accent violet); unused when strength 0. */
    readonly accent: number;
    /** Subtle baseline accent on the bloomed head; 0 on Matrix (no-op). US-043 drives it from audio. */
    readonly accentStrength: number;
    readonly terrainLine: number;
    readonly terrainFog: number;
  };
}

/** Target glyph-cell width in CSS px at density 1.0; the cell count derives from it. */
const BASE_CELL_CSS = 22;
/**
 * Target spawn-zone width in CSS px at density 1.0; one drop source per zone (US-051).
 * US-055 tuning: tightened 300 → 240 so the desktop field carries more concurrent
 * drops (it read a touch sparse at 300) without raising per-fragment cost — the 3×3
 * neighbourhood tap count is fixed regardless of zone count, and a smaller zone just
 * means proportionally smaller rings (maxR ≤ ~zoneSize keeps the 3×3 bound valid).
 */
const BASE_ZONE_CSS = 240;

/** Terrain plane extent (world units): a wide, deep ground that fog hides the end of. */
const TERRAIN_WIDTH = 300;
const TERRAIN_DEPTH = 560;
/** Base wireframe resolution at density 1.0; scaled down per tier (line count = cost). */
const TERRAIN_SEG_X = 96;
const TERRAIN_SEG_Z = 200;
/** Peak height (world units) and noise frequency over the plane. */
const TERRAIN_AMPLITUDE = 30;
const TERRAIN_FREQUENCY = 0.018;
/** Exponential-fog density tuned so the far plane edge is fully occluded. */
const FOG_DENSITY = 0.0055;
/** Base camera framing; the camera flies forward (−Z) from here on scroll (US-011). */
const CAMERA_FOV = 60;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 1400;
const CAMERA_POS = { x: 0, y: 30, z: 150 };
const CAMERA_TARGET = { x: 0, y: 6, z: -280 };

/**
 * Scroll-flight tuning (US-011, manual §8).
 *   - CRUISE_TRAVEL: forward (−Z) world units the camera flies over a full scroll.
 *   - PUSH_*: a fast flick adds a transient forward "speed push" that decays back to
 *     cruise — velocity → push (gain, clamped), relaxed on PUSH_RESPONSE (seconds).
 *
 * US-048: the gain + clamp are scaled at mount by `ctx.tier.velocityCoupling` so
 * weaker (mobile) tiers get a gentler, less lurchy push (manual §13 "mobile:
 * scroll-velocity coupling is gentler"). CRUISE_TRAVEL (the steady forward map) and
 * PUSH_RESPONSE (the relax time-constant) stay tier-invariant so the resting feel
 * is the same everywhere — only the transient flick magnitude softens.
 */
const CRUISE_TRAVEL = 300;
const PUSH_GAIN = 0.6;
const PUSH_MAX = 60;
const PUSH_RESPONSE = 0.12;

/**
 * Audio-reactive gains (US-043, manual §7.3; ported to the ripple field in US-051,
 * fully wired/verified in US-054) — how the smoothed audio readout (SceneContext.audio)
 * lifts the drops when an episode plays. All bounded + applied to a HEAVILY smoothed
 * level (audio-reactive.ts), so loud passages SWELL the field rather than strobe it
 * (flash-safe, §15 / WCAG 2.3.1). At rest (level/bass 0) every factor is +0 / 1× → the
 * field is byte-identical to the dormant baseline (AC2 / the US-043 no-op rule).
 *   - INTENSITY: overall level + a bass emphasis raise the master drop intensity
 *     (uIntensity — more / brighter rings), capped.
 *   - BRIGHT:    level widens the head bloom (uBrightness; the shader clamps it on-palette).
 *   - ACCENT:    level intensifies the violet head accent — ONLY where there's a
 *     baseline accent (Note-rain). Matrix's base accent is 0, so it stays pure green.
 */
const AUDIO_LEVEL_GAIN = 0.5;
const AUDIO_BASS_GAIN = 0.4;
const AUDIO_INTENSITY_MAX = 0.7;
const AUDIO_BRIGHTNESS_GAIN = 1.0;
const AUDIO_ACCENT_GAIN = 0.7;

/**
 * Scroll-velocity → drop intensity (US-052, manual §8). The SAME decaying velocity
 * `push` that flies the camera forward (US-011) ALSO lifts the master drop intensity
 * (uIntensity), so a fast scroll flick blooms the ripple field — more rings cross the
 * visible threshold and the heads bloom brighter — then relaxes back to the ambient
 * baseline as `push` decays. This intensifies SPAWN-VISIBILITY/BRIGHTNESS, never a
 * vertical fall speed (the ripple field has no fall). The forward-flight camera push
 * on the terrain is UNTOUCHED — it reads the same `push`; we only ALSO read it here.
 *   - GAIN: scales the normalised push (|push| / its tier-scaled clamp, a 0..1 term).
 *   - MAX:  caps the scroll contribution so the field stays bounded / on-palette.
 * At zero scroll velocity `push` → 0 ⇒ this term is 0 ⇒ uIntensity is its 1.0 ambient
 * baseline (the calm drizzle). Reusing `push` means PUSH_GAIN / PUSH_MAX /
 * velocityCoupling (US-048) already shape the response (gentler on mobile/low tiers).
 */
const SCROLL_INTENSITY_GAIN = 1.1;
const SCROLL_INTENSITY_MAX = 0.9;

/**
 * Airport anchoring (US-304; WORLD-anchored in US-1501, owner call 2026-08-02 —
 * "anclado al terreno y moverse igual que él"). The airport no longer rides the
 * camera: it sits at ONE FIXED world z (anchorZ), derived statelessly every frame
 * from the #aeronautics scroll map — the absolute scroll where the postcard
 * completes (rect.top crossing MORPH_IN_TOP_END·vh) mapped through the STEADY
 * cruise map (no push), minus POSTCARD_AHEAD. The terrain noise is already
 * world-stable (terrain.vert.glsl samples the FBM at position.y + uScroll, so a
 * noise feature at coord c sits at fixed world z = -c), so a fixed anchorZ makes
 * field + mountains ONE RIGID WORLD: the camera slowly closes on the anchored field
 * on approach (~30 world units across the whole zone against the 140 standoff — a
 * slow drift out of the haze, the owner-chosen look), which SUPERSEDES the
 * 2026-07-03 "rises into view from the bottom" entry (that choreography REQUIRED
 * the camera-glued NEAR_AHEAD→POSTCARD_AHEAD lerp this story removed). POSTCARD_AHEAD
 * survives as the anchor-line framing offset: at the postcard-complete instant the
 * camera is exactly POSTCARD_AHEAD from the field (the framing, unchanged). The
 * terrain flatten under the field tracks the SAME world spot via a per-frame
 * CPU-compensated uFlattenDepth (see the frame block; the shader is untouched).
 */
const POSTCARD_AHEAD = 140;

/**
 * US-1502 — terrain-matched fog on the airport + the MORPH-EDGE FOG SWALLOW (the
 * no-pop mechanism that removes the US-1501 interim visibility pop). The airport
 * now attenuates by the SAME exponential fog as the mountains at the same view
 * depth: the paint fills apply it per-fragment (airport-paint.frag.glsl — colour
 * mixes toward the terrain's live fog colour, alpha × (1 − fog), discards
 * preserved) and the built-in wireframe twins fog via scene.fog = FogExp2
 * (Three's chunk is the IDENTICAL 1 − exp(−(d·z)²) formula; airport-model.ts
 * extends it to fade alpha too — the terrain's own `vec4(color, 1-fog)`
 * treatment). Density + colour are driven per frame from the SAME constants the
 * terrain fog uniforms use (FOG_DENSITY; the mix(mix(terrainFog, SKY_HAZE,
 * morph), NOTE_FAR, exit) colour ramp), so field and mountains share ONE
 * atmosphere — the airport condenses out of the haze on approach and dissolves
 * back on exit.
 *
 * The swallow: at the morph edges the model is fully drawn ~66–150 world units
 * ahead when the group.visible gate (morph 0.001, airport-model.ts) flips — a
 * visible pop at the true-match density. So while morph ≤ FOG_SWALLOW_HOLD_MORPH
 * the density rises to whatever fully swallows the model AT ITS ACTUAL DISTANCE:
 * max(the ~3× floor, FOG_SWALLOW_TARGET / the camera→NEAREST-extent distance),
 * where FOG_SWALLOW_TARGET = sqrt(−ln 0.01) makes fog(that distance) = 99% by
 * construction. Nearest-EXTENT, not anchor centre: the runway spans ±66 u around
 * the anchor (FOG_SWALLOW_NEAR_EXTENT ≈ that + margin), and the camera→anchor
 * distance SHRINKS through the zone (~145 u at the entry flip, ~66–110 u at the
 * exit flip) — a centre-distance target would leave the model's near end only
 * ~80% fogged at the flip. The FOG_SWALLOW_NEAR_FLOOR clamp bounds the density
 * when the near extent reaches the camera; fragments that close sit far below
 * the view axis, outside the frustum. Relaxes to the TRUE terrain match by
 * morph = FOG_SWALLOW_RAMP_END. A pure function of morph + scroll (no uTime):
 * static at rest, symmetric on reverse (§15). Exposed as __AERO__.fogSwallow
 * (0 = true match, 1 = fully swallowed).
 *
 * FOG_MATCH — the owner-eyeball fallback knob (the US-1502 named escalation): at
 * full morph the postcard airport reads ~45% fogged toward the sky-haze mix at
 * the 140 u standoff — coherent with the fogged pad under it, but hazier than the
 * old pasted-crisp look. This ONE multiplier scales the fills' TRUE-MATCH density
 * (1.0 = exact terrain match, the default — do NOT pre-apply a reduction; dial
 * toward ~0.5 only on owner request). It can never weaken the swallow: fills are
 * fully discarded below the paint-start morph (0.22 > FOG_SWALLOW_RAMP_END), so
 * the knob only shapes the visible painted range.
 */
const FOG_SWALLOW_HOLD_MORPH = 0.02;
const FOG_SWALLOW_RAMP_END = 0.15;
const FOG_SWALLOW_DENSITY_MAX = 3;
const FOG_SWALLOW_TARGET = Math.sqrt(-Math.log(0.01)); // ≈2.146: fog(target/density) = 99%
const FOG_SWALLOW_NEAR_EXTENT = 70; // runway half-length (66) + margin, world units
const FOG_SWALLOW_NEAR_FLOOR = 4; // nearer fragments sit below the frustum anyway
const FOG_MATCH = 1.0;

/**
 * Scroll choreography (US-305; re-anchored 2026-07-03, owner call — the 220vh
 * scroll-runway CSS is GONE and content must never leave the screen, so the morph
 * windows are anchored to the #aeronautics rect EDGES relative to the viewport
 * (height-independent: locale/viewport/content growth all keep the same feel)
 * instead of section-local progress p over an over-tall section:
 *   - morph-in follows rect.top: it starts as the section title first rises past
 *     ~88% of the viewport (right at the bottom-band theme flip, 92.5%) and reaches
 *     1 by ~55% (US-506 owner retune 2026-07-30, was ~35% — "deberían verse desde un
 *     poco antes": the airport now unburies, paints and frames while the section top
 *     is still in the lower half of the screen; full paint lands at ~0.60vh instead
 *     of ~0.42vh, and the postcard hold lengthens by the same amount).
 *   - climb-out follows rect.bottom: it starts as the section bottom approaches
 *     ~135% and lands morph 0 by ~95% — just before the bottom-band flips the theme
 *     to the next zone, so the US-044 crossfade still leaves near-cruise frames.
 * morph = min(inFactor, outFactor): a hold at 1 exists whenever the section is tall
 * enough for both windows to clear, and on short sections the hat simply peaks —
 * every camera bend stays a continuous function of `morph` (0 at both boundaries ⇒
 * the aero camera meets the standard cruise camera there). The morph-in overlaps the
 * 700 ms theme crossfade — with the US-506 ramp (0.88→0.55) a fast wheel can reach
 * morph ~0.4–0.7 by the end of the dissolve (was <~0.25) — accepted: both scenes
 * share the rain+terrain chassis and the incoming frame is the rising green
 * wireframe (the point of the retune). If the owner finds the fast-wheel dissolve
 * busy, the documented fallback is MORPH_IN_TOP_END = 0.45.
 */
const MORPH_IN_TOP_START = 0.88;
const MORPH_IN_TOP_END = 0.55;
// US-402: the aero zone now HOLDS until #music tops out (sky→note flips when
// #music.top ≤ ~0.02vh; #music is contiguous with #aeronautics, so
// #aeronautics.bottom ≈ #music.top at the flip). Re-anchor the climb-out to that
// exit — morph holds 1 through the extended postcard hold and lands ≈0 exactly at
// the new flip line (the US-302/US-044 crossfade-near-cruise property).
const MORPH_OUT_BOTTOM_START = 0.55;
const MORPH_OUT_BOTTOM_END = 0.06;
/**
 * Postcard-approach camera (US-404 retune): RISE from cruise (y=30) to an elevated
 * 3/4 aerial vantage and slide sideways, so the whole runway (both 01/19 thresholds),
 * the tower and the hangar sit inside the frame at 1440 AND 360 without foreshortening
 * the far half into the horizon glow. LIFT>0 = camera goes up; the aim drops to the
 * field, giving a top-down-ish look that reveals the full strip. All scaled by morph
 * (0 at both boundaries ⇒ byte-identical to the standard cruise camera there).
 */
const POSTCARD_LIFT = 18;
const POSTCARD_SIDE = 12;

/** GLSL-style smoothstep (Hermite ease between two edges). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * US-503 exit ease: the raw climb-out term (1 − outFactor) is already a smoothstep of
 * the rect bottom, but a second ease over its middle keeps the green↔violet MIX ZONE
 * BRIEF — the skeleton reads green through most of the drain and snaps violet near the
 * flip, rather than spending the whole climb-out muddy.
 */
const EXIT_EASE_LO = 0.2;
const EXIT_EASE_HI = 0.8;

/** Edge-anchored morph hat over the #aeronautics rect (top/bottom in viewport-height
 * units): rises as the title enters from the bottom, falls as the section bottom
 * leaves — min() of the two windows, so it degrades to a peak on short sections.
 *
 * US-503 exposes the two factors instead of only their min(): `morph` is a SYMMETRIC
 * hat and so cannot tell entry from exit, but `outFactor` alone can — it is pinned at
 * 1 for the whole entry + postcard hold (#aeronautics.bottom stays far below the
 * window) and only falls through the climb-out, so `exit = 1 − outFactor` is the
 * direction signal. Same rect reads, still stateless per frame. */
function morphFactorsForRect(
  topVh: number,
  bottomVh: number,
): { inFactor: number; outFactor: number; morph: number } {
  const inFactor = 1 - smoothstep(MORPH_IN_TOP_END, MORPH_IN_TOP_START, topVh);
  const outFactor = smoothstep(MORPH_OUT_BOTTOM_END, MORPH_OUT_BOTTOM_START, bottomVh);
  return { inFactor, outFactor, morph: Math.min(inFactor, outFactor) };
}

/** Live camera readout published on the scene's debug global (no per-frame alloc). */
interface RainDebug {
  cameraZ: number;
  forward: number;
  uScroll: number;
  dof: boolean;
  postFx: boolean;
  // US-043/US-052/US-054 reactivity: the smoothed audio level the scene consumed this
  // frame, and the LIVE (post-scroll/audio) drop params it drove — so a headless probe
  // can prove the field reacts (intensity rises on a scroll flick / loud audio) and that
  // Matrix's accent stays 0 (pure green).
  audioLevel: number;
  accentStrength: number;
  // Master drop activity actually applied to uIntensity this frame (1.0 = ambient).
  intensity: number;
  // US-302 aeronautics variant only (undefined on Matrix/Note): the SVT morph
  // (0 = Matrix cruise, 1 = full G1000 + airport), the #aeronautics section-local
  // scroll progress driving it, and the live camera altitude (US-305 choreography).
  morph?: number;
  zoneProgress?: number;
  cameraY?: number;
  // US-502 aeronautics only: the live global paint progress of the airport's spatial
  // paint sweep (0 = bare green wireframe, 1 = the solid postcard, wireframe faded).
  paint?: number;
  // US-503 aeronautics only: the direction signal (0 during entry + the postcard hold,
  // →1 through the climb-out, landing at 1 on the sky→note flip). Drives the
  // green→violet tint of the airport wireframe and the terrain grid/fog.
  exit?: number;
  // US-1501 aeronautics only: the fixed world z the airport + flatten anchored to
  // this frame (stateless, scroll-map-derived), and the world z the flatten uniform
  // actually drove (-uFlattenDepth - forward) — the lockstep proof (must equal
  // anchorZ). Undefined until the first anchored frame (and always on Matrix/Note —
  // JSON.stringify drops undefined, so __MATRIX__/__NOTE__ never expose them).
  anchorZ?: number;
  flattenWorldZ?: number;
  // US-1502 aeronautics only: the live morph-edge fog-swallow signal — 0 = the
  // true terrain-matched fog, 1 = fully swallowed (≥99% attenuation at the
  // model's actual distance, so the group.visible flip is invisible).
  fogSwallow?: number;
}

/** Symmetric clamp to ±max. */
function clampSym(v: number, max: number): number {
  return Math.max(-max, Math.min(max, v));
}

/** sRGB-normalised vec3 straight from a palette hex (no colour-management round-trip). */
function rgb(hex: number): Vector3 {
  return new Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

export function createRainScene(config: RainSceneConfig): Scene {
  let renderer: WebGLRenderer | null = null;
  // Captured at mount so update() can read the live `outputTarget` (US-044): null
  // in the steady state (render to screen), an RT during a theme-boundary crossfade.
  let context: SceneContext | null = null;
  let scene: ThreeScene | null = null;
  let camera: PerspectiveCamera | null = null;
  let geometry: PlaneGeometry | null = null;
  let material: ShaderMaterial | null = null;
  let terrainGeometry: PlaneGeometry | null = null;
  let terrainMaterial: ShaderMaterial | null = null;
  let terrainMesh: Mesh | null = null;
  // US-105: the depth-only "twin" of the terrain — same geometry + displacement,
  // colorWrite off, drawn first, so its silhouette occludes the far-plane rain quad
  // (drops only in the sky). Tracks the camera in lockstep with terrainMesh.
  let maskMaterial: ShaderMaterial | null = null;
  let maskMesh: Mesh | null = null;
  // US-303 aeronautics only: the visible SVT terrain FILL — a second copy of the
  // terrain plane (shared geometry) drawn under the wireframe, emerging with uMorph.
  // Created only when config.aero, so Matrix/Note pay no extra draw (byte-identical).
  let fillMaterial: ShaderMaterial | null = null;
  let fillMesh: Mesh | null = null;
  // US-304 aeronautics only: the 3D airport (runway 01/19 + hangars + tower) that
  // emerges on the flattened valley floor with uMorph. Positioned + faded each frame.
  let airportModel: AirportModel | null = null;
  // US-1502 aeronautics only: the twins' scene fog (built-in Line/MeshBasic
  // materials fog via scene.fog; every ShaderMaterial in the scene ignores it
  // structurally — fog:false default) + the pre-allocated fog-colour endpoints:
  // fills take raw sRGB Vector3s (bare-ShaderMaterial rule, the SAME rgb() values
  // as the terrain's uFog/uFogSVT/uFogNote inits), the built-in twins take
  // colour-managed Colors (net identity for palette hexes — the LINE_GREEN
  // precedent). Matrix/Note never create any of this ⇒ scene.fog stays null there
  // (byte-identical by construction).
  let sceneFog: FogExp2 | null = null;
  let aeroFog: {
    fill: { matrix: Vector3; sky: Vector3; note: Vector3; scratch: Vector3 };
    line: { matrix: Color; sky: Color; note: Color };
  } | null = null;
  // Cached #aeronautics element — the SVT morph tracks its section-local scroll each
  // frame (stateless, rect-derived; US-305 refines the phase map). Aero scene only.
  let aeroEl: HTMLElement | null = null;
  let atlas: Texture | null = null;
  // US-012 post-FX: tier-gated DOF + CRT pipeline. null on low tier (and would be
  // null if both knobs were off) → the scene renders direct to the screen, exactly
  // as before US-012 (no layout/visual break on low tier).
  let post: PostPipeline | null = null;
  let density = 1;
  let disposed = false;
  // US-011 scroll camera: the live Lenis readout (captured at mount) + the decaying
  // velocity push. `reduceMotion` gates the new scroll motion (P5) so a frozen-frame
  // render (renderOnce, future RM stories) keeps the static framing.
  let scrollState: ScrollState | null = null;
  let reduceMotion = false;
  let push = 0;
  // US-048: per-tier velocity-coupling scale (1.0 high … gentler on mobile/low),
  // captured at mount and applied to the velocity push gain + clamp in update().
  let velocityCoupling = 1;
  // US-043 audio reactivity: the live readout (captured at mount) + the un-modulated
  // baselines update() lifts from. `baseAccentStrength` 0 on Matrix keeps it pure.
  let audioState: AudioReactiveState | null = null;
  // US-051 ripple field: glyph-cell density + spawn-zone (drop) density, both
  // tier-scaled at mount/resize. The audio/scroll reactivity raises uIntensity
  // (a multiplier) instead of resizing the grids, so glyphs never jump in size.
  let baseCells = 8;
  let baseZones = 3;
  let baseAccentStrength = 0;
  // Debug observability (mirrors window.__SCROLL__): one reused object — no per-frame
  // allocation. `dof`/`postFx` mirror the active post passes so the harness can
  // assert tier-gating (US-012); the audio fields mirror the US-043 reactivity.
  const camDebug: RainDebug = {
    cameraZ: CAMERA_POS.z,
    forward: 0,
    uScroll: 0,
    dof: false,
    postFx: false,
    audioLevel: 0,
    accentStrength: 0,
    intensity: 1,
  };

  /** Glyph-cell count across a viewport width, scaled by tier density (min 8). */
  function cellsFor(cssWidth: number): number {
    return Math.max(8, Math.round((cssWidth / BASE_CELL_CSS) * density));
  }

  /**
   * Spawn-zone (drop source) count across a viewport width (min 2). Scales gently
   * with tier (`0.5 + 0.5·density`, like the terrain segment count) so lower tiers
   * get fewer, larger ripples rather than vanishingly sparse ones.
   */
  function zonesFor(cssWidth: number): number {
    return Math.max(2, Math.round((cssWidth / BASE_ZONE_CSS) * (0.5 + 0.5 * density)));
  }

  return {
    id: config.id,

    mount(ctx: SceneContext) {
      renderer = ctx.renderer;
      context = ctx;
      disposed = false;
      density = ctx.tier.rainDensity;
      scrollState = ctx.scroll; // live Lenis readout; read each frame in update()
      audioState = ctx.audio; // live audio readout (US-043); read each frame in update()
      baseCells = cellsFor(window.innerWidth);
      baseZones = zonesFor(window.innerWidth);
      baseAccentStrength = config.palette.accentStrength;
      // The engine only boots in full-motion mode, but gate the new scroll motion
      // anyway (P5): a frozen-frame render must keep the static framing. Reads the
      // resolved `data-motion` (the in-page toggle), not the OS media query.
      reduceMotion = prefersReducedMotion();
      push = 0;
      velocityCoupling = ctx.tier.velocityCoupling;
      camDebug.cameraZ = CAMERA_POS.z;
      camDebug.forward = 0;
      camDebug.uScroll = 0;
      camDebug.dof = ctx.tier.dof;
      camDebug.postFx = ctx.tier.postFx;
      camDebug.audioLevel = 0;
      camDebug.accentStrength = baseAccentStrength;
      camDebug.intensity = 1;
      // US-302: expose the aero fields only for the airport scene, so __AERO__ has
      // { morph, zoneProgress, cameraY } while __MATRIX__/__NOTE__ stay unchanged.
      // morph 0 = byte-identical Matrix cruise (US-303 wires the SVT + morph driver).
      if (config.aero) {
        camDebug.morph = 0;
        camDebug.zoneProgress = 0;
        camDebug.cameraY = CAMERA_POS.y;
        camDebug.exit = 0;
        // US-1501: unset until the first anchored frame computes them (a remount
        // must not report the previous mount's anchor).
        camDebug.anchorZ = undefined;
        camDebug.flattenWorldZ = undefined;
        // US-1502: morph is 0 at mount ⇒ the swallow starts fully closed.
        camDebug.fogSwallow = 1;
      }

      scene = new ThreeScene();
      // Perspective camera for the terrain; the rain quad ignores it (its vertex
      // shader emits clip space directly), so both live in one scene / one render.
      camera = new PerspectiveCamera(
        CAMERA_FOV,
        window.innerWidth / window.innerHeight,
        CAMERA_NEAR,
        CAMERA_FAR,
      );
      camera.position.set(CAMERA_POS.x, CAMERA_POS.y, CAMERA_POS.z);
      camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);

      // Bake the atlas once at the tier-sized cell resolution (US-048); re-baked
      // (same size) when the self-hosted font resolves.
      atlas = config.atlas.bake(config.atlas.fallbackFamily, ctx.tier.atlasCellPx);

      const buffer = renderer.getDrawingBufferSize(new Vector2());
      material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        // US-105: the quad emits at the far plane (rain.vert.glsl z≈1) and now
        // depth-TESTS against the terrain depth-mask (drawn first) so fragments
        // behind the ridgeline are discarded — rain only in the sky. It never
        // WRITES depth (a backdrop), so it can't occlude the terrain/wireframe.
        depthTest: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new Vector2(buffer.x, buffer.y) },
          uAtlas: { value: atlas },
          uAtlasGrid: { value: new Vector2(config.atlas.cols, config.atlas.rows) },
          uGlyphCount: { value: config.atlas.glyphCount },
          uCellDensity: { value: baseCells },
          uZoneDensity: { value: baseZones },
          // Ripple cadence / expansion-rate scalar — preserves the old uSpeed tier
          // knob (ctx.tier.rainSpeed) and is a US-055 tuning lever; the per-drop
          // period/phase/radius still vary in-shader.
          uDropSpeed: { value: ctx.tier.rainSpeed },
          // Master drop activity; 1.0 = ambient. Scroll velocity (US-052) + audio
          // (US-054) raise it in update(); at rest it stays 1.0 (calm drizzle).
          uIntensity: { value: 1 },
          uVoid: { value: rgb(config.palette.void) },
          uHead: { value: rgb(config.palette.head) },
          uBody: { value: rgb(config.palette.body) },
          uTrail: { value: rgb(config.palette.trail) },
          // US-042 violet head accent (--note-accent); strength 0 on Matrix → no-op.
          uAccent: { value: rgb(config.palette.accent) },
          uAccentStrength: { value: config.palette.accentStrength },
          // US-043 audio head-brightness lift; 1.0 = dormant baseline (no-op).
          uBrightness: { value: 1 },
          // US-303 SVT morph: 0 = glyph-rain void (no-op); the airport scene drives it
          // toward 1 to fade in the synthetic-vision sky (Matrix/Note leave it at 0).
          uMorph: { value: 0 },
          uSkyHaze: { value: rgb(SKY_HAZE) },
          uSkyBlue: { value: rgb(SKY_BLUE) },
          uSkySun: { value: rgb(SKY_SUN) },
        },
      });

      // Opaque full-screen backdrop, drawn before the transparent terrain.
      geometry = new PlaneGeometry(2, 2);
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = -1;
      scene.add(mesh);

      // Wireframe terrain: a GPU-displaced plane, resolution scaled by tier.
      const segX = Math.max(16, Math.round(TERRAIN_SEG_X * (0.5 + 0.5 * density)));
      const segZ = Math.max(24, Math.round(TERRAIN_SEG_Z * (0.5 + 0.5 * density)));
      terrainGeometry = new PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH, segX, segZ);
      terrainMaterial = new ShaderMaterial({
        vertexShader: terrainVertexShader,
        fragmentShader: terrainFragmentShader,
        wireframe: true,
        transparent: true,
        // US-105: the visible wireframe is now a PURE overlay — depthTest:false so it
        // ignores the depth-mask (below) and keeps its exact x-ray line look on every
        // tier (all edges, front and back). Without this the solid mask would occlude
        // the back-facing lines, changing the look (AC: "mismas líneas").
        depthTest: false,
        // US-106: the visible wireframe writes NO depth on any tier — the always-on
        // solid depth mask (maskMaterial below) is the SOLE owner of the terrain depth
        // the high-tier DOF pass reads. Pre-US-105 this was `depthWrite: ctx.tier.dof`
        // (the wireframe was DOF's only depth source on high); with the mask writing
        // coherent SOLID terrain depth first (renderOrder -2), a second write from this
        // transparent wireframe is redundant and incoherent (transparent geometry
        // shouldn't write depth). The DOF DepthTexture is unchanged BY CONSTRUCTION —
        // the wireframe shares the mask's geometry/vertex-shader/uniforms, so its
        // line-depths were a strict subset of, and identical in value to, the mask's;
        // DOF now reads the mask's DENSE, coherent silhouette (a better far-field depth
        // source than the old sparse wireframe lines). On medium/low the wireframe was
        // already depthWrite:false (only the mask writes, for the rain occlusion test).
        depthWrite: false,
        uniforms: {
          uAmplitude: { value: TERRAIN_AMPLITUDE },
          uFrequency: { value: TERRAIN_FREQUENCY },
          uScroll: { value: 0 }, // forward-flight offset (US-011), driven in update()
          uLine: { value: rgb(config.palette.terrainLine) },
          uFog: { value: rgb(config.palette.terrainFog) },
          uFogDensity: { value: FOG_DENSITY },
          // US-303 SVT morph: 0 = Matrix wireframe (no-op); toward 1 the grid re-tints
          // to --sky-terrain-line and the fog to --sky-haze (airport scene drives it).
          uMorph: { value: 0 },
          uLineSVT: { value: rgb(SKY_TERRAIN_LINE) },
          uFogSVT: { value: rgb(SKY_HAZE) },
          // US-503 climb-out hand-over: 0 = no-op (Matrix and Note NEVER drive this,
          // so their terrain renders byte-identical — the accentStrength:0 rule); the
          // aero scene raises it through the climb-out so the re-revealed grid + fog
          // tint toward the violet Note ramp before the sky→note crossfade.
          uExit: { value: 0 },
          uLineNote: { value: rgb(NOTE_MID) },
          uFogNote: { value: rgb(NOTE_FAR) },
          // US-304 airport flatten: plane-space depth of the field centre (0 for
          // Matrix/Note — with uMorph 0 the flatten in terrain.vert.glsl is a no-op).
          uFlattenDepth: { value: 0 },
        },
      });
      terrainMesh = new Mesh(terrainGeometry, terrainMaterial);
      terrainMesh.rotation.x = -Math.PI / 2; // lay the plane flat; +Z displacement → world up
      terrainMesh.frustumCulled = false;
      scene.add(terrainMesh);

      // US-105: depth-only "twin" of the terrain. SAME geometry (shared — no dup) and
      // SAME displacement uniforms (terrain.vert.glsl reads uAmplitude/uFrequency/
      // uScroll only), but the material writes ONLY depth (colorWrite:false, so no
      // visible solid fill) and is drawn FIRST (renderOrder -2, before the rain quad's
      // -1). Its silhouette occludes the far-plane rain → drops read as sky behind the
      // mountains. Tracked with the camera in update() in lockstep with terrainMesh so
      // the mask never lags the visible ridgeline (AC5). Applies to both rain scenes
      // (Matrix + Note) since both share this factory.
      maskMaterial = new ShaderMaterial({
        vertexShader: terrainVertexShader,
        fragmentShader: terrainMaskFragmentShader,
        colorWrite: false,
        depthWrite: true,
        depthTest: true,
        uniforms: {
          uAmplitude: { value: TERRAIN_AMPLITUDE },
          uFrequency: { value: TERRAIN_FREQUENCY },
          uScroll: { value: 0 }, // kept in sync with terrainMaterial.uScroll in update()
          // US-304: the mask twin gets the SAME flatten uniforms as the visible terrain
          // (US-105 lockstep) so the rain-occlusion silhouette matches the flat field.
          // 0/0 for Matrix/Note → the terrain.vert.glsl flatten is a no-op there.
          uMorph: { value: 0 },
          uFlattenDepth: { value: 0 },
        },
      });
      maskMesh = new Mesh(terrainGeometry, maskMaterial);
      maskMesh.rotation.x = -Math.PI / 2;
      maskMesh.frustumCulled = false;
      maskMesh.renderOrder = -2; // before the rain quad (-1): writes depth first
      scene.add(maskMesh);

      // US-303: the visible SVT terrain fill — a third copy of the terrain plane
      // (shared geometry + terrain.vert.glsl displacement), depth-TESTED against the
      // mask so it self-occludes, but writing NO depth (the mask stays sole owner,
      // US-106). alpha = uMorph, so at morph 0 it's fully transparent (byte-identical
      // Matrix cruise) and emerges as an opaque elevation-tinted surface toward morph 1.
      // Drawn between the mask (-2) and the rain sky (-1), UNDER the wireframe grid (0).
      // Only the aeronautics scene builds it — Matrix/Note pay no extra draw.
      if (config.aero) {
        aeroEl = document.getElementById('aeronautics');
        fillMaterial = new ShaderMaterial({
          vertexShader: terrainVertexShader,
          fragmentShader: terrainFillFragmentShader,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          uniforms: {
            uAmplitude: { value: TERRAIN_AMPLITUDE },
            uFrequency: { value: TERRAIN_FREQUENCY },
            uScroll: { value: 0 }, // kept in sync with the terrain/mask in update()
            uMorph: { value: 0 },
            // US-304: the fill shares terrain.vert.glsl, so it flattens in lockstep too.
            uFlattenDepth: { value: 0 },
            uLow: { value: rgb(SKY_TERRAIN_LOW) },
            uHigh: { value: rgb(SKY_TERRAIN_HIGH) },
            uHaze: { value: rgb(SKY_HAZE) },
            uFogDensity: { value: FOG_DENSITY },
          },
        });
        fillMesh = new Mesh(terrainGeometry, fillMaterial);
        fillMesh.rotation.x = -Math.PI / 2;
        fillMesh.frustumCulled = false;
        fillMesh.renderOrder = -1.5; // between the depth mask (-2) and the rain sky (-1)
        scene.add(fillMesh);

        // US-304: the 3D airport, added once and positioned/faded each frame.
        airportModel = createAirportModel();
        scene.add(airportModel.object);

        // US-1502: the twins' scene fog (FogExp2 — Three's chunk is the exact
        // terrain fog formula) + the pre-allocated colour endpoints. Initial
        // density = the fully-swallowed floor (morph is 0 at mount); update()
        // drives density + colour every frame. Endpoints mirror the terrain's
        // uFog/uFogSVT/uFogNote inits exactly (P7 — no new palette constants).
        sceneFog = new FogExp2(
          config.palette.terrainFog,
          FOG_DENSITY * FOG_SWALLOW_DENSITY_MAX,
        );
        scene.fog = sceneFog;
        aeroFog = {
          fill: {
            matrix: rgb(config.palette.terrainFog),
            sky: rgb(SKY_HAZE),
            note: rgb(NOTE_FAR),
            scratch: new Vector3(),
          },
          line: {
            matrix: new Color(config.palette.terrainFog),
            sky: new Color(SKY_HAZE),
            note: new Color(NOTE_FAR),
          },
        };
      }

      // US-012: build the tier-gated DOF + CRT post pipeline. Null on low tier →
      // update() renders direct to the screen (no break). Sized to the drawing
      // buffer (physical px), like the rain's uResolution.
      post = createPostPipeline(renderer, buffer.x, buffer.y, {
        dof: ctx.tier.dof,
        postFx: ctx.tier.postFx,
        near: CAMERA_NEAR,
        far: CAMERA_FAR,
      });

      // Publish the live camera readout for headless verification (US-011/US-042).
      if (typeof window !== 'undefined') window[config.debugKey] = camDebug;

      // Swap in the deterministic glyph atlas once the self-hosted font loads.
      void config.atlas.loadFont().then((family) => {
        if (disposed || !material) return;
        const next = config.atlas.bake(family, ctx.tier.atlasCellPx);
        material.uniforms.uAtlas!.value = next;
        atlas?.dispose();
        atlas = next;
      });
    },

    resize(width: number, height: number) {
      if (!renderer) return;
      const buffer = renderer.getDrawingBufferSize(new Vector2());
      baseCells = cellsFor(width);
      baseZones = zonesFor(width);
      if (material) {
        material.uniforms.uResolution!.value.set(buffer.x, buffer.y);
        // Grid densities are tier + width derived (not audio/scroll-driven), so set
        // them here; a frozen/paused frame then uses the right glyph + drop sizing.
        material.uniforms.uCellDensity!.value = baseCells;
        material.uniforms.uZoneDensity!.value = baseZones;
      }
      if (camera) {
        camera.aspect = width / Math.max(1, height);
        camera.updateProjectionMatrix();
      }
      // Keep the post render targets + resolution uniforms at the new buffer size.
      post?.resize(buffer.x, buffer.y);
    },

    update(deltaSeconds: number, elapsedSeconds: number) {
      if (!renderer || !scene || !camera || !material) return;
      material.uniforms.uTime!.value = elapsedSeconds;

      // Scroll → camera forward flight (US-011, §8). Gated by reduce-motion so a
      // frozen frame keeps the static framing; the engine never starts the loop
      // under RM anyway, so the live path is always motion-allowed.
      if (!reduceMotion && scrollState) {
        // Transient velocity push: a fast flick adds forward speed that relaxes back
        // to cruise. deltaSeconds is the loop's CLAMPED dt, so a tab refocus can't
        // make the push lurch (no jump — the AC's clamped-delta requirement). The
        // gain + clamp scale by the per-tier velocityCoupling (US-048) so the push
        // is gentler on mobile/low tiers.
        const targetPush = clampSym(
          scrollState.velocity * PUSH_GAIN * velocityCoupling,
          PUSH_MAX * velocityCoupling,
        );
        push += (targetPush - push) * (1 - Math.exp(-deltaSeconds / PUSH_RESPONSE));

        // progress (0..1) → forward (−Z) distance; push adds the transient.
        const forward = scrollState.progress * CRUISE_TRAVEL + push;
        camera.position.z = CAMERA_POS.z - forward;
        // The plane tracks the camera so we never fly off the finite mesh; the
        // vertex shader's uScroll = forward keeps the noise world-stable, so the
        // range streams toward the camera instead (endless flight). Orientation is
        // fixed (set once at mount): camera + terrain translate together, so the
        // framing stays correct and the motion reads from the streaming terrain.
        if (terrainMesh) terrainMesh.position.z = -forward;
        if (terrainMaterial) terrainMaterial.uniforms.uScroll!.value = forward;
        // US-105: move the depth-mask in lockstep with the visible terrain (same
        // frame, same uScroll) so the occlusion silhouette never desyncs (AC5).
        if (maskMesh) maskMesh.position.z = -forward;
        if (maskMaterial) maskMaterial.uniforms.uScroll!.value = forward;
        // US-303: the SVT fill shares the terrain displacement, so it tracks the
        // camera in the same lockstep (aero scene only).
        if (fillMesh) fillMesh.position.z = -forward;
        if (fillMaterial) fillMaterial.uniforms.uScroll!.value = forward;

        camDebug.forward = forward;
        camDebug.uScroll = forward;
      }
      camDebug.cameraZ = camera.position.z;
      // US-302 aero variant: track the live camera altitude (US-305 choreography
      // moves it; at morph 0 it stays CAMERA_POS.y — the Matrix cruise framing).
      // US-303: drive the SVT morph from #aeronautics section-local scroll progress.
      if (config.aero) {
        if (!aeroEl) aeroEl = document.getElementById('aeronautics');
        const rect = aeroEl?.getBoundingClientRect();
        // Rect-derived each frame ⇒ stateless (reverse scroll / resize / locale
        // heights / deep links all free — no stored anchor). p (section-local
        // progress, 0 entering → 1 exiting) stays as a debug readout only; the
        // morph itself is anchored to the rect EDGES (see morphForRect).
        let p = 0;
        let morph = 0;
        // US-503: the climb-out term. `morph` is a symmetric hat and cannot tell entry
        // from exit; `outFactor` can — it holds at 1 for the whole entry + postcard and
        // only falls through the US-402 climb-out window (0.55 → 0.06 vh), so
        // exit = 1 − outFactor is 0 on the way in and lands at 1 exactly at the
        // sky→note flip. Rect-derived per frame ⇒ stateless like the morph itself.
        let exit = 0;
        if (rect) {
          const vh = window.innerHeight;
          p = Math.max(0, Math.min(1, (vh - rect.top) / (rect.height + vh)));
          const factors = morphFactorsForRect(rect.top / vh, rect.bottom / vh);
          morph = factors.morph;
          exit = smoothstep(EXIT_EASE_LO, EXIT_EASE_HI, 1 - factors.outFactor);
        }
        // A harness override (__AERO_OVERRIDE_MORPH__) wins over the scroll map.
        const override =
          typeof window !== 'undefined' ? window.__AERO_OVERRIDE_MORPH__ : undefined;
        if (typeof override === 'number' && isFinite(override)) {
          morph = Math.max(0, Math.min(1, override));
        }
        // US-503: the exit override mirrors it (the two are independent knobs, so the
        // harness can scrub the whole {morph × exit} matrix).
        const exitOverride =
          typeof window !== 'undefined' ? window.__AERO_OVERRIDE_EXIT__ : undefined;
        if (typeof exitOverride === 'number' && isFinite(exitOverride)) {
          exit = Math.max(0, Math.min(1, exitOverride));
        }
        camDebug.zoneProgress = p;
        camDebug.morph = morph;
        camDebug.exit = exit;
        material.uniforms.uMorph!.value = morph;
        if (terrainMaterial) {
          terrainMaterial.uniforms.uMorph!.value = morph;
          // Aero scene only — Matrix/Note leave uExit at its 0 init (byte-identical).
          terrainMaterial.uniforms.uExit!.value = exit;
        }
        if (fillMaterial) fillMaterial.uniforms.uMorph!.value = morph;

        // US-1501 world anchor (supersedes the US-304 camera-glued approachAhead
        // lerp): the airport + the terrain flatten under it sit at ONE fixed world z,
        // recomputed STATELESSLY every frame from the #aeronautics scroll map — the
        // same rect-derived no-stored-state discipline as the morph (reverse scroll /
        // resize / locale heights / deep links all free). anchorScroll is the
        // absolute scroll offset where the postcard completes (rect.top crossing
        // MORPH_IN_TOP_END·vh); mapped through the STEADY cruise map (no push — the
        // anchor must never surge with a flick) it gives the camera's forward AT that
        // instant, and the anchor sits POSTCARD_AHEAD ahead of THAT fixed camera
        // position. Flatten lockstep is CPU-compensated per frame (the shader's
        // plane-space math is untouched): plane-local depth d sits at world
        // z = -d - forward, so uFlattenDepth = -anchorZ - forward keeps the flat pad
        // glued to the SAME world spot as the group; the mask twin gets the SAME
        // uMorph + depth (US-105 lockstep) so the rain-occlusion silhouette matches.
        // Guard limit > 0 by skipping the placement writes that frame (no scrollable
        // page ⇒ no scroll map; the model is hidden at morph 0 anyway).
        // The group.visible gate (morph > 0.001, airport-model.ts) flips with the
        // model ~66–150 world units ahead — invisible since US-1502: the morph-edge
        // fog swallow (below) holds ≥99% attenuation at the model's actual distance
        // whenever morph ≤ FOG_SWALLOW_HOLD_MORPH. Still no whole-model opacity
        // fade (the US-501 owner call stands) — the fog IS the attenuation.
        const forward = camDebug.forward;
        let anchorZ: number | null = null;
        if (maskMaterial) maskMaterial.uniforms.uMorph!.value = morph;
        // Lenis only fills scrollState.limit on its first 'scroll' emit, so a
        // never-scrolled boot (a /#aeronautics deep link) would have limit 0 —
        // fall back to the DOM-derived limit (layout is already clean after the
        // rect read above, so this forces no extra reflow).
        const scrollLimit =
          scrollState && scrollState.limit > 0
            ? scrollState.limit
            : document.documentElement.scrollHeight - window.innerHeight;
        if (rect && scrollLimit > 0) {
          const vh = window.innerHeight;
          // window.scrollY + rect.top is ONE coherent layout snapshot (the absolute
          // document-space section top) — scrollState.scroll is the same value in
          // steady state (Lenis writes the DOM scroll each raf) but transiently LAGS
          // the DOM after an instant native jump (anchor-link click / scrollTo),
          // which would teleport the anchor for a frame. Coherent pair, no lag.
          const anchorScroll = window.scrollY + rect.top - MORPH_IN_TOP_END * vh;
          const anchorForward = (anchorScroll / scrollLimit) * CRUISE_TRAVEL;
          anchorZ = CAMERA_POS.z - anchorForward - POSTCARD_AHEAD;
          const flattenDepth = -anchorZ - forward;
          if (terrainMaterial) terrainMaterial.uniforms.uFlattenDepth!.value = flattenDepth;
          if (fillMaterial) fillMaterial.uniforms.uFlattenDepth!.value = flattenDepth;
          if (maskMaterial) maskMaterial.uniforms.uFlattenDepth!.value = flattenDepth;
          if (airportModel) airportModel.object.position.set(0, FIELD_Y, anchorZ);
          camDebug.anchorZ = anchorZ;
          // The world z the flatten uniform actually drove this frame — must track
          // anchorZ exactly (the harness's lockstep proof).
          camDebug.flattenWorldZ = -flattenDepth - forward;
        }
        if (airportModel) {
          // US-503: `exit` tints the wireframe green→violet on the climb-out; the
          // paint drain itself is free (it follows `morph`, which falls with it).
          airportModel.setMorph(morph, exit);
          // US-502: the live paint progress the sweep drove this frame (monotonic in
          // morph, reverses with it) — the harness reads it off __AERO__.
          camDebug.paint = airportModel.paint;
        }

        // US-1502 — terrain-matched fog + the morph-edge swallow (see the
        // FOG_SWALLOW_* constants block for the full design). One swallow-scaled
        // density feeds BOTH the fills (setFog → airport-paint.frag.glsl) and the
        // wireframe twins (scene.fog FogExp2); the colour is the terrain fragment
        // stage's exact live mix — mix(mix(terrainFog, skyHaze, morph), noteFar,
        // exit) — so field and mountains dissolve into ONE atmosphere on every
        // path (entry, postcard, climb-out, reverse). Pure function of morph +
        // scroll (camera/anchor are scroll-derived); everything pre-allocated.
        const fogSwallow =
          1 - smoothstep(FOG_SWALLOW_HOLD_MORPH, FOG_SWALLOW_RAMP_END, morph);
        // ≥99% attenuation AT THE MODEL'S ACTUAL DISTANCE by construction — its
        // NEAREST visible extent (the runway near end, ~66 u before the anchor),
        // where the adaptive term covers what the ~3× floor alone could not (the
        // camera→anchor distance shrinks through the zone, so the exit-side flip
        // is far nearer than the entry's ~145 u). Falls back to the
        // POSTCARD_AHEAD standoff when no anchor exists this frame (morph is 0
        // there — the model is hidden).
        const anchorDist =
          anchorZ !== null ? Math.abs(anchorZ - camera.position.z) : POSTCARD_AHEAD;
        const nearDist = Math.max(
          FOG_SWALLOW_NEAR_FLOOR,
          anchorDist - FOG_SWALLOW_NEAR_EXTENT,
        );
        const swallowDensity = Math.max(
          FOG_DENSITY * FOG_SWALLOW_DENSITY_MAX,
          FOG_SWALLOW_TARGET / nearDist,
        );
        const twinFogDensity = FOG_DENSITY + (swallowDensity - FOG_DENSITY) * fogSwallow;
        if (sceneFog && aeroFog) {
          sceneFog.density = twinFogDensity;
          sceneFog.color
            .copy(aeroFog.line.matrix)
            .lerp(aeroFog.line.sky, morph)
            .lerp(aeroFog.line.note, exit);
        }
        if (airportModel && aeroFog) {
          // FOG_MATCH scales only the fills' true-match end (the postcard knob,
          // default 1.0 ⇒ identical to the twins' density); the swallow end is
          // untouchable (fills are discarded below paint-start anyway).
          const fillFogDensity =
            FOG_DENSITY * FOG_MATCH +
            (swallowDensity - FOG_DENSITY * FOG_MATCH) * fogSwallow;
          const s = aeroFog.fill.scratch;
          s.copy(aeroFog.fill.matrix)
            .lerp(aeroFog.fill.sky, morph)
            .lerp(aeroFog.fill.note, exit);
          airportModel.setFog(fillFogDensity, s);
        }
        camDebug.fogSwallow = fogSwallow;

        // US-305 final-approach camera (aim re-anchored in US-1501): descend + slide
        // to a 3/4 vantage and re-aim from the fixed cruise direction toward the
        // WORLD-anchored airport (0, FIELD_Y, anchorZ) as morph rises. Every bend is
        // scaled by `morph` (0 outside the window) ⇒ at both boundaries the camera is
        // byte-identical to the standard cruise camera (matrix/note keep the fixed
        // mount orientation; at morph 0 the cruise aim below reproduces it since it's
        // camera.position + the SAME mount direction offset — direction, not the
        // point, drives lookAt). The forward flight (camera.position.z) is the
        // standard mapping, untouched — only altitude/lateral/aim bend inside the
        // morph window. When the anchor is unavailable this frame (limit 0) morph is
        // 0 ⇒ the blend weight is 0, so any finite fallback aim z is the cruise aim.
        // Gated on !reduceMotion to match the scroll block (position.z); the engine
        // never boots under RM anyway.
        if (!reduceMotion) {
          camera.position.x = CAMERA_POS.x + POSTCARD_SIDE * morph;
          camera.position.y = CAMERA_POS.y + POSTCARD_LIFT * morph;
          const cruiseX = camera.position.x + (CAMERA_TARGET.x - CAMERA_POS.x);
          const cruiseY = camera.position.y + (CAMERA_TARGET.y - CAMERA_POS.y);
          const cruiseZ = camera.position.z + (CAMERA_TARGET.z - CAMERA_POS.z);
          const aimZ = anchorZ ?? camera.position.z - POSTCARD_AHEAD;
          camera.lookAt(
            cruiseX + (0 - cruiseX) * morph,
            cruiseY + (FIELD_Y - cruiseY) * morph,
            cruiseZ + (aimZ - cruiseZ) * morph,
          );
        }
        camDebug.cameraY = camera.position.y;
      }

      // Ripple field intensity (US-051): the master drop intensity (uIntensity — more
      // / brighter rings) is lifted by TWO smoothed, decaying signals — scroll velocity
      // (US-052, below) and the audio level/bass (US-054, fully verified there). Both
      // are gated by reduce-motion like the scroll camera (the engine never boots under
      // RM anyway, but a frozen frame must keep the dormant baseline). At level/bass 0
      // AND zero scroll velocity every term is its baseline, so the uniforms equal their
      // dormant values — the field is byte-identical to the calm no-input case (AC2 /
      // the US-043 no-op rule).
      const level = !reduceMotion && audioState ? audioState.level : 0;
      const bass = !reduceMotion && audioState ? audioState.bass : 0;

      const audioIntensity = Math.min(
        AUDIO_INTENSITY_MAX,
        level * AUDIO_LEVEL_GAIN + bass * AUDIO_BASS_GAIN,
      );

      // US-052 scroll-velocity drop intensity: the decaying velocity `push` (computed
      // above, the same signal that flies the camera forward) normalised to 0..1 by
      // its tier-scaled clamp, then scaled + capped → a fast scroll flick blooms the
      // field, relaxing to the ambient baseline as `push` decays. Gated on reduceMotion
      // defensively (AC4); `push` is already 0 under RM since the scroll block above is
      // gated and `push` starts at 0, so this is belt-and-suspenders.
      const scrollIntensity = reduceMotion
        ? 0
        : Math.min(
            SCROLL_INTENSITY_MAX,
            (Math.abs(push) / Math.max(1, PUSH_MAX * velocityCoupling)) * SCROLL_INTENSITY_GAIN,
          );

      // Master intensity = ambient baseline (1.0) + audio swell (US-054) + scroll
      // flick (US-052). At rest both terms are 0 ⇒ uIntensity is 1.0 ⇒ byte-identical
      // to the dormant baseline (the US-043 no-op rule still holds for the audio path).
      const intensity = 1 + audioIntensity + scrollIntensity;
      material.uniforms.uIntensity!.value = intensity;
      material.uniforms.uBrightness!.value = 1 + level * AUDIO_BRIGHTNESS_GAIN;
      // Accent only intensifies where there IS a baseline accent (Note-rain, base
      // 0.4). Matrix's base is 0 → this stays 0, so audio never tints it violet.
      const accentStrength =
        baseAccentStrength > 0
          ? Math.min(1, baseAccentStrength + level * AUDIO_ACCENT_GAIN)
          : 0;
      material.uniforms.uAccentStrength!.value = accentStrength;

      camDebug.audioLevel = level;
      camDebug.accentStrength = accentStrength;
      camDebug.intensity = intensity;

      // US-012: composite through the DOF + CRT pipeline when the tier enables it;
      // otherwise (low tier) render straight to the screen as before. US-044: the
      // final output lands in `outputTarget` during a crossfade (null = screen, the
      // steady state — byte-identical to before).
      const target = context ? context.outputTarget : null;
      if (post) {
        post.render(scene, camera, target);
      } else {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }
    },

    unmount() {
      disposed = true;
      post?.dispose();
      post = null;
      geometry?.dispose();
      geometry = null;
      material?.dispose();
      material = null;
      terrainGeometry?.dispose(); // shared with the mask; disposed once here
      terrainGeometry = null;
      terrainMaterial?.dispose();
      terrainMaterial = null;
      terrainMesh = null;
      // US-105 mask: material only — its geometry IS terrainGeometry (disposed above).
      maskMaterial?.dispose();
      maskMaterial = null;
      maskMesh = null;
      // US-303 fill (aero only): material only — geometry IS terrainGeometry (above).
      fillMaterial?.dispose();
      fillMaterial = null;
      fillMesh = null;
      // US-304 airport (aero only): its own geometries/materials/texture.
      airportModel?.dispose();
      airportModel = null;
      // US-1502 fog (aero only): FogExp2/Vector3/Color hold no GPU resources —
      // dropping the references (scene.fog goes with `scene = null` below) is the
      // whole cleanup.
      sceneFog = null;
      aeroFog = null;
      aeroEl = null;
      atlas?.dispose();
      atlas = null;
      scrollState = null;
      audioState = null;
      scene = null;
      camera = null;
      renderer = null;
      context = null;
      if (typeof window !== 'undefined' && window[config.debugKey] === camDebug) {
        delete window[config.debugKey];
      }
    },
  };
}

declare global {
  interface Window {
    /**
     * Debug: live Matrix camera readout (US-011) + active post passes (US-012);
     * set only while the Matrix scene runs.
     */
    __MATRIX__?: RainDebug;
    /** Debug: live Note-rain camera readout (US-042); set only while it runs. */
    __NOTE__?: RainDebug;
    /**
     * Debug: live Airport (aeronautics) scene readout (US-302); set only while it
     * runs. RainDebug + the aero fields { morph, zoneProgress, cameraY, paint, exit,
     * anchorZ, flattenWorldZ, fogSwallow } (anchorZ/flattenWorldZ since US-1501 —
     * the world anchor; fogSwallow since US-1502 — the morph-edge fog swallow).
     */
    __AERO__?: RainDebug;
    /**
     * Debug override (US-303): when a finite number, forces the airport scene's SVT
     * morph (0..1) directly, bypassing the #aeronautics section-scroll driver — the
     * harness pokes it to scrub the morph. Unset/undefined ⇒ scroll drives it.
     * SINCE US-1501 it drives morph/paint/flatten-AMPLITUDE but NOT framing:
     * placement is scroll-anchored (anchorZ), so postcard pixels need a real park at
     * the postcard line, not an override at scroll 0.
     */
    __AERO_OVERRIDE_MORPH__?: number;
    /**
     * Debug override (US-503): when a finite number, forces the airport scene's
     * climb-out `exit` (0..1) directly, bypassing the rect-derived direction signal —
     * the harness pokes it (independently of __AERO_OVERRIDE_MORPH__) to scrub the
     * whole {morph × exit} matrix. Unset/undefined ⇒ the rect map drives it.
     */
    __AERO_OVERRIDE_EXIT__?: number;
  }
}
