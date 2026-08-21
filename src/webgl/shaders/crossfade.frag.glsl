// Scene-crossfade composite pass (US-044, manual §6.3 / US-D2).
//
// At a theme boundary the SceneManager renders the OUTGOING scene to one render
// target and the INCOMING scene to another, then this pass dissolves between them
// in a single full-screen draw: `mix(from, to, uMix)`. `uMix` is the already-eased
// blend factor (0 = fully outgoing, 1 = fully incoming) supplied per frame over the
// ~700 ms window that matches the US-029 token crossfade. Both render targets hold
// each scene's full output (incl. its DOF/CRT post chain) as raw sRGB with
// NoColorSpace — and this is a bare ShaderMaterial too — so values pass through
// unchanged and the screen shows the exact same `--mx-*` / `--sky-*` / `--note-*`
// hexes as a direct render (P7). Same clip-space quad trick as the post passes,
// so it reuses post.vert.glsl. `vUv` comes from that vertex stage.
precision highp float;

uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uMix;

varying vec2 vUv;

void main() {
  vec4 fromColor = texture2D(uFrom, vUv);
  vec4 toColor = texture2D(uTo, vUv);
  gl_FragColor = mix(fromColor, toColor, uMix);
}
