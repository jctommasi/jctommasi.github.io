// Skills — "Channel Stack + Diagnostic Mode" console (2026-08-09 redesign).
// Roving tabindex over the nine category modules, arrow-key grid navigation
// that derives the EFFECTIVE column count from layout (never assumes 3), and
// the diagnostic console's FOCUS readout mirror.
//
// EAGER on purpose (the experience-chapters class, not the decorative-map
// class): keyboard reachability of the section depends on this module, so an
// IO-approach bootstrap could race a keyboard-only user's Tab arrival.
//
// PROGRESSIVE ENHANCEMENT (the house P5 idiom): SSR ships the modules with NO
// tabindex — informative content, zero dead controls no-JS — and the SSR'd
// data-active + console FOCUS text already show the initial state. This
// module grants the roving stops, wires arrows/click/focus sync, and only
// then stamps data-skills-ready.
//
// DECODE SAFETY (the skills-shimmer lesson, applied by construction): the
// module never reads or writes module TEXT — the readout mirrors the SSR'd
// data-skills-title attribute into the console's .skills__value span (in
// alien-decode's EXCLUDE_SELECTOR by class — a semantic-neutral <span>, not
// <code>, because the FOCUS value is localized prose and role=code is
// announced by NVDA/JAWS), and every other write is an attribute toggle — so
// it cannot collide with the decode pair spans on any path, and import order
// vs alien-decode is not load-bearing.

const host = document.querySelector<HTMLElement>('[data-skills]');
const grid = host?.querySelector<HTMLElement>('[data-skills-grid]') ?? null;
const readout = host?.querySelector<HTMLElement>('[data-skills-focus]') ?? null;
const mods = grid ? Array.from(grid.querySelectorAll<HTMLElement>('[data-skills-mod]')) : [];

if (host && grid && readout && mods.length > 0) {
  let active = Math.max(
    0,
    mods.findIndex((mod) => mod.hasAttribute('data-active')),
  );

  const apply = (next: number, moveFocus: boolean): void => {
    mods.forEach((mod, i) => {
      mod.tabIndex = i === next ? 0 : -1;
      if (i === next) mod.setAttribute('data-active', '');
      else mod.removeAttribute('data-active');
    });
    active = next;
    readout.textContent = mods[next].getAttribute('data-skills-title') ?? '';
    if (moveFocus) mods[next].focus();
  };

  // The EFFECTIVE column count, read from layout per keystroke (cheap at nine
  // modules, immune to breakpoint drift — the brief's "never assume three
  // columns"): the first grid row is every module sharing the first module's
  // offsetTop (grid rows top-align their items).
  const columnCount = (): number => {
    const top = mods[0].offsetTop;
    let cols = 0;
    for (const mod of mods) {
      if (mod.offsetTop !== top) break;
      cols += 1;
    }
    return Math.max(1, cols);
  };

  // Never intercept arrows meant for an editable control (none ships inside a
  // module today — the guard is the contract, not a workaround).
  const EDITABLE =
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

  grid.addEventListener('keydown', (event) => {
    // shiftKey included: Shift+Arrow is SELECTION (a click inside a module
    // both places the selection anchor AND focuses the module, so a hijacked
    // Shift+Arrow would make keyboard text selection impossible here).
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(EDITABLE)) return;
    const mod = target.closest<HTMLElement>('[data-skills-mod]');
    const index = mod ? mods.indexOf(mod) : -1;
    if (index < 0) return;
    const cols = columnCount();
    let next: number;
    switch (event.key) {
      case 'ArrowLeft':
        next = index - 1;
        break;
      case 'ArrowRight':
        next = index + 1;
        break;
      case 'ArrowUp':
        next = index - cols;
        break;
      case 'ArrowDown':
        next = index + cols;
        break;
      default:
        return;
    }
    // Partial last row: stepping down past the end from a non-final row lands
    // on the last module (the nearest cell that exists down there).
    if (
      event.key === 'ArrowDown' &&
      next >= mods.length &&
      Math.floor(index / cols) < Math.floor((mods.length - 1) / cols)
    ) {
      next = mods.length - 1;
    }
    // Arrows are matrix navigation while a module holds focus — consumed even
    // at the edges so the page never scrolls out from under the matrix.
    event.preventDefault();
    if (next >= 0 && next < mods.length && next !== index) apply(next, true);
  });

  // Click / tap makes a module the active roving stop (and focuses it — some
  // engines do not focus a tabindex="-1" ancestor on click by themselves).
  grid.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const mod = target?.closest<HTMLElement>('[data-skills-mod]') ?? null;
    if (!mod) return;
    const index = mods.indexOf(mod);
    if (index >= 0) apply(index, true);
  });

  // Any other focus entry (Shift-Tab back in, an AT cursor) syncs the roving
  // state + readout WITHOUT re-focusing — never fight the user's focus.
  grid.addEventListener('focusin', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const mod = target?.closest<HTMLElement>('[data-skills-mod]') ?? null;
    if (!mod) return;
    const index = mods.indexOf(mod);
    if (index >= 0 && index !== active) apply(index, false);
  });

  apply(active, false);
  host.setAttribute('data-skills-ready', '');
}
