// Wireframe-terrain fragment stage (US-010, manual §7.1).
//
// Renders the displaced plane's edges (material.wireframe) as phosphor-green
// lines that recede into an EXPONENTIAL fog: the line colour mixes from
// `--mx-green-mid` (#00B82E) toward `--mx-green-far` (#003B00) with distance and
// the geometry is occluded (alpha → 0) toward the horizon, so the range
// dissolves into the rain backdrop rather than ending at a hard edge. Only the
// `--mx-*` ramp tokens are used (P7); both arrive as raw sRGB-normalised vec3
// (a bare ShaderMaterial does no output colour-management). `precision` is
// injected by Three's ShaderMaterial — do NOT redeclare it.
varying float vFogDepth;

uniform vec3  uLine;        // --mx-green-mid wireframe
uniform vec3  uFog;         // --mx-green-far fog tint
uniform float uFogDensity;  // exponential-fog density
// US-303 SVT morph: 0 = Matrix wireframe (below is a no-op), 1 = the line re-tints
// toward --sky-terrain-line and the fog toward --sky-haze, so the same wireframe
// stays visible as the G1000 synthetic-vision mesh grid over the filled terrain.
uniform float uMorph;
uniform vec3  uLineSVT;     // --sky-terrain-line (grid at full morph)
uniform vec3  uFogSVT;      // --sky-haze (fog target at full morph)
// US-503 direction-aware exit: 0 = entry/postcard (everything below is a no-op —
// Matrix and Note NEVER drive this, so their render is byte-identical), rising to 1
// through the aeronautics climb-out, where the re-revealed skeleton tints toward the
// violet Note ramp so the sky→note crossfade dissolves violet→violet.
uniform float uExit;
uniform vec3  uLineNote;    // NOTE_MID (violet grid at full exit)
uniform vec3  uFogNote;     // NOTE_FAR (violet fog at full exit)

void main() {
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  fog = clamp(fog, 0.0, 1.0);
  vec3 line = mix(mix(uLine, uLineSVT, uMorph), uLineNote, uExit);
  vec3 fogc = mix(mix(uFog, uFogSVT, uMorph), uFogNote, uExit);
  vec3 color = mix(line, fogc, fog);
  // Fog-occluded toward the horizon: fade the line out as it saturates.
  gl_FragColor = vec4(color, 1.0 - fog);
}
