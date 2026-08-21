/**
 * Scroll bridge (US-011) — Lenis smooth scroll feeding the WebGL camera (§8).
 *
 * This module lives in the lazily-imported engine chunk (engine.ts → here →
 * `lenis`), so a Lenis instance is created ONLY when the engine boots. The
 * SceneCanvas bootstrap never fetches that chunk under `prefers-reduced-motion`
 * (the P5 kill-switch) or on the WebGL-failure poster path — which makes the
 * reduced-motion contract structural: no engine ⇒ no Lenis ⇒ NATIVE scroll +
 * a static poster (no camera to move). That is exactly the manual's reduced-motion
 * row ("Lenis smoothing disabled, camera fixed") and the owner's primary path.
 *
 * Lenis governs document scrolling and exposes `scroll`, `velocity`, `direction`
 * (we also derive a normalized `progress`). `lenis.on('scroll')` writes those into
 * a shared, mutable `ScrollState` that the active scene reads every frame to fly
 * the camera. Lenis' own rAF is OFF (`autoRaf: false`); the single rAF loop in
 * SceneManager pumps `lenis.raf(ts)` each tick, so one loop owns timing AND
 * rendering (§7.4) and the loop's clamped delta is what prevents a tab-refocus jump.
 */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/** Live scroll readout the active scene reads each frame (the scene-facing contract). */
export interface ScrollState {
  /** Absolute smoothed scroll offset in px (Lenis `scroll`). */
  scroll: number;
  /** Maximum scroll offset in px (Lenis `limit`); 0 when the page doesn't scroll. */
  limit: number;
  /** Scroll progress over the page, 0..1 (0 when `limit` is 0 / non-finite). */
  progress: number;
  /** Instantaneous smoothed scroll velocity (signed). */
  velocity: number;
  /** Scroll direction: 1 down, -1 up, 0 idle. */
  direction: number;
}

export interface ScrollController {
  /** Live, mutable scroll readout — read every frame by the active scene. */
  readonly state: ScrollState;
  /** Advance Lenis' smoothing for this frame; called from the single rAF loop. */
  raf(timeMs: number): void;
  /** Tear down Lenis: drops listeners + restores native scroll (removes `lenis` class). */
  destroy(): void;
}

/** A zeroed readout for manager/scene contexts that have no live controller (tests, RM). */
export function createZeroScrollState(): ScrollState {
  return { scroll: 0, limit: 0, progress: 0, velocity: 0, direction: 0 };
}

/**
 * Create the Lenis instance + the shared scroll state. Call only when motion is
 * allowed (the engine boots non-reduced-motion, see the file header). The returned
 * `state` is mutated in place on every `scroll` event, so a scene that captures the
 * reference at mount reads live values without per-frame plumbing.
 */
export function createScrollController(): ScrollController {
  const state = createZeroScrollState();
  const lenis = new Lenis({
    // The engine's single rAF loop pumps raf() — never let Lenis self-pump (§7.4).
    autoRaf: false,
    // Smooth the wheel (the desktop forward-flight feel, §8) …
    smoothWheel: true,
    // … but DON'T sync touch: leave touch scrolling to the browser so native
    // momentum/inertia is respected on mobile (US-048, manual §13 "touch inertia
    // respected"). This is the Lenis default — set explicitly to document intent.
    syncTouch: false,
  });

  // lenis.on('scroll') feeds the loop (§8): each emit refreshes the shared state.
  const sync = (): void => {
    const limit = lenis.limit;
    state.scroll = lenis.scroll;
    state.limit = limit;
    state.progress = limit > 0 && Number.isFinite(lenis.progress) ? lenis.progress : 0;
    state.velocity = lenis.velocity;
    state.direction = lenis.direction;
  };
  const off = lenis.on('scroll', sync);

  // Debug observability (mirrors window.__WEBGL__ from US-008): the live readout.
  // Present only when the engine ran, so its absence under RM is itself the signal.
  if (typeof window !== 'undefined') window.__SCROLL__ = state;

  return {
    state,
    raf(timeMs: number): void {
      lenis.raf(timeMs);
    },
    destroy(): void {
      off();
      lenis.destroy();
      if (typeof window !== 'undefined' && window.__SCROLL__ === state) {
        delete window.__SCROLL__;
      }
    },
  };
}

declare global {
  interface Window {
    /** Debug: live Lenis scroll readout (US-011); set only while the engine runs. */
    __SCROLL__?: ScrollState;
  }
}
