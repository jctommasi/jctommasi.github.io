// Fullscreen post-pass vertex stage (US-012).
//
// Every post pass (DOF, CRT) draws one clip-space `PlaneGeometry(2,2)`, which
// already spans the screen, so emit its position directly (the pass camera is a
// formality) and hand the fragment stage 0..1 UVs. Same trick as the rain quad.
// `position` and `uv` are injected by Three's ShaderMaterial — do NOT redeclare.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
