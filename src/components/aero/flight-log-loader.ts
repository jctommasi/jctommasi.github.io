/**
 * Flight-logbook approach loader (US-1404) — the US-034 practice-loader shape
 * applied to the aeronautics live logbook: a tiny eager bootstrap that
 * observes #aeronautics (IntersectionObserver, ~300px lead, once) and
 * dynamic-imports ./flight-log so the fetch/parse/render module stays in its
 * own code-split lazy chunk (gate:js — only this bootstrap is eager).
 *
 * Runs under BOTH data-motion values: live data is content, not motion (the
 * practice-widget precedent) — nothing here animates. No-ops cleanly on
 * pages without the section/hooks (the research reader pages render no
 * #aeronautics). A failed chunk load leaves the honest SSR pending shell in
 * place (P1/P5 — the import() stays try/caught).
 */
const section = document.getElementById('aeronautics');
const region = section?.querySelector('[data-flightlog="region"]');

if (section && region) {
  const boot = (): void => {
    import('./flight-log')
      .then((mod) => mod.mount())
      .catch(() => {
        /* chunk load failed → the honest SSR pending shell stays */
      });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) {
          obs.disconnect(); // mount once
          boot();
        }
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(section);
  } else {
    boot();
  }
}

export {};
