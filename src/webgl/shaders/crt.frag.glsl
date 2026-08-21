// CRT phosphor post pass (US-012, manual §7.1 / US-C3).
//
// ONE restrained signature — "not a pile of effects": a subtle green bloom of
// the bright glyph heads, faint static scanlines, and a slight chromatic edge,
// giving the scene a phosphor-monitor character.
//
// MOTION SAFETY (WCAG 2.2 SC 2.3.1): the pass is TIME-INVARIANT. It is a pure
// function of screen position and the current frame, so it introduces NO
// flashing of its own — the scanlines and chromatic split are screen-fixed
// (constant per pixel over time) and the bloom only tracks the underlying rain,
// whose flicker is already frequency-capped (US-009 / §15). No region flashes
// more than 3×/sec. Every strength below is a restrained, capped constant.
//
// PALETTE (P7): the scene is near-monochrome green, so the bloom glow stays in
// the green ramp; the chromatic split is the spec-sanctioned "slight" CRT edge
// (manual §7.1), deliberately tiny. `precision` is injected by ShaderMaterial —
// do NOT redeclare.
varying vec2 vUv;

uniform sampler2D uColor;
uniform vec2  uTexel;        // 1.0 / drawing-buffer size
uniform float uScanCount;    // scanline cycles across the height (CSS-px based)
uniform float uScanIntensity;// scanline darkening amount (faint)
uniform float uChroma;       // max channel split (px) toward the corners
uniform float uBloom;        // bloom add strength
uniform float uBloomThresh;  // luminance/excess threshold for bloom

// Cheap thresholded bloom: an 8-tap ring of the bright (head) pixels' EXCESS
// over the threshold, so only lit glyphs glow and the void never lifts.
vec3 bloom(vec2 uv, float r) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853981634; // 45°
    vec2 uvt = uv + vec2(cos(a), sin(a)) * r * uTexel;
    acc += max(texture2D(uColor, uvt).rgb - uBloomThresh, 0.0);
  }
  return acc * 0.125; // / 8
}

void main() {
  // Slight chromatic edge: split R and B in opposite directions, growing from
  // 0 at the centre toward the corners. Static (function of vUv only).
  vec2 ca = (vUv - 0.5) * uChroma * uTexel;
  float r = texture2D(uColor, vUv + ca).r;
  vec3  c = texture2D(uColor, vUv).rgb;
  float b = texture2D(uColor, vUv - ca).b;
  vec3 col = vec3(r, c.g, b);

  // Subtle phosphor bloom of the bright glyph heads.
  col += bloom(vUv, 2.5) * uBloom;

  // Faint static scanlines (no time term → cannot flash).
  float scan = 1.0 - uScanIntensity * (0.5 - 0.5 * cos(vUv.y * uScanCount * 6.2831853));
  col *= scan;

  gl_FragColor = vec4(col, 1.0);
}
