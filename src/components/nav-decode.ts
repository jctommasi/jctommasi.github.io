/**
 * Top-bar alien decode cascade (US-904) — the bracelet chrome boots like alien
 * hardware: on page load, under data-motion='full' only, every bar label runs
 * the SAME decode effect as the section titles (decode-core.ts — one engine,
 * identical pool, the ×1.5 timing), in a single left-to-right cascade, exactly
 * ONCE per page load. Hover / scroll / focus / time never replay it; only a
 * refresh resets. A thin side-effect vanilla module (the alien-decode.ts
 * idiom), imported by the SiteNav <script> so every page — home AND the
 * reader routes — plays the same single cascade.
 *
 * Targets, in visual left-to-right order (DOM order matches):
 *   - the 5 `.primary-nav__link` anchor labels (US-1401),
 *   - the VISIBLE motion-toggle span only (the display:none twin is out of the
 *     a11y tree and must never be touched — the two-span label mechanism),
 *   - the Download CV label in either build variant: the bare `.cv-link`
 *     anchor text (PDF committed) or the `.cv-link__label` span (pending) —
 *     NOT the aria-hidden comingSoon badge. HIDDEN since US-1601 (SiteNav's
 *     SHOW_CV_CONTROL gate): `.cv-link` is simply absent, the `if (cv)` guard
 *     skips it, and the cascade runs with 8 labels instead of 9. Re-enabling
 *     the control brings its label back with zero change here,
 *   - both locale codes (the current <span> and the other-locale <a>).
 *
 * Cascade: item starts ~80–120 ms apart, each item at the shared ×1.5 timing;
 * the whole cascade lands well under ~2.5 s (8 short labels).
 *
 * The cascade waits for document.fonts.ready (with a ~1.5 s timeout fallback)
 * so the per-item inline-size pins measure the REAL faces, not fallback
 * metrics — no re-measure pass needed, unlike the encoded-at-rest titles.
 *
 * Accname: anchors / locale links / the motion button pin aria-label = their
 * final label during their run (pinTarget), removed after (restoreTarget).
 * The pending CV button's PERMANENT aria-label already carries a stable
 * accname (it overrides content), so its label span runs with accEl:null —
 * untouched by construction; `disabled` keeps it out of the tab order
 * throughout.
 *
 * Zero CLS: pinTarget pins each item's inline-size (border-box) to the final
 * label's measured box for the run; the plates' fixed height + min-width and
 * the band's flex rows never move (probed: rects flat before/during/after).
 *
 * P5 + flash-safety: the default DOM is the static final labels — reduced /
 * no-JS never scramble (prefersReducedMotion() early return; the module only
 * ever runs under data-motion='full'); every item is try/caught and any error
 * restores that item's final label; glyph swaps only, color/opacity/glow/
 * background constant. ZERO new P8 strings (labels come from the DOM).
 */
import { prefersReducedMotion } from '../theme/motion';
import {
  pinTarget,
  randomBetween,
  restoreTarget,
  runDecode,
  type DecodeTarget,
} from './decode-core';

/** Gap between successive item starts (ms) — the left-to-right cascade beat. */
const CASCADE_GAP_MIN_MS = 80;
const CASCADE_GAP_MAX_MS = 120;
/** fonts.ready fallback — never wait longer than this to boot the cascade. */
const FONTS_TIMEOUT_MS = 1500;

const collectTargets = (header: HTMLElement): DecodeTarget[] => {
  const targets: DecodeTarget[] = [];
  const push = (el: HTMLElement | null, accEl: HTMLElement | null): void => {
    if (!el) return;
    const finalText = el.textContent ?? '';
    const chars = Array.from(finalText);
    // Nothing to decode in an empty or whitespace-only label.
    if (chars.length === 0 || chars.every((ch) => /\s/u.test(ch))) return;
    targets.push({ el, accEl, finalText, chars });
  };

  header
    .querySelectorAll<HTMLElement>('.primary-nav__link')
    .forEach((link) => push(link, link));

  // Motion toggle: only the span the two-span mechanism currently SHOWS (under
  // data-motion='full' that is the "reduce" action; resolved live so a future
  // variant stays correct). The accname pin rides on the button itself.
  const motion = header.querySelector<HTMLElement>('[data-motion-toggle]');
  if (motion) {
    const visible = Array.from(motion.querySelectorAll<HTMLElement>('span')).find(
      (span) => getComputedStyle(span).display !== 'none',
    );
    push(visible ?? null, motion);
  }

  // Download CV, either variant. The pending button keeps its permanent
  // aria-label (accEl:null = never touched); the real link pins its own.
  const cv = header.querySelector<HTMLElement>('.cv-link');
  if (cv) {
    const label = cv.querySelector<HTMLElement>('.cv-link__label');
    if (label) push(label, null);
    else push(cv, cv);
  }

  header
    .querySelectorAll<HTMLElement>('.locale-toggle .locale-link')
    .forEach((link) => push(link, link));

  return targets;
};

const init = (): void => {
  if (prefersReducedMotion()) return;
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;

  // ONCE per page load: whichever of fonts.ready / the timeout arrives first
  // starts the cascade; the flag makes the second arrival a no-op, and nothing
  // else ever calls it again (no hover/scroll/focus listeners exist).
  let started = false;
  const cascade = (): void => {
    if (started) return;
    started = true;
    let targets: DecodeTarget[] = [];
    try {
      targets = collectTargets(header);
    } catch {
      return; // collection failed → static labels stand untouched (P5)
    }
    let at = 0;
    for (const target of targets) {
      window.setTimeout(() => {
        try {
          pinTarget(target); // real fonts by now → the true final box
          runDecode(target.el, target.chars, () => restoreTarget(target));
        } catch {
          restoreTarget(target); // any error → this item's final label (P5)
        }
      }, at);
      at += randomBetween(CASCADE_GAP_MIN_MS, CASCADE_GAP_MAX_MS);
    }
  };

  window.setTimeout(cascade, FONTS_TIMEOUT_MS);
  document.fonts?.ready.then(() => cascade()).catch(() => cascade());
};

init();

export {};
