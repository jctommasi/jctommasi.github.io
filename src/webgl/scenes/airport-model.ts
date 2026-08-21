/**
 * Airport model (US-304, PRD prd-aeronautics-airport-g1000) — the small 3D airport
 * that emerges on the valley floor when the aeronautics zone morphs to G1000 SVT.
 *
 * A single Object3D group of low-poly Three primitives (a few hundred triangles):
 *   - a runway aligned with the flight axis (Z), its 01/19 markings baked ONCE into
 *     a CanvasTexture with a self-hosted face (US-009 font-determinism — renders the
 *     same headless, no system-font dependency);
 *   - an apron/taxiway quad;
 *   - one hangar (box base + gable roof, static red/white striped) on the +X apron
 *     side and one control tower (shaft + cab) on the −X side of the runway.
 * All flat `--sky-*` palette colours (P7), STATIC (no blinking lights — §15). The
 * group has no per-frame allocation: the scene positions it and drives it (setMorph)
 * each frame; the terrain flatten under it lives in terrain.vert.glsl and is driven
 * from the SAME anchor in lockstep (scenes/rain-scene.ts, US-105 rule).
 *
 * US-502 — PROGRESSIVE PAINT SWEEP: the structures' fills are no longer flat
 * MeshBasicMaterials but ONE shared paint program (shaders/airport-paint.*.glsl,
 * per-mesh uniform sets) that PAINTS the colour into the wireframe spatially —
 * bottom-up on the buildings (world-up coordinate, so the 45°-rotated roof behaves)
 * and along the strip on runway/apron (local length axis) — staggered runway →
 * apron → hangar → tower. Unpainted fragments DISCARD (no depth writes ⇒ the
 * not-yet-painted volume is genuinely see-through), the fills carry polygonOffset so
 * the coplanar edge lines stay crisp mid-sweep, and the wireframe twins fade out as
 * the sweep completes so the morph-1 postcard is the US-404 solid framing with zero
 * wireframe residue. Everything is a pure function of the scroll-derived morph
 * (§15 — no uTime, static at rest, reverses symmetrically).
 *
 * US-501 — WIREFRAME TWINS (the airport enters fully DRAWN, no opacity fade-in):
 * every structure carries a green Matrix wireframe twin in the SAME group, so the
 * airport rises into frame already 100 % drawn instead of as a semi-transparent
 * ghost (the old whole-model `opacity = min(1, morph / OPAQUE_BY)` is GONE). Boxes
 * get `EdgesGeometry` silhouettes (clean edges, no triangle diagonals); runway and
 * apron get SEGMENTED-plane grids (`wireframe:true`, diagonals included) so the
 * strip reads in the terrain's gridded-mesh language. The twins share their fill
 * mesh's transform, so they track the model group exactly through the position
 * lerp. Line colour is MX_GREEN (P7 — the only non-`--sky-*` palette import here);
 * the materials are `transparent` with opacity 1 for now, which US-502 fades out as
 * its spatial paint sweep completes.
 *
 * US-503 — DIRECTION-AWARE EXIT: `setMorph(morph, exit)` takes the scene's climb-out
 * signal (0 on entry and through the postcard hold, →1 at the sky→note flip) and
 * lerps the wireframe colour MX_GREEN → NOTE_MID, so the skeleton the draining paint
 * re-reveals is already violet when the US-044 scene crossfade hands over to the Note
 * world. Pre-allocated Colors, no per-frame allocation; exit 0 is a strict no-op.
 *
 * US-505 — STRUCTURAL DETAIL PASS: tower and hangar are massed out of DISTINCT
 * prisms (tower: plinth / shaft ledge / gallery / four cab corner posts / cab roof /
 * mast / beacon; hangar: foundation / door / window band / ridge cap) rather than
 * one box each. EdgesGeometry only emits edges where adjacent-face normals differ —
 * subdividing a box adds NO lines — so the richer wireframe read must come from
 * separate boxes, each contributing its own silhouette. Every new face sits proud
 * of / sunk into its host by ≥0.2 (never coplanar ⇒ no z-fighting), nothing is
 * rotated (zero interaction with the roof's 45° planes), and nothing lands on the
 * hangar's pre-existing coplanar z=2 gable plane. All parts ride the existing
 * helpers (add/mat/addEdges/band), inheriting the paint sweep, the wireframe twin +
 * fade, and the violet exit tint for free.
 */
