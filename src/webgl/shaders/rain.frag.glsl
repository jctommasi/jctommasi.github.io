// Ripple-glyph fragment stage (US-051, manual §7.1) — REPLACES the vertical rain.
//
// One screen-space pass, no geometry, bounded cost: instead of columns of glyphs
// falling top→bottom, the backdrop now reads as raindrops on a surface — glyphs
// bloom in expanding concentric RINGS from pseudo-random impact points across the
// WHOLE backdrop, each ring growing to a random max radius and FADING as it grows.
//
// Two grids keep the cost ~the old rain's (≈ a handful of hashes + 1 atlas sample):
//   • a coarse SPAWN-ZONE grid — each zone emits one drop per hashed period at a
//     hashed sub-position with a hashed max radius / amplitude (re-rolled each
//     cycle so a zone doesn't always splash on the same spot). A bounded 3×3
//     neighbourhood of zones is checked so rings cross zone borders seamlessly.
//   • a finer GLYPH-CELL grid — samples the existing atlas (red channel = mask);
//     the glyph cycles slowly over time (low flicker rate — motion safety §15).
// Ring brightness is sampled at the cell CENTRE so whole glyphs light up coherently
// (a ring of discrete glyphs, not a smooth band).
//
// Cell density (uCellDensity) and drop density (uZoneDensity) are tier-scaled
// (US-008/US-048). Colours are the --mx-* / --note-* ramp only (P7): trail→body→
// head bloom (uHead), with the Note-rain violet (uAccent) mixed in where
// uAccentStrength>0 (0 on Matrix → byte-identical pure green, US-042/US-053).
// uIntensity is the master activity scalar (1.0 = ambient; scroll US-052 + audio
// US-054 raise it). `precision` is injected by Three's ShaderMaterial — do NOT
// redeclare it.
varying vec2 vUv;

uniform float uTime;        // elapsed active seconds (clamped-delta loop)
uniform vec2  uResolution;  // physical drawing-buffer px
uniform sampler2D uAtlas;   // baked glyph sheet (red channel = mask)
uniform vec2  uAtlasGrid;   // (cols, rows) of the atlas sheet
uniform float uGlyphCount;  // glyphs actually present (row-major)
uniform float uCellDensity; // glyph cells across the viewport width (tier-scaled)
uniform float uZoneDensity; // drop spawn-zones across the viewport width (tier-scaled)
uniform float uDropSpeed;   // ripple cadence/expansion rate scalar (tier-scaled)
uniform float uIntensity;   // master drop activity; 1.0 = ambient (scroll/audio raise it)
uniform vec3  uVoid;        // --mx-void background
uniform vec3  uHead;        // --mx-green-hi leading-glyph bloom
uniform vec3  uBody;        // --mx-green ring body
uniform vec3  uTrail;       // --mx-green-far dissipating tail
uniform vec3  uAccent;      // head accent (Note-rain --note-accent violet; US-042)
uniform float uAccentStrength; // 0 on Matrix (identical output); subtle on Note-rain
uniform float uBrightness;  // audio head-brightness lift (US-043/US-054); 1.0 = dormant
// US-303 aeronautics SVT morph: 0 = glyph-rain void (below is a no-op → byte-identical),
// rising toward 1 the backdrop lerps to the synthetic-vision sky and the glyph
// contribution fades to 0 by uMorph ≈ 0.5 (no glyphs over the SVT view). Matrix/Note
// never drive uMorph (stays 0), so their output is unchanged (the US-042/US-043 rule).
uniform float uMorph;
uniform vec3  uSkyHaze;     // --sky-haze horizon band
uniform vec3  uSkyBlue;     // --sky-blue zenith
uniform vec3  uSkySun;      // --sky-sun warm glow

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec2 hash22(vec2 p) {
  return fract(
    sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453123
  );
}

