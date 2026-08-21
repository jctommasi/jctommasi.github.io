/**
 * WebGL engine entry point (US-007) — the lazily-imported boot module.
 *
 * This module statically imports Three.js (via renderer/scene/manager), so it
 * (and Three) land in a CODE-SPLIT chunk. SceneCanvas.astro reaches it only
 * through a dynamic `import()` fired after first paint — keeping Three out of
 * the initial bundle entirely (manual §14; US-048 enforces the JS budget).
 *
 * `initEngine` wires the one shared renderer + the one rAF loop to the canvas,
 * resolves the device tier (US-008), registers the (placeholder) Matrix scene,
 * and starts rendering. It may throw if no WebGL context is available; the
 * caller keeps the poster on failure (the context-failure fallback rung, P5).
 */
import { createRenderer } from './renderer';
import { SceneManager } from './scene-manager';
import { createScrollController } from './scroll';
import { createAudioReactiveController } from './audio-reactive';
import { createVisibilityController, type PauseReason } from './visibility';
import { createMatrixScene } from '../scenes/matrix';
import { createAirportScene } from '../scenes/airport';
import { createNoteScene } from '../scenes/note';
import { resolveTier, parseTierOverride, type DeviceTier, type TierSource } from './device-tier';

/**
 * Zone theme → active scene id (US-040). The zone observer (BaseLayout, US-028)
 * flips `data-theme` on <html> as sections cross the viewport centre; the engine
 * watches that attribute and switches the active scene to match. Matrix is the
 * global/default zone; the Airport scene (US-302) owns the aeronautics zone (the
 * `sky` theme); the Note-rain scene (US-042) owns the music zone.
 */
const SCENE_FOR_THEME: Record<string, string> = { matrix: 'matrix', sky: 'airport', note: 'note' };

export interface EngineHandle {
  /** The quality tier this engine resolved at load (US-008; debug-observable). */
  readonly tier: DeviceTier;
  /** Whether `tier` came from the heuristic probe or a `?tier=` override. */
  readonly tierSource: TierSource;
  /** Stop the loop, drop listeners, and dispose the renderer + active scene. */
  dispose(): void;
}

/**
 * Optional lifecycle hooks the host (SceneCanvas.astro) supplies (US-047). They
 * let the engine drive the static-poster fallback on a runtime WebGL context
 * loss without coupling it to the poster DOM: the host re-shows the poster on
 * `onContextLost` and reveals the live canvas again on `onContextRestored`.
 */
export interface EngineHooks {
  /** Runtime context loss: the loop is paused — bring the static poster back up. */
  onContextLost?(): void;
  /** Context restored: the scene was rebuilt and the loop resumed — hide the poster. */
  onContextRestored?(): void;
}

/**
 * Live engine debug observable (US-013) on `window.__ENGINE__`. `frames` and
 * `running` are getters reading the manager directly, so they always reflect the
 * loop's true state (a CDP probe reads `frames` before/after hiding/scrolling to
 * prove rendering paused). Mirrors the `window.__WEBGL__` / `__SCROLL__` /
 * `__MATRIX__` debug-globals convention.
 */
interface EngineDebug {
  readonly frames: number;
  readonly running: boolean;
  /** The id of the live scene (US-040) — `matrix` / `sky` / `note`, tracking the zone. */
  readonly activeScene: string | null;
  /**
   * The live scene crossfade (US-044): `active` while a theme boundary is
   * dissolving, with the outgoing (`from`) and incoming (`to`) scene ids and the
   * eased 0→1 blend `progress`. A CDP probe flips `data-theme` and reads this to
   * prove both worlds render during the window and that it settles to the incoming.
   */
  readonly transition: {
    active: boolean;
    from: string | null;
    to: string | null;
    progress: number;
  };
  pauseReason: PauseReason | null;
  /**
   * True while the WebGL context is lost at runtime (US-047). The loop is paused
   * and the host shows the static poster; flips back to false once the context is
   * restored and the scene rebuilt. A CDP probe reads this to prove AC3.
   */
  contextLost: boolean;
}

/**
 * Boot the engine on `canvas`. `tierOverrideRaw` is the raw `?tier=` query value
 * (passed straight through by the caller); an invalid/absent value falls back to
 * the heuristic probe. Throws if no WebGL context is available — the caller keeps
 * the poster (context-failure fallback, P5).
 */
