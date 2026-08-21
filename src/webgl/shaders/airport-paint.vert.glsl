// Airport paint-sweep vertex stage (US-502).
//
// Carries the two things the fragment stage needs to decide whether a fragment has
// been PAINTED yet: the texture uv (runway markings / striped roof) and the paint
// COORDINATE along which the sweep travels.
//
// Two coordinate modes share one program (uAxisMode, a per-mesh uniform):
//   - 0 = the mesh's LOCAL length axis (`position.y`): the runway/apron planes are
//     built as PlaneGeometry(width, length), so local +Y runs along the strip; the
//     paint therefore runs ALONG the strip regardless of the -90° X rotation that
//     lays it flat.
//   - 1 = WORLD-UP: the buildings paint bottom-up, which must survive the hangar
//     roof's 45° Z rotation (its local +Y is not up). `uOriginY` is the group's
//     world Y, subtracted so uMin/uMax stay in the group-local space they were
//     measured in (the group is translation-only, so this is exact).
// US-1502: `vFogDepth` (view-space distance, the terrain.vert.glsl formula) is
// handed to the fragment stage so the painted airport is attenuated by the SAME
// exponential fog as the mountains at the same depth.
// `precision` + the default attributes (position/uv) are injected by Three's
// ShaderMaterial — do NOT redeclare them.
varying vec2  vUv;
varying float vCoord;
varying float vFogDepth;

uniform float uAxisMode;  // 0 = local length axis, 1 = world-up
uniform float uOriginY;   // group world Y (world-up mode only)

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vCoord = mix(position.y, world.y - uOriginY, uAxisMode);
  vec4 mv = viewMatrix * world;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
