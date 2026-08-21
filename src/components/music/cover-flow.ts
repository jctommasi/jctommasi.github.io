/**
 * Music "01 — Cover Flow" enhancement (2026-08-09 redesign) — the lazy chunk
 * behind music/albums-loader.ts. A thin selection state machine over the SSR
 * album list (the experience-chapters idiom): it AUTHORS NO STRINGS and builds
 * NO DOM — it only rewrites attributes/properties the server already rendered
 * (data-pos offsets, aria-current, hidden on the per-album status sentences,
 * disabled on the finite ends), and CSS derives all geometry from data-pos.
 *
 * P5 / progressive enhancement: the SSR baseline is a fully functional
 * scroll-snap row (every album + its real link, controls hidden). Only after
 * selection is wired does this stamp data-cf-ready — a malformed DOM leaves
 * the baseline untouched, never a blank or dead-control state.
 *
 * A11y contract:
 *  - aria-current='true' marks the active <li> (+ its jump dot).
 *  - The status wrapper becomes role='status' only AFTER init (the
 *    chapter-path announce trick): selection changes announce the SSR'd
 *    "Album N of M: Title — Artist" sentence, page load stays silent.
 *  - COVER-AS-LINK (2026-08-09 correction): side covers are real selection
 *    <button>s (SSR'd, this module only wires clicks — selecting NEVER
 *    navigates), the active cover is a real full-cover <a> to its Tidal
 *    album page; CSS shows exactly one overlay per cover. Press a side cover
 *    → it centres; press it again once centred → TIDAL (mouse, touch and
 *    keyboard alike — the focus-continuity rule below makes the keyboard
 *    double-press work).
 *  - Focus is NEVER moved on selection change unless the focused control
 *    disappears in the swap. Then, predictably: focus that came from a
 *    now-active cover button lands on the SAME cover's link (Enter again
 *    opens the album); focus that sat on an arrow the end-of-range disabled
 *    hands to the counterpart arrow (the experience-chapters rule); a
 *    linkless active cover falls back to an enabled arrow.
 *  - ArrowLeft/Right + Home/End work while focus is inside the selector
 *    (no element here has a competing native arrow behaviour); Tab order is
 *    untouched.
 *  - A failed cover image stamps data-cover-failed on its item so CSS falls
 *    back to the generated placeholder art (honest face, no broken glyph).
 */
export function mount(root: HTMLElement): void {
  const list = root.querySelector<HTMLElement>('[data-cf-list]');
  const items = list ? [...list.querySelectorAll<HTMLElement>('[data-cf-item]')] : [];
  if (!list || items.length === 0) return;

  const prevBtn = root.querySelector<HTMLButtonElement>('[data-cf-prev]');
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-cf-next]');
  const dots = [...root.querySelectorAll<HTMLButtonElement>('[data-cf-dot]')];
  const states = [...root.querySelectorAll<HTMLElement>('[data-cf-state]')];
  const statusWrap = root.querySelector<HTMLElement>('[data-cf-status]');

  let active = 0;

  const apply = (to: number): void => {
    const focusedBefore = document.activeElement;
    const hadFocus = root.contains(focusedBefore);
    active = Math.min(items.length - 1, Math.max(0, to));
    items.forEach((li, i) => {
      const p = i - active;
      li.setAttribute('data-pos', Math.abs(p) > 3 ? 'out' : String(p));
      if (i === active) li.setAttribute('aria-current', 'true');
      else li.removeAttribute('aria-current');
    });
    dots.forEach((dot, i) => {
      if (i === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    states.forEach((s, i) => {
      s.hidden = i !== active;
    });
    // Finite navigation: real disabled at the ends (the redesign brief's call).
    if (prevBtn) prevBtn.disabled = active === 0;
    if (nextBtn) nextBtn.disabled = active === items.length - 1;
    // Focus continuity across the state swap (a control that held focus can
    // vanish two ways: the selected cover's button hides behind its link, or
    // an end-of-range arrow disables). Re-seat it predictably — cover-press →
    // the SAME cover, now the link, so pressing again opens the album; arrow →
    // the counterpart arrow (the experience-chapters rule). GOTCHA: Chrome's
    // focus fixup for a control hidden by a style change is ASYNC — right
    // here document.activeElement can still read the doomed control — so the
    // "did it vanish" test asks checkVisibility()/disabled (both force a
    // synchronous style recalc), never only activeElement===body. The
    // hadFocus guard keeps the initial apply() from stealing focus at mount.
    if (hadFocus && focusedBefore instanceof HTMLElement) {
      const gone =
        document.activeElement === document.body ||
        !focusedBefore.isConnected ||
        !focusedBefore.checkVisibility() ||
        (focusedBefore as HTMLButtonElement).disabled === true;
      if (gone) {
        const fromCover = focusedBefore.hasAttribute('data-cf-select');
        const activeLink = items[active]?.querySelector<HTMLElement>('a[data-cf-open]');
        const arrowFallback = nextBtn && !nextBtn.disabled ? nextBtn : prevBtn;
        (fromCover ? (activeLink ?? arrowFallback) : (arrowFallback ?? activeLink))?.focus();
      }
    }
  };

  const step = (delta: number): void => apply(active + delta);

  prevBtn?.addEventListener('click', () => step(-1));
  nextBtn?.addEventListener('click', () => step(1));
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => apply(i));
  });

  // Side covers are real selection buttons (SSR'd): pressing one centres its
  // album — and never navigates (the link overlay only exists on the active
  // cover).
  items.forEach((li, i) => {
    li.querySelector<HTMLButtonElement>('[data-cf-select]')?.addEventListener('click', () => apply(i));
  });

  root.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      apply(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      apply(items.length - 1);
    }
  });

  for (const img of list.querySelectorAll<HTMLImageElement>('.music__cf-img')) {
    const failed = (): void => {
      img.closest('[data-cf-item]')?.setAttribute('data-cover-failed', '');
    };
    // Covers are loading="lazy" below the fold, but a load can already have
    // settled (either way) by mount time — and an already-fired error event
    // never replays. complete + naturalWidth 0 is AMBIGUOUS (a cached 404, or
    // a perfectly-good dimensionless SVG, which Chrome reports at 0 — and
    // img.decode() also rejects for SVG-in-img, so neither signal alone is
    // trustworthy). Disambiguate with a probe Image on the same src: it
    // resolves from cache, and only a real load failure fires its error.
    if (img.complete) {
      if (img.naturalWidth === 0) {
        const probe = new Image();
        probe.onerror = failed;
        probe.src = img.currentSrc || img.src;
      }
    } else {
      img.addEventListener('error', failed);
    }
  }

  apply(0);
  root.setAttribute('data-cf-ready', '');
  // Live announcements only from here on (role added AFTER the initial render
  // means page load announces nothing — the experience-chapters trick).
  statusWrap?.setAttribute('role', 'status');
}
