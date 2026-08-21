/**
 * Visibility controller (US-013) — pauses the shared rAF loop when the scene is
 * not visible, so a backgrounded tab or a scrolled-offscreen canvas wastes no GPU
 * (manual §7.4 / §14: "offscreen scenes pause", "pause rendering on
 * visibilitychange and resume cleanly"). Two independent signals gate the loop:
 *
 *   - page visibility (`visibilitychange`): a hidden/backgrounded tab pauses, and
 *   - the observed target's viewport intersection (an `IntersectionObserver`):
 *     a scene scrolled fully offscreen pauses.
 *
 * The loop runs only when BOTH say "visible". On any transition the controller
 * calls `onResume()` / `onPause(reason)` — both wired to the manager's idempotent
 * `start()` / `stop()`, and `start()` resets the frame clock so re-entry can't
 * time-jump (the clamped delta is the backstop; US-007 / AC#2). The controller
 * does NOT fire a callback at construction: the caller starts the loop based on
 * `visible` so the initial state is owned in one place.
 *
 * NOTE (current layout): the scene canvas is a FIXED full-viewport backdrop, so
 * it never scrolls offscreen — the IntersectionObserver is effectively a no-op
 * today and only the tab-visibility path fires. The observer is wired now so the
 * SAME mechanism pauses per-section / per-zone scenes once they exist
 * (US-014+ sections, US-028 zone map, US-040/US-042 Sky / Note-rain scenes).
 */

/** Why the loop is paused — surfaced for debug observability. */
export type PauseReason = 'hidden' | 'offscreen';

export interface VisibilityController {
  /** True iff both signals say visible (i.e. the loop should be running). */
  readonly visible: boolean;
  /** The reason the loop is currently paused, or `null` when visible. */
  readonly pauseReason: PauseReason | null;
  /** Drop the visibility listener and disconnect the observer. */
  destroy(): void;
}

export interface VisibilityOptions {
  /** Element whose viewport-intersection gates rendering (the scene host/canvas). */
  target: Element;
  /** Called on a hidden→visible transition: start the loop. */
  onResume(): void;
  /** Called on a visible→hidden transition: stop the loop. */
  onPause(reason: PauseReason): void;
}

export function createVisibilityController(opts: VisibilityOptions): VisibilityController {
  const { target, onResume, onPause } = opts;

  // `document.hidden` is authoritative immediately; `onScreen` starts optimistic
  // and the observer's initial (async) callback corrects it if the target booted
  // offscreen. We compute these once and only act on TRANSITIONS via `sync()`.
  let docVisible = typeof document === 'undefined' ? true : !document.hidden;
  let onScreen = true;
  let visible = docVisible && onScreen;

  /** The current pause reason for a given (docVisible, onScreen) — hidden wins. */
  const reasonFor = (): PauseReason | null =>
    docVisible && onScreen ? null : !docVisible ? 'hidden' : 'offscreen';

  /** Re-evaluate `visible` and fire the right callback only when it flips. */
  const sync = (): void => {
    const next = docVisible && onScreen;
    if (next === visible) return;
    visible = next;
    if (visible) onResume();
    else onPause(reasonFor() ?? 'hidden');
  };

  const onVisibilityChange = (): void => {
    docVisible = !document.hidden;
    sync();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // IntersectionObserver may be unavailable in very old engines; degrade safely
  // (only the tab-visibility path gates rendering — `onScreen` stays true).
  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      (entries) => {
        // One observed target → the last entry is its latest state.
        const entry = entries[entries.length - 1];
        if (!entry) return;
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0 },
    );
    observer.observe(target);
  }

  return {
    get visible() {
      return visible;
    },
    get pauseReason() {
      return reasonFor();
    },
    destroy() {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      observer?.disconnect();
      observer = null;
    },
  };
}
