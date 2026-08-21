/**
 * Device-tier probe (US-008) — picks a quality tier at load and resolves the
 * `?tier=` debug override.
 *
 * Why: the scene's heavy knobs (rain density/speed, pixel-ratio cap, DOF,
 * post-FX) must scale to the hardware so weak
 * devices stay smooth and strong ones look their best (manual §7.4 / §14,
 * FR-20). One probe runs once at load, reading the shared renderer's OWN GL
 * context (no second context) plus screen/CPU/memory hints. An explicit
 * `?tier=high|medium|low` query override always wins — it is the deterministic
 * hook the browser-verification ACs need, and how US-009/US-010/US-012/US-040
 * exercise each tier without owning the matching hardware.
 *
 * The three tiers are also the upper rungs of the §14 fallback ladder
 * (full → reduced → poster → content-only): `high` = full scene, `medium` drops
 * DOF, `low` additionally drops post-FX. The poster / content-only
 * rungs live in SceneCanvas (reduced-motion + context-failure here) and US-047.
 */

export type TierName = 'high' | 'medium' | 'low';

/** The quality knobs every scene / post-pass reads (threaded via SceneContext). */
export interface DeviceTier {
  readonly name: TierName;
  /** Glyph-column count multiplier for the digital rain (US-009). */
  readonly rainDensity: number;
  /** Fall-speed multiplier for the digital rain (US-009; AC keeps speed tiered). */
  readonly rainSpeed: number;
  /** Ceiling for `renderer.setPixelRatio` (applied in engine.ts). */
  readonly pixelRatioCap: number;
  /** Depth-of-field post pass — capable tiers only (US-012). */
  readonly dof: boolean;
  /** The signature CRT / bloom post pass (US-012). */
  readonly postFx: boolean;
  /**
   * Per-glyph cell resolution (px) for the baked rain atlas (US-048 "textures
   * sized to tier"). The atlas is a colour-neutral mask sampled by grid cell, so a
   * lower cell size on weaker tiers shrinks the one fixed texture with no shader
   * change (the glyphs are small on screen). The big per-tier texture lever — the
   * drawing buffer and the post render targets — already scales via `pixelRatioCap`.
   */
  readonly atlasCellPx: number;
  /**
   * Scroll-velocity → camera "speed push" coupling strength, 0..1 (US-048). 1.0 is
   * the full desktop feel; weaker (mobile/low) tiers get a gentler push so a flick
   * never lurches the flight. Scales the rain scene's PUSH_GAIN/PUSH_MAX.
   */
  readonly velocityCoupling: number;
}

/** The three presets. Editing a knob here changes every scene that reads it. */
export const TIERS: Record<TierName, DeviceTier> = {
  high: {
    name: 'high',
    rainDensity: 1.0,
    rainSpeed: 1.0,
    pixelRatioCap: 2,
    dof: true,
    postFx: true,
    atlasCellPx: 48,
    velocityCoupling: 1.0,
  },
  medium: {
    name: 'medium',
    rainDensity: 0.66,
    rainSpeed: 0.9,
    pixelRatioCap: 1.5,
    dof: false,
    postFx: true,
    atlasCellPx: 40,
    velocityCoupling: 0.7,
  },
  low: {
    name: 'low',
    rainDensity: 0.4,
    rainSpeed: 0.8,
    pixelRatioCap: 1,
    dof: false,
    postFx: false,
    atlasCellPx: 32,
    velocityCoupling: 0.5,
  },
};

const TIER_NAMES: readonly TierName[] = ['high', 'medium', 'low'];

export type TierSource = 'probe' | 'override';

export interface TierResolution {
  readonly tier: DeviceTier;
  readonly source: TierSource;
  /** Unmasked GPU renderer string (or '' when the extension is blocked) — debug only. */
  readonly gpu: string;
}

type GL = WebGLRenderingContext | WebGL2RenderingContext;

/** Read the unmasked GPU renderer string, or '' when the extension is blocked. */
function readGpu(gl: GL): string {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return '';
    const value = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

/** Validate a raw `?tier=` value into a TierName, or null when absent/invalid. */
export function parseTierOverride(raw: string | null | undefined): TierName | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  return (TIER_NAMES as readonly string[]).includes(v) ? (v as TierName) : null;
}

/**
 * Score a tier from weakness signals: start at "high" and subtract for each sign
 * of weak hardware, then collapse the score back to a name. Heuristic by nature
 * — the GPU string is the strongest signal but browsers can mask it — which is
 * exactly why the `?tier=` override exists for deterministic testing.
 */
function scoreTier(gpuRaw: string): TierName {
  const gpu = gpuRaw.toLowerCase();
  const nav = navigator as Navigator & { deviceMemory?: number };
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory;

  let score = 2;
  // GPU family (strongest signal).
  if (/swiftshader|llvmpipe|software|microsoft basic|basic render/.test(gpu)) {
    score -= 2; // software rasteriser — present but slow
  } else if (/adreno|mali|powervr|apple gpu|videocore|tegra/.test(gpu)) {
    score -= 1; // mobile/low-power GPU
  } else if (/intel/.test(gpu) && !/\b(arc|iris xe)\b/.test(gpu)) {
    score -= 1; // older Intel integrated graphics
  }
  // Screen + CPU + memory hints.
  if (minSide <= 540) score -= 1; // phone-class viewport
  if (cores <= 4) score -= 1;
  if (typeof mem === 'number' && mem <= 4) score -= 1;

  if (score >= 2) return 'high';
  if (score >= 0) return 'medium';
  return 'low';
}

/**
 * Resolve the active tier from the renderer's GL context. An explicit override
 * (validated `?tier=`) wins; otherwise the heuristic probe decides. The returned
 * `gpu` string is carried for debug observability only.
 */
export function resolveTier(gl: GL, override: TierName | null): TierResolution {
  const gpu = readGpu(gl);
  if (override) return { tier: TIERS[override], source: 'override', gpu };
  return { tier: TIERS[scoreTier(gpu)], source: 'probe', gpu };
}
