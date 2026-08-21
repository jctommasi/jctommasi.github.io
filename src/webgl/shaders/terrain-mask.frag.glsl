// Depth-only terrain mask (US-105).
//
// The invisible SOLID "twin" of the wireframe terrain: it shares terrain.vert.glsl
// (same displacement — amplitude / frequency / scroll) so its silhouette matches the
// visible range exactly, but its material writes ONLY depth (colorWrite:false), so
// this colour output is discarded and NO solid fill is ever seen. That depth occludes
// the far-plane rain quad (rain.vert.glsl z≈1, depthTest:true) so the Matrix/Note
// drops read as SKY behind the mountains — nothing rasterises below the ridgeline.
// The visible wireframe keeps its x-ray look (its material sets depthTest:false, so it
// never tests against this mask → no z-fighting, no polygonOffset needed).
// `precision` is injected by Three's ShaderMaterial — do NOT redeclare it.
varying float vFogDepth; // written by terrain.vert.glsl; unused here (depth-only).

void main() {
  gl_FragColor = vec4(0.0); // discarded — colorWrite:false. Only depth is written.
}