export function initEngine(
  canvas: HTMLCanvasElement,
  tierOverrideRaw: string | null = null,
  hooks: EngineHooks = {},
): EngineHandle {
  const width = window.innerWidth;
  const height = window.innerHeight;

  const renderer = createRenderer(canvas);
  // Probe (or override) the device tier from the renderer's own GL context, then
  // apply its pixel-ratio ceiling (replaces US-007's fixed min(dpr, 2)).
  const { tier, source } = resolveTier(renderer.getContext(), parseTierOverride(tierOverrideRaw));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatioCap));

  // Lenis smooth scroll → camera (US-011). Created here (not under reduced motion,
  // since the bootstrap never loads this chunk in that mode); the manager pumps it
  // each frame and threads its live state onto SceneContext for the scene to read.
  const scroll = createScrollController();

  // Audio-reactive bridge (US-043): attaches an AnalyserNode to any <audio> that
  // plays and exposes its smoothed level/bass on SceneContext.audio. Inert until
  // something plays (dormant), so the rain is byte-identical at rest. Like Lenis it
  // lives in this lazy chunk → never created under reduced-motion (no engine ⇒ none).
  const audio = createAudioReactiveController();

  const manager = new SceneManager(renderer, width, height, tier, scroll.state, audio.state);
  // One pump per frame, before the scene's update: advance Lenis, then sample the
  // analyser so the scene reads this frame's scroll AND audio state.
  manager.onFrame = (ts) => {
    scroll.raf(ts);
    audio.sample();
  };
  manager.register(createMatrixScene());
  manager.register(createAirportScene());
  manager.register(createNoteScene());

  const onResize = () => manager.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', onResize, { passive: true });

  manager.resize(width, height);

  // US-040: the active scene follows the zone theme. Sync to the current zone now
  // (matrix at load) and switch whenever the zone observer flips `data-theme`.
  const applyTheme = () => {
    const theme = document.documentElement.dataset.theme || 'matrix';
    manager.setActive(SCENE_FOR_THEME[theme] ?? 'matrix');
  };
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // Live debug observable (US-013); `frames`/`running`/`activeScene` read the manager.
  const engineDebug: EngineDebug = {
    get frames() {
      return manager.frameCount;
    },
    get running() {
      return manager.isRunning;
    },
    get activeScene() {
      return manager.activeId;
    },
    get transition() {
      return {
        active: manager.transitioning,
        from: manager.transitionFromId,
        to: manager.activeId,
        progress: manager.transitionProgress,
      };
    },
    pauseReason: null,
    contextLost: false,
  };
  window.__ENGINE__ = engineDebug;

  // US-047: set true while the GL context is lost at runtime, so the visibility
  // controller's resume can't restart the loop on a dead context (it stays on the
  // poster until the context is restored and the scene rebuilt).
  let contextLost = false;

  // US-013: pause the loop when the tab is hidden or the scene scrolls offscreen,
  // so a backgrounded/invisible scene wastes no GPU (manual §7.4 / §14). `start()`
  // resets the frame clock and the loop's delta is clamped, so re-entry can't
  // time-jump (AC#2). The observed `canvas` is a fixed full-viewport backdrop
  // today, so only the tab-visibility path actually fires now — the observer is
  // wired for per-section scenes later (US-014+ / US-028).
  const resumeLoop = () => {
    if (contextLost) return; // never render on a lost context (US-047)
    manager.start();
    engineDebug.pauseReason = null;
  };
  const pauseLoop = (reason: PauseReason) => {
    manager.stop();
    engineDebug.pauseReason = reason;
  };
  const visibility = createVisibilityController({
    target: canvas,
    onResume: resumeLoop,
    onPause: pauseLoop,
  });
  // Start only if visible right now (e.g. don't render a tab opened in the
  // background); the controller resumes us on the next visibilitychange.
  if (visibility.visible) resumeLoop();
  else engineDebug.pauseReason = visibility.pauseReason;

  // US-047: runtime WebGL context loss (the §14 / US-H3 fallback ladder's live
  // rung). The GPU stack can drop the context at any time — a driver reset, the
  // browser reclaiming GPU memory, or `WEBGL_lose_context` in QA. Three already
  // calls preventDefault + no-ops `render()` while lost; we additionally PAUSE the
  // loop and ask the host to bring the static poster back, so the backdrop is
  // never blank and the page never throws (all content stays in the DOM). On
  // restore we rebuild the scene on the fresh context and resume; any failure
  // there leaves us safely on the poster (graceful, no crash).
  const onContextLost = (event: Event) => {
    event.preventDefault(); // allow the browser to later fire `webglcontextrestored`
    contextLost = true;
    engineDebug.contextLost = true;
    manager.stop();
    engineDebug.pauseReason = null;
    hooks.onContextLost?.();
  };
  const onContextRestored = () => {
    try {
      contextLost = false;
      engineDebug.contextLost = false;
      manager.reload(); // recreate every GPU resource against the restored context
      if (visibility.visible) resumeLoop();
      hooks.onContextRestored?.();
    } catch {
      // Recovery failed → stay on the static poster permanently (still no crash).
      contextLost = true;
      engineDebug.contextLost = true;
      manager.stop();
      hooks.onContextLost?.();
    }
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  return {
    tier,
    tierSource: source,
    dispose() {
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      themeObserver.disconnect();
      visibility.destroy();
      manager.dispose();
      scroll.destroy();
      audio.destroy();
      renderer.dispose();
      if (window.__ENGINE__ === engineDebug) delete window.__ENGINE__;
    },
  };
}

declare global {
  interface Window {
    /**
     * Debug: live engine loop state (US-013) — `frames` (render tally), `running`,
     * and `pauseReason`. Set while the engine is booted; removed on dispose.
     */
    __ENGINE__?: EngineDebug;
  }
}
