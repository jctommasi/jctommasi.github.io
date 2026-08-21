// Digital-rain vertex stage (US-009).
//
// The rain is a single full-screen pass: PlaneGeometry(2,2) already spans clip
// space, so emit its position directly (the camera is a formality) and hand the
// fragment shader 0..1 screen UVs. `position` and `uv` are injected by Three's
// ShaderMaterial — do NOT redeclare them.
//
// US-105: emit at the FAR plane (NDC z ≈ 1) instead of the middle, so the quad's
// material can depthTest:true against the terrain depth-mask (terrain-mask.frag.glsl)
// and be discarded below the ridgeline — the rain only shows in the sky. 0.9999 (not
// exactly 1.0) keeps it just inside the far plane so it passes the depth test in the
// clear-depth sky (works with either LESS or the default LEQUAL depthFunc); the mask
// writes nearer depth over the mountains, discarding the rain there.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
