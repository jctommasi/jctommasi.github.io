/**
 * Experience "Chapter Path" enhancement (2026-08-08 redesign) — master–detail
 * selection for the #experience section. A thin side-effect module (the
 * collapse.ts idiom it REPLACES — the experience entries were the last
 * [data-collapse] host, so that framework left with them): no framework, no
 * persistence, no URL state.
 *
 * P5 HONESTY (the reveal-ready / data-collapse-ready pattern): the server
 * renders the chapter INDEX + the prev/next footer hidden (CSS keyed on
 * .exp:not([data-exp-ready])) and ALL chapter panels visible, stacked — the
 * no-JS / script-error reader gets the complete record as a linear document
 * with zero dead controls. Only this module, once selection is actually
 * wired, hides the non-selected panels and stamps data-exp-ready on the root.
 * A malformed DOM (count mismatch, missing arrows) leaves the SSR
 * everything-visible state — never a blank section.
 *
 * SEMANTICS: plain <button>s + aria-current='true' on the selected index
 * entry — deliberately NOT a partial role='tab' pattern (Tab reaches every
 * chapter, Enter/Space select natively, no roving tabindex to half-implement).
 * Panels toggle via the `hidden` property; prev/next expose REAL `disabled`
 * at the ends, and when disabling the pressed arrow would drop focus to
 * <body>, focus hands to the counterpart arrow so keyboard users stay in the
 * footer they were operating. The footer count (one SSR span per chapter —
 * data-derived, this module only toggles `hidden`, it authors no strings)
 * becomes role='status' AFTER the initial render, so chapter changes announce
 * the new position with no page-load chatter.
 *
 * DECODE CONTRACT: imported BEFORE alien-decode (PageBody script block), so
 * the non-selected panels are already hidden (zero-size ⇒ skipped ⇒ static)
 * when the decode walker measures; the selected panel decodes with the
 * section as usual. This module never writes text — only attribute/property
 * toggles — so it cannot collide with the pair spans in either direction.
 *
 * MOTION: the entrance animation + hover/selection eases live in CSS gated on
 * html[data-motion='full']; under data-motion='reduced' the same state flips
 * apply instantly (selection is interaction, not gratuitous motion — the
 * US-034 rule; everything is finite/one-shot, the running-infinite census is
 * untouched). Everything derives from the DOM collections — no hard-coded
 * chapter count, so a fifth cv.json entry just works.
 */
const root = document.querySelector<HTMLElement>('[data-exp-chapters]');
if (root) {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-exp-tab]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-exp-panel]')];
  const counts = [...root.querySelectorAll<HTMLElement>('[data-exp-count]')];
  const countWrap = root.querySelector<HTMLElement>('[data-exp-counts]');
  const prev = root.querySelector<HTMLButtonElement>('[data-exp-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-exp-next]');

  if (tabs.length > 0 && tabs.length === panels.length && prev && next) {
    let index = -1;

    const select = (to: number, entered: boolean) => {
      if (to === index || to < 0 || to >= panels.length) return;
      index = to;
      panels.forEach((panel, i) => {
        panel.hidden = i !== to;
        if (i === to && entered) panel.setAttribute('data-exp-enter', '');
      });
      tabs.forEach((tab, i) => {
        if (i === to) tab.setAttribute('aria-current', 'true');
        else tab.removeAttribute('aria-current');
      });
      counts.forEach((count, i) => {
        count.hidden = i !== to;
      });
      prev.disabled = to === 0;
      next.disabled = to === panels.length - 1;
    };

    const step = (delta: number) => {
      const pressed = delta < 0 ? prev : next;
      select(index + delta, true);
      // Disabling the focused arrow at an end drops focus to <body>; hand it
      // to the counterpart so keyboard flow stays in the footer.
      if (pressed.disabled && document.activeElement === document.body) {
        (delta < 0 ? next : prev).focus();
      }
    };

    for (const panel of panels) {
      panel.addEventListener('animationend', (e) => {
        if (e.target === panel) panel.removeAttribute('data-exp-enter');
      });
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i, true));
    });
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));

    // Initial selection: the professionally-current chapter (the typed
    // endYear 'Present' derivation rides in on data-exp-current), else the
    // first — never a hard-coded org (the data may change).
    const start = panels.findIndex((p) => p.hasAttribute('data-exp-current'));
    select(start === -1 ? 0 : start, false);
    root.setAttribute('data-exp-ready', '');
    // Live position announcements only from here on (adding the role AFTER
    // the initial render means page load announces nothing).
    countWrap?.setAttribute('role', 'status');
  }
}

export {};
