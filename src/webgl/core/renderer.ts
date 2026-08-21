/**
 * Shared WebGL renderer factory (US-007; pixel-ratio cap moved to US-008).
 *
 * There is exactly ONE `WebGLRenderer` for the whole page (manual §7.4): every
 * scene draws through the instance created here and handed to it via the
 * scene-manager's `SceneContext`. Constructing the renderer can throw if the
 * browser/GPU can't supply a WebGL context — the caller (engine.ts) lets that
 * propagate so SceneCanvas.astro keeps the static poster (the context-failure
 * fallback rung, P5).
 *
 * The pixel-ratio ceiling is no longer set here: engine.ts applies it from the
 * resolved device tier (US-008), so the cap tracks the probe (1 / 1.5 / 2)
 * instead of a fixed value.
 */
import { WebGLRenderer } from 'three';
import { MX_VOID } from '../palette';

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  // Clear to the Matrix void so the canvas matches the poster/page (P7).
  renderer.setClearColor(MX_VOID, 1);
  return renderer;
}
