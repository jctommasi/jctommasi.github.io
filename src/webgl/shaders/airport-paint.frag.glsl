// Airport paint-sweep fragment stage (US-502, owner call 2026-07-30).
//
// The airport enters fully DRAWN as a green wireframe (US-501); this stage paints
// the colour INTO that skeleton with a spatial sweep instead of the old whole-model
// opacity fade ("no queda lindo ese fadein"). A fragment is painted once its paint
// coordinate (vCoord, normalised into 0..1 by uMin/uMax) sits behind the travelling
// FRONT; the front position is the global paint progress remapped through this
// mesh's stagger window (uBandLo/uBandHi → runway → apron → hangar → tower).
//
// LOAD-BEARING: unpainted fragments DISCARD. A transparent-but-drawn fragment would
// still write depth, so an unpainted box would occlude its own back edges, the other
// structures and the terrain behind it — discarding keeps the not-yet-painted volume
// genuinely see-through (the wireframe twin is what you see there).
//
// The front carries a NARROW smoothstep soft edge and NO bright rim (owner call).
// Colours are raw sRGB-normalised (palette tokens / NoColorSpace CanvasTextures) —
// a bare ShaderMaterial does no output colour-management, so they pass through
// exactly as baked (the engine convention, P7). `precision` is injected by Three.
// US-1502 — TERRAIN-MATCHED FOG, applied AFTER the paint-front resolve: surviving
// fragments mix toward uFogColor and fade alpha by (1 - fog), exactly the
// terrain.frag.glsl treatment (same formula, same density/colour driven per frame
// by the scene), so the painted airport reads at the mountains' attenuation at the
// same depth. Discarded fragments stay discarded — the see-through unpainted
// volume is preserved. uFogDensity 0 ⇒ fog 0 ⇒ an exact no-op (the safe default).
varying vec2  vUv;
varying float vCoord;
varying float vFogDepth;

uniform vec3      uColor;    // flat palette tint (white when a map carries the colour)
uniform sampler2D uMap;      // baked markings / stripes (uHasMap gates it)
uniform float     uHasMap;
uniform float     uMin;      // paint coordinate at the sweep's start
uniform float     uMax;      // paint coordinate at the sweep's end
uniform float     uPaint;    // global paint progress (0 = bare wireframe, 1 = solid)
uniform float     uBandLo;   // this mesh's stagger window
uniform float     uBandHi;
uniform vec3      uFogColor;   // the terrain's live fog mix (raw sRGB, US-1502)
uniform float     uFogDensity; // swallow-scaled exponential density; 0 = no fog

/** Soft-edge width, in normalised paint-coordinate units (narrow: a front, not a fade). */
const float EDGE = 0.05;

void main() {
  float local = clamp((uPaint - uBandLo) / max(1e-4, uBandHi - uBandLo), 0.0, 1.0);
  float t = clamp((vCoord - uMin) / max(1e-4, uMax - uMin), 0.0, 1.0);
  // Travel the front from just before 0 to just past 1 so the mesh starts fully
  // unpainted and ends fully painted (no residual soft band at either extreme).
  float front = local * (1.0 + 2.0 * EDGE) - EDGE;
  float painted = 1.0 - smoothstep(front, front + EDGE, t);
  if (painted < 0.01) discard;

  vec3 tex = texture2D(uMap, vUv).rgb;
  vec3 base = uColor * mix(vec3(1.0), tex, uHasMap);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  fog = clamp(fog, 0.0, 1.0);
  gl_FragColor = vec4(mix(base, uFogColor, fog), painted * (1.0 - fog));
}