void main() {
  vec2 frag = vUv * uResolution;

  // Glyph-cell grid: square cells fit uCellDensity across the width (tier-scaled).
  float cell = uResolution.x / uCellDensity;
  vec2 cellId = floor(frag / cell);
  vec2 cellCenter = (cellId + 0.5) * cell;

  // Spawn-zone grid: coarser, square px zones so rings stay circular on screen.
  float zoneSize = uResolution.x / uZoneDensity;
  vec2 baseZone = floor(cellCenter / zoneSize);

  float ringWidth = cell * 1.15;   // ring thickness ≈ 1 glyph (US-055: crisper ripple ring)
  float bright = 0.0;              // ring-band brightness at the cell centre
  float crest = 0.0;              // young-crest / impact emphasis → head bloom

  // Bounded 3×3 neighbourhood: rings from adjacent zones cross into this cell.
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 zid = baseZone + vec2(float(dx), float(dy));
      // Per-zone cadence (stable): one drop per `period`, offset by a phase.
      // US-055 tuning: 2.2–5.0s (was 2.4–5.6) — splashes re-roll a touch more often
      // so the field feels livelier (still well under the §15 flash rate).
      float period = mix(2.2, 5.0, hash21(zid + 11.3));
      float t = uTime * uDropSpeed / period + hash21(zid + 27.7);
      float cyc = fract(t);
      // Per-cycle drop: fresh impact point / max radius / amplitude each cycle, so a
      // zone never splashes on the same spot twice (re-hash by the cycle index).
      vec2 dropSeed = zid + vec2(floor(t) * 17.0, floor(t) * 31.0);
      vec2 sub = hash22(dropSeed);
      float maxR = mix(0.42, 0.96, hash21(dropSeed + 3.1)) * zoneSize;
      float amp = mix(0.55, 1.0, hash21(dropSeed + 5.5));
      vec2 center = (zid + sub) * zoneSize;

      // Ease-out expansion (fast at impact, slowing as it dissipates).
      float r = (1.0 - (1.0 - cyc) * (1.0 - cyc)) * maxR;
      float dist = length(cellCenter - center);
      float ring = 1.0 - smoothstep(0.0, ringWidth, abs(dist - r));
      float diss = 1.0 - cyc;            // fade as the ring grows toward maxR
      float env = ring * diss * amp;

      bright = max(bright, env);
      // Brief central pop at birth + the bright leading edge of young rings.
      float impact = (1.0 - smoothstep(0.0, cell * 1.6, dist)) * (1.0 - smoothstep(0.0, 0.16, cyc));
      crest = max(crest, max(env * (1.0 - cyc), impact * amp));
    }
  }

  // Master intensity: scroll velocity (US-052) + audio (US-054) push it above the
  // 1.0 ambient baseline. At rest uIntensity == 1.0 → the field is the calm drizzle.
  bright = clamp(bright * uIntensity, 0.0, 1.0);
  crest = clamp(crest * uIntensity, 0.0, 1.0);

  // Glyph in this cell, cycling slowly over time for the live feel (low rate, §15).
  float flip = floor(uTime * (0.8 + 1.0 * hash21(cellId + 4.0)));
  float gi = floor(hash21(vec2(cellId.x * 1.7 + flip, cellId.y * 0.3 + 7.0)) * uGlyphCount);
  gi = clamp(gi, 0.0, uGlyphCount - 1.0);
  float gcol = mod(gi, uAtlasGrid.x);
  float grow = floor(gi / uAtlasGrid.x);
  vec2 inCell = fract(frag / cell);
  // Atlas baked flipY=false (row 0 = top); screen frag.y is bottom-up, so the cell's
  // vertical coord is inverted to keep glyphs upright.
  vec2 atlasUv = vec2(
    (gcol + inCell.x) / uAtlasGrid.x,
    (grow + 1.0 - inCell.y) / uAtlasGrid.y
  );
  float mask = texture2D(uAtlas, atlasUv).r;

  // Colour ramp: dissipating tail → ring body, then bloom the crest toward the
  // near-white green head.
  vec3 tint = mix(uTrail, uBody, smoothstep(0.0, 0.6, bright));
  // Audio brightness (US-043/US-054): a >1 value WIDENS the head bloom so more of a
  // ring reaches the bright head token (#C7FFD0), never scaling colour past the
  // palette's brightest hex (P7). uBrightness 1.0 is the dormant baseline (no-op).
  float lift = clamp(uBrightness - 1.0, 0.0, 1.0);
  float headFactor = smoothstep(mix(0.78, 0.5, lift), 1.0, crest);
  tint = mix(tint, uHead, headFactor);
  // Note-rain (US-042/US-053): tip the bloomed head toward the violet accent.
  // uAccentStrength is 0 on Matrix → this mix is a no-op (byte-identical pure green).
  tint = mix(tint, uAccent, headFactor * uAccentStrength);

  // US-303 SVT backdrop: above the ridgeline the void lerps to the synthetic-vision
  // sky (haze horizon → blue zenith + a soft warm sun glow), and the glyph rain fades
  // out by uMorph ≈ 0.5. At uMorph 0 every term collapses (glyphFade 1, bg = uVoid) →
  // the line below is byte-identical to the original `mix(uVoid, tint, mask·…)`.
  vec3 sky = mix(uSkyHaze, uSkyBlue, smoothstep(0.28, 1.0, vUv.y));
  float sun = 1.0 - smoothstep(0.0, 0.34, distance(vUv, vec2(0.5, 0.6)));
  sky += uSkySun * sun * 0.5;
  vec3 bg = mix(uVoid, sky, uMorph);
  float glyphFade = 1.0 - smoothstep(0.0, 0.5, uMorph);
  vec3 color = mix(bg, tint, mask * smoothstep(0.02, 0.12, bright) * glyphFade);
  gl_FragColor = vec4(color, 1.0);
}
