/**
 * Theme ramps as numeric hexes for Three.js (manual Appendix A, P7).
 *
 * The CSS custom properties (`--mx-*` / `--sky-*` / `--note-*`) are the canonical
 * token home (theme.css, US-028); these mirror the same Appendix-A values for the
 * GL layer, where a numeric colour is required. Keeping them in one module means
 * scenes never hand-write magic hexes — palette discipline (P7) stays mechanical.
 */

/* --- Matrix (global) — core #050805 (void) + #00FF41 (phosphor green) --------- */
export const MX_VOID = 0x050805;
export const MX_GREEN = 0x00ff41;
export const MX_GREEN_MID = 0x00b82e;
export const MX_GREEN_DIM = 0x008f11;
export const MX_GREEN_FAR = 0x003b00;
export const MX_GREEN_HI = 0xc7ffd0;

/* --- Sky (aeronautics, US-040) — core #7FB2E8 (sky blue) + #F4C27A (warm sun) - */
export const SKY_BLUE = 0x7fb2e8;
export const SKY_HAZE = 0xdcebfb;
export const SKY_SUN = 0xf4c27a;
export const SKY_INK = 0x1b2a3a;
/* G1000 synthetic-vision terrain/airport ramp (US-301 SVT extension of the US-040 sky ramp) */
export const SKY_TERRAIN_LOW = 0x4e7d46;
export const SKY_TERRAIN_HIGH = 0x8a6b45;
export const SKY_TERRAIN_LINE = 0x2e4633;
export const SKY_RUNWAY = 0x565b63;
export const SKY_RUNWAY_MARK = 0xf2f4f6;
export const SKY_STRUCTURE = 0xb9c4cf;
export const SKY_HANGAR_RED = 0xc0392b;

/* --- Note-rain (music, US-042) — Matrix-adjacent: the void + phosphor-green of
   the rain are SHARED with Matrix (void/green/dim/hi mirror the --mx-* values),
   the only differentiator being the violet ACCENT (#9B7BFF) carried subtly on the
   falling note heads (amplitude-driven once audio lands, US-043). The terrain
   keeps the Matrix green ramp (MX_GREEN_MID / MX_GREEN_FAR) — same wireframe world,
   just musical glyphs raining over it. ----------------------------------------- */
export const NOTE_VOID = 0x050805;
export const NOTE_GREEN = 0x00ff41;
export const NOTE_ACCENT = 0x9b7bff;
export const NOTE_DIM = 0x008f11;
export const NOTE_HI = 0xc7ffd0;
/* Violet WebGL environment ramp (US-405) — mirrors theme.css --note-head/-mid/-far.
   The Note scene's rain heads, terrain lines and fog run on this ramp; body stays
   NOTE_ACCENT (#9B7BFF). UI keeps the green NOTE_* tokens above. */
export const NOTE_HEAD = 0xede6ff;
export const NOTE_MID = 0x6e4fd8;
export const NOTE_FAR = 0x241543;
