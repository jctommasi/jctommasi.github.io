// Wireframe-terrain vertex stage (US-010, manual §7.1).
//
// A flat PlaneGeometry is laid horizontally (the mesh carries a -90° X rotation)
// and displaced into a green mountain range entirely on the GPU: value-noise FBM
// over the (x, depth) plane, with a gentle central valley so the forward flight
// path the camera takes (US-011) stays open and peaks rise to the sides. The
// displacement is along object +Z, which the mesh rotation maps to world up.
// `vFogDepth` (view-space distance) is handed to the fragment stage for the
// exponential fog. `position`, `modelViewMatrix`, `projectionMatrix` are injected
// by Three's ShaderMaterial — do NOT redeclare them.
varying float vFogDepth;
// US-303: normalised displaced height (0 valley floor → ~1 ridge) for the SVT fill
// pass (terrain-fill.frag.glsl) to tint elevation low→high. The wireframe/mask
// fragment stages don't read it (an unused varying is harmless).
varying float vHeight;

uniform float uAmplitude;   // peak height (world units), tier-independent
uniform float uFrequency;   // noise frequency over the plane
uniform float uScroll;      // forward-flight offset (US-011): the plane tracks the
                            // camera, so sampling the noise at (depth + uScroll)
                            // keeps the mountains world-stable → they stream toward
                            // the camera as you scroll (an endless range, never the
                            // finite plane edge). 0 ⇒ the static US-010 framing.
// US-304 airport flatten: under the airport footprint the FBM lerps to a level
// field, scaled by uMorph so the field EMERGES from the mountains (Matrix/Note keep
// uMorph 0 → the whole block is a no-op). The depth-mask twin + the SVT fill share
// this vertex stage and the SAME uniforms in lockstep (US-105), so the flat field,
// the rain-occlusion silhouette, and the fill never desync.
uniform float uMorph;       // 0 = no flatten (no-op); airport scene drives it → 1
uniform float uFlattenDepth; // plane-space (position.y) centre of the airport field

// Airport field footprint (plane space) + level elevation. FIELD_Y MUST match
// FIELD_Y in scenes/rain-scene.ts — the airport group sits on this height.
const float FIELD_Y = 2.0;
const float FIELD_HALF_X = 30.0;   // half-width (fits the |x|<10 runway + apron side)
const float FIELD_HALF_Z = 82.0;   // half-length (holds the ~130-unit runway)
const float FIELD_SKIRT = 50.0;    // smoothstep skirt blending field → mountains
// US-506 flatten pre-ramp: the field is fully level by morph FLATTEN_RAMP_END instead
// of 1.0, so the runway unburies during the wireframe phase rather than only at the
// postcard. All three terrain-family materials (wireframe / depth mask / SVT fill)
// share THIS vertex source, so the pre-ramp stays in lockstep by construction (the
// US-105 rule); Matrix/Note keep uMorph 0 ⇒ smoothstep(0,·,0) = 0, still an exact no-op.
const float FLATTEN_RAMP_END = 0.65;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Smoothed 2D value noise in [0,1].
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave fractal Brownian motion in [0,1].
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}

void main() {
  // position.xy is the un-rotated plane: x = world x, y = depth (→ world -z).
  // Offset the depth by uScroll so the FBM is sampled in world space: as the camera
  // (and this plane, which tracks it) fly forward, distant peaks stream into view.
  vec2 noisePos = vec2(position.x, position.y + uScroll);
  float h = fbm(noisePos * uFrequency);
  // Carve a central valley along the (scroll-independent) flight path: low at x≈0,
  // full height past the flanks. Uses position.x so the valley stays centred.
  float valley = mix(0.2, 1.0, smoothstep(10.0, 80.0, abs(position.x)));
  h *= uAmplitude * valley;

  // US-304: flatten to FIELD_Y under the airport footprint (plane-space box centred
  // on x=0, position.y=uFlattenDepth, with a smoothstep skirt), emerging with uMorph.
  float fx = 1.0 - smoothstep(FIELD_HALF_X, FIELD_HALF_X + FIELD_SKIRT, abs(position.x));
  float fz = 1.0 - smoothstep(FIELD_HALF_Z, FIELD_HALF_Z + FIELD_SKIRT, abs(position.y - uFlattenDepth));
  float flatten = fx * fz * smoothstep(0.0, FLATTEN_RAMP_END, uMorph);
  h = mix(h, FIELD_Y, flatten);

  vHeight = h / uAmplitude; // 0 valley floor → ~1 ridge (US-303 SVT elevation tint)

  vec3 displaced = position + vec3(0.0, 0.0, h);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