import {
  Object3D,
  Mesh,
  LineSegments,
  EdgesGeometry,
  LineBasicMaterial,
  PlaneGeometry,
  BoxGeometry,
  MeshBasicMaterial,
  ShaderMaterial,
  CanvasTexture,
  Color,
  LinearFilter,
  NoColorSpace,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import spaceMonoUrl from '../../theme/fonts/space-mono-700.woff2?url';
import paintVertexShader from '../shaders/airport-paint.vert.glsl?raw';
import paintFragmentShader from '../shaders/airport-paint.frag.glsl?raw';
import {
  MX_GREEN,
  NOTE_MID,
  SKY_RUNWAY,
  SKY_RUNWAY_MARK,
  SKY_STRUCTURE,
  SKY_HANGAR_RED,
} from '../palette';

/** Level field elevation — MUST match FIELD_Y in shaders/terrain.vert.glsl. */
export const FIELD_Y = 2.0;

/** Runway footprint (world units): fits the |x|<10 valley floor and the flat field. */
const RW_WIDTH = 18;
const RW_LENGTH = 132;

/** Self-hosted face for the 01/19 numbers (determinism, US-009); mono fallback first. */
const RUNWAY_FONT_FAMILY = 'AirportRunway';
const FALLBACK_FONT_FAMILY = 'monospace';

/** `#rrggbb` from a palette hex, for the 2D canvas. */
function css(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/**
 * Bake the runway surface + markings (centreline dashes, threshold bars, reciprocal
 * 01 / 19 numbers at opposite ends) into one CanvasTexture. `fontFamily` selects the
 * loaded face; the fallback mono is used until the self-hosted face resolves.
 */
function bakeRunwayTexture(fontFamily: string): CanvasTexture {
  const W = 256;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('airport: 2D context unavailable');

  g.fillStyle = css(SKY_RUNWAY);
  g.fillRect(0, 0, W, H);
  g.fillStyle = css(SKY_RUNWAY_MARK);

  // Threshold "piano-key" bars at each end.
  const bars = 6;
  const barW = 18;
  const barGap = 12;
  const barLen = 90;
  const bx0 = (W - (bars * barW + (bars - 1) * barGap)) / 2;
  for (let i = 0; i < bars; i++) {
    const x = bx0 + i * (barW + barGap);
    g.fillRect(x, 40, barW, barLen);
    g.fillRect(x, H - 40 - barLen, barW, barLen);
  }

  // Centreline dashes down the middle.
  const dashW = 10;
  const dashLen = 60;
  const dashGap = 60;
  for (let y = 210; y < H - 210; y += dashLen + dashGap) {
    g.fillRect((W - dashW) / 2, y, dashW, dashLen);
  }

  // Reciprocal numbers, each read from its own approach → the far end rotated 180°.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 128px ${fontFamily}`;
  g.fillText('01', W / 2, H - 175);
  g.save();
  g.translate(W / 2, 175);
  g.rotate(Math.PI);
  g.fillText('19', 0, 0);
  g.restore();

  const tex = new CanvasTexture(canvas);
  // US-502: the paint program is a bare ShaderMaterial (no output colour-management),
  // so the map must NOT be sRGB-decoded on read — NoColorSpace passes the baked hexes
  // through raw, the engine convention (P7).
  tex.colorSpace = NoColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Bake the hangar roof's static red/white stripes (white base = SKY_RUNWAY_MARK,
 * red = SKY_HANGAR_RED) into one CanvasTexture. Vertical canvas stripes land
 * perpendicular to the ridge on the roof slope faces. No lights, no animation (§15).
 */
function bakeHangarRoofTexture(): CanvasTexture {
  const W = 128;
  const H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('airport: 2D context unavailable');

  g.fillStyle = css(SKY_RUNWAY_MARK);
  g.fillRect(0, 0, W, H);
  g.fillStyle = css(SKY_HANGAR_RED);
  const stripes = 6;
  const sw = W / (stripes * 2);
  for (let i = 0; i < stripes; i++) g.fillRect((2 * i + 1) * sw, 0, sw, H);

  const tex = new CanvasTexture(canvas);
  // US-502: the paint program is a bare ShaderMaterial (no output colour-management),
  // so the map must NOT be sRGB-decoded on read — NoColorSpace passes the baked hexes
  // through raw, the engine convention (P7).
  tex.colorSpace = NoColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * US-502 paint ramp: the global paint progress derived from the SVT morph. The
 * airport is already fully DRAWN as wireframe when it rises (US-501); the colour
 * only starts flowing in once the approach is well under way and completes just
 * before the postcard hold. Scroll-scrubbed ⇒ reverses symmetrically and is STATIC
 * at rest (§15 — a pure function of morph, no uTime). US-506 lowered the start
 * 0.30 → 0.22 so the sweep spans more of the shortened morph-in ramp (0.88→0.55vh)
 * and still reads gradual per scrolled pixel.
 */
const PAINT_START = 0.22;
const PAINT_END = 0.95;

/**
 * Per-structure stagger windows over the global paint progress (owner-confirmed
 * order runway → apron → hangar → tower). They OVERLAP so the sweep reads as one
 * continuous move across the field rather than four separate fills; the last band
 * closes before LINE_FADE_START so the wireframe hand-off happens on a fully
 * painted airport. Numeric values are eyeball tuning.
 */
const BAND_RUNWAY: [number, number] = [0.0, 0.4];
const BAND_APRON: [number, number] = [0.12, 0.52];
const BAND_HANGAR: [number, number] = [0.34, 0.7];
const BAND_TOWER: [number, number] = [0.52, 0.85];

/** Wireframe hand-off: the twins fade out as the paint completes → zero residue at 1. */
const LINE_FADE_START = 0.85;
const LINE_FADE_END = 1.0;

/**
 * US-503 exit tint — the wireframe endpoints of the climb-out hand-over. Both are
 * pre-allocated module-level Colors (the engine-wide no-per-frame-allocation rule):
 * `setMorph` lerps between them into each line material's own `color` in place.
 * Built-in materials (LineBasicMaterial / MeshBasicMaterial) DO colour-manage, so
 * the plain `new Color(hex)` round-trip is net identity here — unlike the bare
 * ShaderMaterial fills, which take raw sRGB vec3s (see `rgb()` below).
 */
const LINE_GREEN = new Color(MX_GREEN);
const LINE_VIOLET = new Color(NOTE_MID);

/** Paint-coordinate modes (must match uAxisMode in airport-paint.vert.glsl). */
const AXIS_LENGTH = 0; // strips: the mesh's local length axis (paint runs along it)
const AXIS_WORLD_UP = 1; // buildings: world-up (survives the roof's 45° rotation)

/** GLSL-style smoothstep (Hermite ease between two edges). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** sRGB-normalised vec3 straight from a palette hex — the engine's raw-colour rule:
 * a bare ShaderMaterial does no output colour-management, so the hex must NOT go
 * through Three's `Color` (which would sRGB→linear it) to reach the screen intact. */
function rgb(hex: number): Vector3 {
  return new Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

export interface AirportModel {
  /** The group to add to the scene; positioned + driven by the scene each frame. */
  readonly object: Object3D;
  /** US-502: live global paint progress (0 = bare wireframe, 1 = solid postcard). */
  readonly paint: number;
  /**
   * Drive the airport with the SVT morph (0 = out of the world, 1 = solid) and the
   * US-503 climb-out `exit` (0 = entry/postcard → green Matrix wireframe, 1 = the
   * sky→note flip → violet Note wireframe). `exit` defaults to 0 (no-op).
   */
  setMorph(morph: number, exit?: number): void;
  /**
   * US-1502 — drive the fills' terrain-matched fog: the swallow-scaled exponential
   * density and the terrain's live fog colour mix (raw sRGB — the scene computes it
   * from the SAME palette constants the terrain fog uniforms use). Copied in place
   * into every paint-material uniform set; zero per-frame allocation. The wireframe
   * twins fog separately via scene.fog (FogExp2), set by the scene.
   */
  setFog(density: number, color: Vector3): void;
  /** Dispose every geometry / material / texture. */
  dispose(): void;
}

export function createAirportModel(): AirportModel {
  const group = new Object3D();
  const geometries: BufferGeometry[] = [];
  /** US-502 paint program instances — one uniform set per mesh, one shared program. */
  const fillMaterials: ShaderMaterial[] = [];
  /**
   * US-501 wireframe twins — faded together by US-502 at paint completion and tinted
   * green→violet together by US-503 on the climb-out. Typed to the two built-in
   * materials actually used (both carry `.color` + `.opacity`).
   */
  const lineMaterials: (LineBasicMaterial | MeshBasicMaterial)[] = [];
  let runwayTexture: Texture | null = null;
  let roofTexture: Texture | null = null;
  let paint = 0;
  let disposed = false;

  /**
   * US-502 — one instance of the shared paint program for a structure face. Same
   * vertex/fragment source for every mesh (ONE program), its own uniform set (colour,
   * optional map, paint coordinate range + stagger band, assigned by `band()` once
   * the geometry exists). `transparent` carries the narrow soft edge of the paint
   * front; unpainted fragments discard in the shader, so nothing behind an unpainted
   * face is occluded. polygonOffset pushes the fill a hair back in depth so the
   * coplanar US-501 edge lines stay crisp while the sweep runs over them.
   */
  function mat(color: number, depthWrite = true, map?: Texture): ShaderMaterial {
    const m = new ShaderMaterial({
      vertexShader: paintVertexShader,
      fragmentShader: paintFragmentShader,
      uniforms: {
        uColor: { value: rgb(color) },
        uMap: { value: map ?? null },
        uHasMap: { value: map ? 1 : 0 },
        uMin: { value: 0 },
        uMax: { value: 1 },
        uPaint: { value: 0 },
        uBandLo: { value: 0 },
        uBandHi: { value: 1 },
        uAxisMode: { value: AXIS_WORLD_UP },
        uOriginY: { value: 0 },
        // US-1502 terrain-matched fog — no-op-safe defaults (density 0 ⇒ fog 0):
        // the scene drives both per frame via setFog() (aero only). Raw sRGB vec3
        // (the bare-ShaderMaterial rule), written in place — zero allocation.
        uFogColor: { value: new Vector3(0, 0, 0) },
        uFogDensity: { value: 0 },
      },
      transparent: true,
      depthWrite,
      // Push the fill a constant hair BACK so the coplanar US-501 edge lines stay
      // crisp over it mid-sweep. UNITS ONLY (factor 0): the slope-scaled term blows
      // up on the near-horizontal strips seen at a grazing angle — at 360 px the
      // vertical resolution is low enough that factor 1 pushed the runway/apron
      // clean BEHIND the terrain depth mask and they vanished. A units offset is
      // resolution- and slope-independent, and coincident line/fill geometry only
      // needs a couple of depth units to separate.
      polygonOffset: true,
      polygonOffsetFactor: 0,
      polygonOffsetUnits: 2,
    });
    fillMaterials.push(m);
    return m;
  }

  function add(geometry: BufferGeometry, material: ShaderMaterial): Mesh {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    // Draw after the fill (-1.5) and the x-ray wireframe grid (0), so the airport
    // sits over the SVT terrain rather than being crossed by grid lines.
    mesh.renderOrder = 2;
    group.add(mesh);
    return mesh;
  }

  /**
   * US-502 — assign one structure's paint window. The coordinate RANGE is measured
   * across ALL the meshes of the structure (hangar base + roof, tower shaft + cab)
   * so a single front sweeps the whole thing continuously instead of restarting per
   * mesh. `AXIS_WORLD_UP` measures in group space (the group is translation-only, so
   * the shader's `world.y - uOriginY` is exactly this); `AXIS_LENGTH` measures the
   * untransformed local length axis.
   */
  function band(meshes: Mesh[], [lo, hi]: [number, number], axisMode: number): void {
    let min = Infinity;
    let max = -Infinity;
    for (const mesh of meshes) {
      mesh.updateMatrix();
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!.clone();
      if (axisMode === AXIS_WORLD_UP) box.applyMatrix4(mesh.matrix);
      min = Math.min(min, box.min.y);
      max = Math.max(max, box.max.y);
    }
    for (const mesh of meshes) {
      const u = (mesh.material as ShaderMaterial).uniforms;
      u.uMin!.value = min;
      u.uMax!.value = max;
      u.uBandLo!.value = lo;
      u.uBandHi!.value = hi;
      u.uAxisMode!.value = axisMode;
    }
  }

  /**
   * US-1502 — make scene.fog ALSO fade the twin's alpha. Three's built-in fog chunk
   * only CONVERGES gl_FragColor.rgb toward the fog colour; an opaque fog-coloured
   * line over a brighter backdrop (terrain wireframe, rain glyphs) would still read
   * as a dark silhouette — the terrain fixed exactly this with `vec4(color, 1-fog)`
   * (terrain.frag.glsl), so the twins get the same treatment by appending an alpha
   * multiply right after the stock `#include <fog_fragment>` (fogFactor is the
   * chunk's own FogExp2 term, already in scope — the identical formula the terrain
   * and the paint program use). Compiled once; no per-frame cost. When scene.fog is
   * null (Matrix/Note never set it) USE_FOG is undefined and this is dead text —
   * those scenes stay byte-identical by construction.
   */
  function fogFadesAlpha(m: LineBasicMaterial | MeshBasicMaterial): void {
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        '#include <fog_fragment>\n#ifdef USE_FOG\n\tgl_FragColor.a *= ( 1.0 - fogFactor );\n#endif',
      );
    };
  }

  /**
   * US-501 — the green Matrix wireframe twin of a BOX structure: `EdgesGeometry`
   * keeps only the silhouette edges (no triangle diagonals) and the twin copies its
   * fill mesh's transform, so it tracks the model group exactly (incl. the roof's
   * 45° rotation). depthWrite:false + depthTest:true ⇒ the lines never occlude
   * anything themselves but ARE occluded by the terrain depth mask (US-105), and
   * renderOrder 3 draws them just above the fill meshes (2).
   */
  function addEdges(mesh: Mesh): LineSegments {
    const edges = new EdgesGeometry(mesh.geometry);
    geometries.push(edges);
    const m = new LineBasicMaterial({
      color: MX_GREEN,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
    });
    fogFadesAlpha(m); // US-1502: scene.fog attenuates alpha too (terrain parity)
    lineMaterials.push(m);
    const twin = new LineSegments(edges, m);
    twin.position.copy(mesh.position);
    twin.rotation.copy(mesh.rotation);
    twin.frustumCulled = false;
    twin.renderOrder = 3;
    group.add(twin);
    return twin;
  }

  /**
   * US-501 — the wireframe twin of a flat STRIP (runway / apron): a segmented plane
   * drawn `wireframe:true`, so it reads as a Matrix grid (diagonals included, the
   * terrain's gridded-mesh language) rather than a bare outline.
   */
  function addGrid(mesh: Mesh, width: number, length: number, segX: number, segZ: number): Mesh {
    const geo = new PlaneGeometry(width, length, segX, segZ);
    geometries.push(geo);
    const m = new MeshBasicMaterial({
      color: MX_GREEN,
      wireframe: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
    });
    fogFadesAlpha(m); // US-1502: scene.fog attenuates alpha too (terrain parity)
    lineMaterials.push(m);
    const twin = new Mesh(geo, m);
    twin.position.copy(mesh.position);
    twin.rotation.copy(mesh.rotation);
    twin.frustumCulled = false;
    twin.renderOrder = 3;
    group.add(twin);
    return twin;
  }

  // Runway — a flat strip along Z (the flight axis). depthWrite:false so it never
  // z-fights the level terrain fill it sits on (lifted a hair above the field).
  runwayTexture = bakeRunwayTexture(FALLBACK_FONT_FAMILY);
  const runwayMat = mat(0xffffff, false, runwayTexture);
  const runway = add(new PlaneGeometry(RW_WIDTH, RW_LENGTH), runwayMat);
  runway.rotation.x = -Math.PI / 2;
  runway.position.y = 0.3;
  addGrid(runway, RW_WIDTH, RW_LENGTH, 3, 22);

  const APRON_X = RW_WIDTH / 2 + 17;

  // Apron / taxiway quad on the +X side, connecting the structures to the runway.
  const apron = add(new PlaneGeometry(30, 78), mat(SKY_RUNWAY, false));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(APRON_X, 0.2, -6);
  addGrid(apron, 30, 78, 3, 8);

  // One hangar (box base + gable roof) on the +X apron side. The gable is a box
  // rotated 45° about the Z (length) axis: its upper half reads as a ridged roof,
  // its lower half is buried in the base / below the field. Low-poly + clean.
  // Light walls (SKY_STRUCTURE); static red/white striped roof (SKY_HANGAR_RED, §15).
  const HANGAR_Z = -4;
  const base = add(new BoxGeometry(14, 5, 12), mat(SKY_STRUCTURE));
  base.position.set(APRON_X, 2.5, HANGAR_Z);
  addEdges(base);
  roofTexture = bakeHangarRoofTexture();
  const roof = add(new BoxGeometry(10, 10, 12), mat(0xffffff, true, roofTexture));
  roof.rotation.z = Math.PI / 4; // diamond cross-section → gable ridge along Z
  roof.position.set(APRON_X, 5, HANGAR_Z);
  addEdges(roof); // inherits the 45° rotation → the gable silhouette, not a box

  // US-505 hangar massing — foundation, runway-facing door, gable-end window band,
  // ridge cap. Distinct prisms (EdgesGeometry emits nothing for coplanar
  // subdivisions); every face proud/sunk ≥0.2 from its host so nothing z-fights,
  // and nothing sits ON the pre-existing coplanar base/roof gable plane at z = 2.
  const foundation = add(new BoxGeometry(15.5, 0.9, 13.5), mat(SKY_RUNWAY));
  foundation.position.set(APRON_X, 0.45, HANGAR_Z);
  addEdges(foundation);
  // Door slab on the −X face (toward the runway): straddles the wall at x = 19
  // (proud 0.4 / sunk 0.2), bottom buried in the foundation.
  const door = add(new BoxGeometry(0.6, 4, 8), mat(SKY_RUNWAY));
  door.position.set(APRON_X - 7.1, 2.4, HANGAR_Z);
  addEdges(door);
  // Strip-window band on the +Z gable end (the camera-facing side); its own faces
  // at z 1.8 / 2.3 straddle — never touch — the z = 2 wall plane.
  const windowBand = add(new BoxGeometry(9, 1.8, 0.5), mat(SKY_RUNWAY));
  windowBand.position.set(APRON_X, 3.2, HANGAR_Z + 6.05);
  addEdges(windowBand);
  // Axis-aligned ridge cap swallowing the roof apex wedge (apex halfwidth ≈0.42 <
  // cap half 0.7) — deliberately NOT rotated, so it shares no plane with the 45°
  // roof slopes.
  const ridgeCap = add(new BoxGeometry(1.4, 0.9, 13), mat(SKY_HANGAR_RED));
  ridgeCap.position.set(APRON_X, 12.1, HANGAR_Z);
  addEdges(ridgeCap);

  // Control tower on the −X side of the runway (mirror of the apron distance): a
  // slim shaft with a wider cab on top.
  const TOWER_X = -APRON_X;
  const TOWER_Z = -34;
  const shaft = add(new BoxGeometry(4, 20, 4), mat(SKY_STRUCTURE));
  shaft.position.set(TOWER_X, 10, TOWER_Z);
  addEdges(shaft);
  const cab = add(new BoxGeometry(8, 5, 8), mat(SKY_RUNWAY));
  cab.position.set(TOWER_X, 22, TOWER_Z);
  addEdges(cab);

  // US-505 tower massing (same distinct-prism rule as the hangar): plinth, shaft
  // ledge, gallery under the cab, four corner posts framing the dark cab as
  // glazing, overhanging cab roof, antenna mast, beacon. The gallery/roof slabs
  // overhang the shaft by design; the cab already sits ON the |x|<30 flatten edge,
  // so their 0.75 overhang reaches only into the 50-unit terrain skirt (same class
  // as the hangar base at x=33). Keep parts ≥~0.5 units — thinner stops resolving
  // at 360 px.
  const plinth = add(new BoxGeometry(7, 2, 7), mat(SKY_RUNWAY));
  plinth.position.set(TOWER_X, 1, TOWER_Z);
  addEdges(plinth);
  const ledge = add(new BoxGeometry(5.2, 0.6, 5.2), mat(SKY_STRUCTURE));
  ledge.position.set(TOWER_X, 10.5, TOWER_Z);
  addEdges(ledge);
  const gallery = add(new BoxGeometry(9.5, 1, 9.5), mat(SKY_STRUCTURE));
  gallery.position.set(TOWER_X, 19.2, TOWER_Z);
  addEdges(gallery);
  const mullions: Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Corner posts straddle the cab corners (faces at ±3.5/±4.2 vs the cab's ±4).
      const post = add(new BoxGeometry(0.7, 5.5, 0.7), mat(SKY_STRUCTURE));
      post.position.set(TOWER_X + sx * 3.85, 22.15, TOWER_Z + sz * 3.85);
      addEdges(post);
      mullions.push(post);
    }
  }
  const cabRoof = add(new BoxGeometry(9.5, 0.7, 9.5), mat(SKY_STRUCTURE));
  cabRoof.position.set(TOWER_X, 24.65, TOWER_Z);
  addEdges(cabRoof);
  const mast = add(new BoxGeometry(0.5, 5, 0.5), mat(SKY_STRUCTURE));
  mast.position.set(TOWER_X, 27.2, TOWER_Z);
  addEdges(mast);
  // STATIC red beacon (§15 — no blinking); the last thing the sweep paints.
  const beacon = add(new BoxGeometry(0.9, 0.9, 0.9), mat(SKY_HANGAR_RED));
  beacon.position.set(TOWER_X, 30, TOWER_Z);
  addEdges(beacon);

  // US-502 — the stagger: runway → apron → hangar → tower (owner-confirmed order).
  // Strips paint ALONG their length (local +Y runs down the strip, and since the near
  // end is local −Y the front travels from the camera outward); the buildings paint
  // bottom-up in world space, EVERY prism of a structure sharing one range (US-505)
  // so the front crosses the whole massing without restarting. New parts MUST join
  // their structure's band() call — mat()'s defaults paint wrongly otherwise.
  band([runway], BAND_RUNWAY, AXIS_LENGTH);
  band([apron], BAND_APRON, AXIS_LENGTH);
  band([base, roof, foundation, door, windowBand, ridgeCap], BAND_HANGAR, AXIS_WORLD_UP);
  band([shaft, cab, plinth, ledge, gallery, ...mullions, cabRoof, mast, beacon], BAND_TOWER, AXIS_WORLD_UP);

  // Swap in the deterministic runway numbers once the self-hosted face resolves.
  if (typeof FontFace !== 'undefined') {
    const face = new FontFace(RUNWAY_FONT_FAMILY, `url(${spaceMonoUrl}) format('woff2')`);
    void face
      .load()
      .then((loaded) => {
        if (disposed) return;
        document.fonts.add(loaded);
        const next = bakeRunwayTexture(RUNWAY_FONT_FAMILY);
        // US-502: the map is a uniform now (paint ShaderMaterial), not `material.map`.
        runwayMat.uniforms.uMap!.value = next;
        runwayTexture?.dispose();
        runwayTexture = next;
      })
      .catch(() => {
        /* keep the mono fallback — still legible, still deterministic-ish */
      });
  }

  return {
    object: group,
    get paint() {
      return paint;
    },
    setMorph(morph: number, exit = 0) {
      const m = Math.max(0, Math.min(1, morph));
      const e = Math.max(0, Math.min(1, exit));
      // The whole group leaves the world at morph 0 — the airport is an approach-only
      // structure (owner call): no wireframe hanging under the Matrix-cruise framing.
      group.visible = m > 0.001;
      // US-502 — the spatial paint sweep. One global progress drives every mesh; each
      // remaps it through its own stagger band and resolves the front in the shader,
      // so there is no per-frame allocation and nothing is time-driven (§15).
      paint = smoothstep(PAINT_START, PAINT_END, m);
      // The group is translation-only, so its world Y is the origin the world-up paint
      // coordinate is measured from (the scene sets the position before this call).
      const originY = group.position.y;
      for (const mat of fillMaterials) {
        mat.uniforms.uPaint!.value = paint;
        mat.uniforms.uOriginY!.value = originY;
      }
      // Wireframe hand-off: the twins carry the structure until the paint completes,
      // then fade out so the morph-1 postcard has ZERO wireframe residue. Reversing
      // the scrub re-reveals them (a pure function of paint, no state).
      const lineOpacity = 1 - smoothstep(LINE_FADE_START, LINE_FADE_END, paint);
      // US-503 hand-over tint: on the climb-out the paint drains (free — `paint`
      // follows `morph`, which falls through the exit window) and the re-revealed
      // skeleton lerps MX_GREEN → NOTE_MID with `exit`, so the sky→note crossfade
      // dissolves violet→violet. `lerpColors` writes in place into each material's
      // own Color — no per-frame allocation. exit 0 ⇒ exactly MX_GREEN (no-op).
      for (const mat of lineMaterials) {
        mat.opacity = lineOpacity;
        mat.color.lerpColors(LINE_GREEN, LINE_VIOLET, e);
      }
    },
    setFog(density: number, color: Vector3) {
      for (const m of fillMaterials) {
        m.uniforms.uFogDensity!.value = density;
        (m.uniforms.uFogColor!.value as Vector3).copy(color);
      }
    },
    dispose() {
      disposed = true;
      for (const g of geometries) g.dispose();
      for (const m of fillMaterials) m.dispose();
      for (const m of lineMaterials) m.dispose();
      runwayTexture?.dispose();
      runwayTexture = null;
      roofTexture?.dispose();
      roofTexture = null;
    },
  };
}
