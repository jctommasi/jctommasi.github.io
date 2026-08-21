// G1000 SVT terrain fill fragment stage (US-303, PRD prd-aeronautics-airport-g1000).
//
// The aeronautics scene draws a SECOND copy of the terrain plane (same geometry +
// terrain.vert.glsl displacement) as a FILLED, elevation-tinted synthetic-vision
// surface UNDER the wireframe grid. It emerges with uMorph: alpha = uMorph, so at
// morph 0 the fill is fully transparent (the Matrix cruise is byte-identical) and at
// morph 1 it's an opaque G1000 terrain — --sky-terrain-low at the valley floor →
// --sky-terrain-high on the ridges (by displaced world height), receding into the
// --sky-haze horizon via the same exponential fog as the wireframe. Only aeronautics
// creates this mesh, so Matrix/Note pay no extra draw. Colours are palette vec3s (P7).
// `precision` is injected by Three's ShaderMaterial — do NOT redeclare it.
varying float vFogDepth;
varying float vHeight;      // 0 valley floor → ~1 ridge (terrain.vert.glsl)

uniform float uMorph;       // 0 = invisible (Matrix cruise), 1 = full SVT fill
uniform vec3  uLow;         // --sky-terrain-low (valley floor)
uniform vec3  uHigh;        // --sky-terrain-high (ridges)
uniform vec3  uHaze;        // --sky-haze (fog recedes toward the horizon band)
uniform float uFogDensity;  // same exponential-fog density as the wireframe

void main() {
  float hf = clamp(vHeight, 0.0, 1.0);
  vec3 color = mix(uLow, uHigh, smoothstep(0.12, 0.72, hf));
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  fog = clamp(fog, 0.0, 1.0);
  color = mix(color, uHaze, fog); // dissolve into the SVT horizon haze
  gl_FragColor = vec4(color, uMorph);
}
