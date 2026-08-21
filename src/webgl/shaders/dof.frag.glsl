// Depth-of-field far-field blur (US-012, manual §7.1 / US-C3).
//
// Softens the FAR field like a real lens, "exactly as the reference does for far
// peaks": the focus distance is roughly fixed, so near terrain stays sharp and
// distant wireframe ridges blur. Depth comes from a DepthTexture the scene
// writes on this tier (the terrain enables depthWrite; the rain quad does not).
// The flat rain backdrop — where no terrain wrote depth, so the cleared depth
// reads ~1.0 — is treated as IN FOCUS, keeping the iconic rain crisp; only the
// displaced terrain softens with distance.
//
// The blur radius is set by the CENTRE pixel's circle-of-confusion, so only the
// far terrain spreads: a sharp in-focus pixel (near terrain, or the backdrop
// rain forced to CoC 0) has radius 0 and stays pixel-exact, so it neither blurs
// nor gathers a blurred neighbour — no foreground bleed. Far wireframe lines,
// which sit on the sharp rain backdrop, soften into it (the lens look). The pass
// is TIME-INVARIANT — it adds no flashing (WCAG 2.2 SC 2.3.1). `precision` is
// injected by ShaderMaterial — do NOT redeclare.
varying vec2 vUv;

uniform sampler2D uColor;   // scene colour
uniform sampler2D uDepth;   // scene depth (non-linear, [0,1])
uniform vec2  uTexel;       // 1.0 / drawing-buffer size
uniform float uNear;        // camera near plane
uniform float uFar;         // camera far plane
uniform float uFocus;       // linear focus distance (world units), roughly fixed
uniform float uRange;       // distance over which CoC ramps 0 → 1
uniform float uMaxBlur;     // max blur radius in px

// Non-linear depth → view-space distance (world units).
float linearize(float d) {
  float z = d * 2.0 - 1.0; // NDC
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

// Circle of confusion: 0 in focus / near, 1 fully blurred. The backdrop
// (depth ≈ 1.0, no terrain) is forced in-focus so the rain stays crisp.
float coc(vec2 uv) {
  float d = texture2D(uDepth, uv).r;
  if (d >= 0.9995) return 0.0;
  float ld = linearize(d);
  return clamp((ld - uFocus) / uRange, 0.0, 1.0);
}

void main() {
  // Radius from the centre pixel only: in-focus pixels get radius 0 (untouched),
  // so just one depth read is needed (cheaper than a per-tap CoC, too).
  float radius = coc(vUv) * uMaxBlur;
  vec3 sum = texture2D(uColor, vUv).rgb;
  float wsum = 1.0;

  // Two concentric rings (6 taps each, the outer offset 30° for a fuller disc).
  // Uniform weights so a far line genuinely softens into the backdrop it sits on.
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0471975512; // 60°
    vec2 inner = vUv + vec2(cos(a), sin(a)) * (radius * 0.6) * uTexel;
    sum += texture2D(uColor, inner).rgb;

    float a2 = a + 0.5235987756; // +30°
    vec2 outer = vUv + vec2(cos(a2), sin(a2)) * radius * uTexel;
    sum += texture2D(uColor, outer).rgb;

    wsum += 2.0;
  }

  gl_FragColor = vec4(sum / wsum, 1.0);
}
