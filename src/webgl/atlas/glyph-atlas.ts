/**
 * Glyph-atlas baker (US-009) — canvas-bakes the digital-rain glyph sheet.
 *
 * The Matrix rain samples ONE texture: a grid of glyphs (half-width katakana +
 * Latin + numerals, manual §7.1 / Appendix B) drawn white-on-black into a 2D
 * canvas and uploaded once as a Three texture. The fragment shader picks a cell
 * per screen-cell and tints it along the `--mx-*` ramp (P7) — so the atlas is
 * colour-NEUTRAL (white glyph mask in the red channel); all colour lives in the
 * shader.
 *
 * Determinism: katakana must look the SAME on every device — and render at all
 * in headless verification, where no CJK system font exists — so we DON'T trust
 * system fonts. A subset Noto Sans JP woff2 (SIL OFL 1.1 — self-hosting and
 * subsetting are permitted) is self-hosted (asset hygiene, §17; fetched once via
 * the Google Fonts `text=` subsetting endpoint to exactly the 92 baked glyphs)
 * and loaded via the FontFace API before the real bake. Until it resolves we
 * bake from a generic mono fallback so the scene is never blank;
 * `loadAtlasFont()` resolves and the scene re-bakes (see scenes/matrix.ts).
 */
import { CanvasTexture, LinearFilter, NoColorSpace, type Texture } from 'three';
import fontUrl from './noto-sans-jp-subset.woff2?url';

/** Half-width katakana (U+FF66–FF9D) + uppercase Latin + digits — the baked set. */
function buildGlyphs(): string {
  const digits = '0123456789';
  const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let kata = '';
  for (let c = 0xff66; c <= 0xff9d; c++) kata += String.fromCharCode(c);
  return digits + latin + kata;
}

export const GLYPHS = buildGlyphs();
export const GLYPH_COUNT = GLYPHS.length; // 92

/** Square-ish row-major grid that holds every glyph; mirrored by the shader. */
export const ATLAS_COLS = Math.ceil(Math.sqrt(GLYPH_COUNT)); // 10
export const ATLAS_ROWS = Math.ceil(GLYPH_COUNT / ATLAS_COLS); // 10

/** Default per-glyph cell resolution; tiers pass a smaller size (US-048, see DeviceTier.atlasCellPx). */
const DEFAULT_CELL_PX = 48;
/** Family registered for the self-hosted face; the fallback used until it loads. */
const ATLAS_FONT_FAMILY = 'NotoSansJPAtlas';
export const FALLBACK_FONT_FAMILY = 'monospace';

/**
 * Bake an arbitrary glyph set (white on black) into a `cols`×`rows` grid of
 * `cellPx`-resolution cells and wrap it as a colour-NEUTRAL Three texture (red
 * channel = mask). The shared primitive behind both atlases: the Matrix katakana
 * sheet (`bakeGlyphAtlas`) and the US-042 Note-rain musical-note sheet
 * (`bakeNoteAtlas`, note-atlas.ts) — the rain shader is glyph-agnostic, so a scene
 * swaps its falling characters just by baking a different set. `glyphs` is an
 * ARRAY (not a string) so astral-plane glyphs like 𝄞 (U+1D11E, a surrogate pair)
 * stay intact — never index a JS string by char position here. `cellPx` (US-048)
 * sizes the texture to the device tier; the grid + shader sampling are unchanged.
 */
export function bakeGlyphSheet(
  glyphs: readonly string[],
  cols: number,
  rows: number,
  fontFamily: string,
  cellPx: number = DEFAULT_CELL_PX,
): Texture {
  const w = cols * cellPx;
  const h = rows * cellPx;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('glyph-atlas: 2D context unavailable');

  // Opaque black sheet → the shader reads the red channel as a 0..1 glyph mask
  // (gap = void, glyph = tint), sidestepping premultiplied-alpha pitfalls.
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.round(cellPx * 0.78)}px ${fontFamily}`;

  for (let i = 0; i < glyphs.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    g.fillText(glyphs[i]!, col * cellPx + cellPx / 2, row * cellPx + cellPx / 2);
  }

  const texture = new CanvasTexture(canvas);
  // Mask data, not colour: skip colour-space conversion and mipmaps; one sharp
  // bilinear sample. flipY=false so canvas row 0 maps to v=0 (top) — the shader
  // assumes top-down atlas rows.
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  return texture;
}

/**
 * Draw every Matrix glyph into the sheet. `fontFamily` selects which loaded face
 * to bake from; before the self-hosted face resolves the caller passes the mono
 * fallback so output stays valid (Latin/numerals from the system mono face,
 * katakana filled on re-bake). Spreading the string yields one entry per code
 * point (all BMP here), identical to the previous per-char draws. `cellPx`
 * (US-048) sizes the sheet to the device tier.
 */
export function bakeGlyphAtlas(fontFamily: string, cellPx?: number): Texture {
  return bakeGlyphSheet([...GLYPHS], ATLAS_COLS, ATLAS_ROWS, fontFamily, cellPx);
}

let fontPromise: Promise<string> | null = null;

/**
 * Load the self-hosted subset once and register it on `document.fonts`. Resolves
 * to the family name to bake from, or to the mono fallback if the load fails
 * (the scene still renders — Latin/numerals from the system mono face). Idempotent.
 */
export function loadAtlasFont(): Promise<string> {
  if (fontPromise) return fontPromise;
  if (typeof FontFace === 'undefined') {
    fontPromise = Promise.resolve(FALLBACK_FONT_FAMILY);
    return fontPromise;
  }
  const face = new FontFace(ATLAS_FONT_FAMILY, `url(${fontUrl}) format('woff2')`);
  fontPromise = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      return ATLAS_FONT_FAMILY;
    })
    .catch(() => FALLBACK_FONT_FAMILY);
  return fontPromise;
}
