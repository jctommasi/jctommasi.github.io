/**
 * Approach bootstrap for the Ruta Activa connector layer (the US-034 IO
 * pattern, the flight-log-loader/albums-loader shape): the competency map is
 * below-the-fold DECORATION — nothing interactive depends on it (the nodes
 * are native <details>) — so the measuring module stays out of the eager
 * bundle and loads once the section approaches (300px lead). Until it runs,
 * the SVG is display:none behind the data-cxn-ready stamp, so a pre-approach
 * paint (and any load failure) shows the clean grid + the relations as text
 * (P5). NOT motion-gated — connectors are static content geometry, not motion.
 */
const map = document.querySelector('.cxn');
if (map && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        io.disconnect();
        import('./competencies-map').catch(() => {
          /* decoration only — the honest no-lines fallback stands */
        });
      }
    },
    { rootMargin: '300px 0px' },
  );
  io.observe(map);
}
