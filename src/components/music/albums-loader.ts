/**
 * Music Cover-Flow approach loader (2026-08-09 "01 — Cover Flow" redesign;
 * same-day second pass: MULTIPLE titled collections, one selector region
 * each) — the US-034 / US-1404 / US-1610 bootstrap shape: a tiny eager module
 * that observes every album-selector region (ONE IntersectionObserver, ~300px
 * lead, each region mounted once on its own approach) and dynamic-imports
 * ./cover-flow, so the enhancement stays in its own code-split lazy chunk
 * (fetched once, shared by all regions).
 *
 * Unlike the contact marquee this is INTERACTION, not gratuitous motion (the
 * US-034 practice-widget rule), so there is NO data-motion gate — the selector
 * works under both motion paths; only its transform/opacity transitions are
 * CSS-gated on html[data-motion='full']. No-JS, a failed chunk, or a page
 * without regions (readers, empty collections) all leave the SSR scroll-snap
 * rows — every album + real link already reachable, so nothing is ever blank
 * and no dead controls ship (they stay CSS-hidden until data-cf-ready).
 */
const regions = [...document.querySelectorAll<HTMLElement>('#music [data-cover-flow]')];

if (regions.length > 0) {
  const boot = (region: HTMLElement): void => {
    import('./cover-flow')
      .then((mod) => mod.mount(region))
      .catch(() => {
        /* chunk load failed → the functional SSR snap row stays */
      });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            obs.unobserve(entry.target); // each region mounts once
            boot(entry.target as HTMLElement);
          }
        }
      },
      { rootMargin: '300px 0px' },
    );
    for (const region of regions) io.observe(region);
  } else {
    for (const region of regions) boot(region);
  }
}

export {};
