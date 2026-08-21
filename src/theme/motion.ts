/**
 * Motion preference — the single source of truth for every motion gate.
 *
 * The site shows the full WebGL experience BY DEFAULT for everyone (the owner's
 * product choice): the OS `prefers-reduced-motion` is NOT the gate. Instead the
 * resolved preference lives in ONE attribute, `data-motion` on <html>, set
 * pre-paint by the BaseLayout head script (static default `full`, downgraded to
 * `reduced` only when the visitor has explicitly chosen the calm version via the
 * in-page toggle, persisted in localStorage under `MOTION_STORAGE_KEY`).
 *
 * EVERY motion gate keys off this attribute, never the OS media query:
 *   - CSS: `html[data-motion='full'] …` (animations/transitions) and
 *     `html[data-motion='reduced'] …` (the caret kill) — see theme.css,
 *     BaseLayout, SceneCanvas, PageBody.
 *   - JS:  `prefersReducedMotion()` below — the engine kill-switch (SceneCanvas),
 *     the reveal observer (BaseLayout), and the in-scene defensive flags
 *     (rain-scene/sky/scene-manager).
 *
 * Keeping the contract in one place is what guarantees the ~11 gates flip
 * coherently: a half-flipped state (engine on but reveals hidden, or vice versa)
 * is the failure this module exists to prevent.
 */

/** localStorage key holding the explicit `'full' | 'reduced'` choice. */
export const MOTION_STORAGE_KEY = 'motion-preference';

export type MotionPreference = 'full' | 'reduced';

/**
 * The resolved motion preference, read from `data-motion` on <html> (the JS
 * mirror of the CSS gates). `true` only when the visitor opted into the calm
 * version; the default — and the absence of the attribute — is full motion.
 */
export const prefersReducedMotion = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced';
