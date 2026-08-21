/**
 * Ruta Activa connector layer (2026-08-09 owner ask — the "04 — Ruta Activa"
 * evolution of the competencies constellation).
 *
 * The six <details> nodes moved from absolute fractional positions onto a
 * responsive CSS grid with content-driven heights, so the decorative SVG
 * connections can no longer be baked endpoints — this module MEASURES the real
 * cards and writes the edge geometry (path `d` + the two endpoint dots) into
 * the server-rendered aria-hidden SVG.
 *
 * Contract:
 *  - Reads offsetLeft/offsetTop/offsetWidth/offsetHeight (layout-true and
 *    transform-immune — the US-1610 offsetLeft rule, so the US-026 reveal
 *    translate can never skew a measurement), relative to the `.cxn` map
 *    (position:relative, no padding/border, so offsets align with the inset:0
 *    SVG; the viewBox is re-pinned to the map's pixel box each pass, so the
 *    dots stay perfect circles — no non-uniform scale).
 *  - ALL updates batch in ONE requestAnimationFrame; a ResizeObserver on the
 *    map + each card re-schedules (open/close, the exclusive-accordion
 *    sibling close, font swap and breakpoint flips all change an observed
 *    size — no scroll/toggle listeners needed).
 *  - Writes ONLY into the SVG + the `data-cxn-ready` stamp; it never writes
 *    text or node attributes, so it cannot collide with the alien-decode pair
 *    spans (the <details> subtree is decode-excluded anyway).
 *  - No-JS / script failure: the stamp never lands, the SVG stays
 *    display:none, and the grid + each node's "Connects to" text carry the
 *    relations — an honest map, never a misaligned decoration (P5).
 *  - Routing: straight border-to-border segments (slab-clipped against each
 *    card rect + a small gap, dots at the clipped points); the flagged
 *    data-route="top" edge arches through the headroom above its row (the
 *    brief's explicit Red Team ↔ AI/LLM routing) whenever the two cards
 *    actually share a row; and any OTHER straight run that would pass through
 *    a third card bows around it (quadratic, away from the blocker) so an
 *    active route never reads as crossing an unrelated node's text.
 */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Pt {
  x: number;
  y: number;
}
interface Edge {
  a: HTMLElement;
  b: HTMLElement;
  route: string | undefined;
  line: SVGPathElement;
  dotA: SVGCircleElement;
  dotB: SVGCircleElement;
}

/** px between a card border and the connector endpoint/dot. */
const GAP = 6;
/** px the over-the-row arch aims above the higher card top. */
const ARCH_CLEAR = 26;
/** cap for the avoid-a-card quadratic bow (px of curve-midpoint offset). */
const BOW_MAX = 46;

const map = document.querySelector<HTMLElement>('.cxn');
const svg = map ? map.querySelector<SVGSVGElement>('.cxn__links') : null;

if (map && svg) {
  const nodes: HTMLElement[] = [...map.querySelectorAll<HTMLElement>('.cxn__node')];
  const byId = new Map<string, HTMLElement>();
  for (const node of nodes) if (node.dataset.node) byId.set(node.dataset.node, node);

  const edges: Edge[] = [];
  for (const g of svg.querySelectorAll<SVGGElement>('.cxn__edge')) {
    const a = byId.get(g.dataset.a ?? '');
    const b = byId.get(g.dataset.b ?? '');
    const line = g.querySelector<SVGPathElement>('.cxn__edge-line');
    const dotA = g.querySelector<SVGCircleElement>('.cxn__edge-dot[data-end="a"]');
    const dotB = g.querySelector<SVGCircleElement>('.cxn__edge-dot[data-end="b"]');
    if (a && b && line && dotA && dotB) edges.push({ a, b, route: g.dataset.route, line, dotA, dotB });
  }

  const fx = (v: number) => Math.round(v * 10) / 10;
  const rectOf = (el: HTMLElement): Rect => ({
    x: el.offsetLeft,
    y: el.offsetTop,
    w: el.offsetWidth,
    h: el.offsetHeight,
  });
  const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  /** First boundary crossing of the GAP-inflated rect, walking from its centre
   *  toward (tx, ty) — where the connector leaves the card. */
  const exitPoint = (r: Rect, tx: number, ty: number): Pt => {
    const c = center(r);
    const dx = tx - c.x;
    const dy = ty - c.y;
    let t = 1;
    if (dx > 0) t = Math.min(t, (r.x + r.w + GAP - c.x) / dx);
    if (dx < 0) t = Math.min(t, (r.x - GAP - c.x) / dx);
    if (dy > 0) t = Math.min(t, (r.y + r.h + GAP - c.y) / dy);
    if (dy < 0) t = Math.min(t, (r.y - GAP - c.y) / dy);
    return { x: c.x + dx * Math.max(0, t), y: c.y + dy * Math.max(0, t) };
  };

  /** Liang–Barsky: does the p→q segment pass through the (slightly inflated)
   *  rect? Used to detect a third card sitting on a straight run. */
  const segHits = (p: Pt, q: Pt, r: Rect): boolean => {
    const pad = 3;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    let t0 = 0;
    let t1 = 1;
    const sides: [number, number][] = [
      [-dx, p.x - (r.x - pad)],
      [dx, r.x + r.w + pad - p.x],
      [-dy, p.y - (r.y - pad)],
      [dy, r.y + r.h + pad - p.y],
    ];
    for (const [den, num] of sides) {
      if (den === 0) {
        if (num < 0) return false;
        continue;
      }
      const t = num / den;
      if (den < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
    return t1 > t0;
  };

  const compute = () => {
    const w = map.clientWidth;
    const h = map.clientHeight;
    if (!w || !h) return;
    // Reads first (one layout), then writes — the SVG is position:absolute so
    // no write below can resize the map (no ResizeObserver feedback loop).
    const rects = new Map<HTMLElement, Rect>();
    for (const node of nodes) rects.set(node, rectOf(node));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    for (const edge of edges) {
      const ra = rects.get(edge.a) as Rect;
      const rb = rects.get(edge.b) as Rect;
      const ca = center(ra);
      const cb = center(rb);
      const sharesRow = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y) > 0;
      let pa: Pt;
      let pb: Pt;
      let d: string;
      if (edge.route === 'top' && sharesRow) {
        // Over-the-row arch: exit both cards through their TOP border and run
        // through the grid headroom (padding-top on .cxn__nodes) — never
        // across the card sitting between them.
        pa = { x: ca.x, y: ra.y - GAP };
        pb = { x: cb.x, y: rb.y - GAP };
        const apex = Math.max(3, Math.min(pa.y, pb.y) - ARCH_CLEAR);
        d = `M ${fx(pa.x)} ${fx(pa.y)} C ${fx(pa.x)} ${fx(apex)} ${fx(pb.x)} ${fx(apex)} ${fx(pb.x)} ${fx(pb.y)}`;
      } else {
        pa = exitPoint(ra, cb.x, cb.y);
        pb = exitPoint(rb, ca.x, ca.y);
        const blockers: Rect[] = [];
        for (const [el, r] of rects) {
          if (el !== edge.a && el !== edge.b && segHits(pa, pb, r)) blockers.push(r);
        }
        if (blockers.length) {
          // Bow the run around the blocking card(s): quadratic control point
          // on the segment normal, on the side AWAY from the blockers' mean
          // centre (the curve midpoint sits at half the control offset).
          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
          const nx = -(pb.y - pa.y) / len;
          const ny = (pb.x - pa.x) / len;
          let sx = 0;
          let sy = 0;
          for (const r of blockers) {
            const c = center(r);
            sx += c.x / blockers.length;
            sy += c.y / blockers.length;
          }
          const side = nx * (sx - mx) + ny * (sy - my) > 0 ? -1 : 1;
          let clear = 18;
          for (const r of blockers) clear = Math.max(clear, Math.min(r.w, r.h) / 2 + 14);
          const off = Math.min(BOW_MAX, clear) * side * 2;
          d = `M ${fx(pa.x)} ${fx(pa.y)} Q ${fx(mx + nx * off)} ${fx(my + ny * off)} ${fx(pb.x)} ${fx(pb.y)}`;
        } else {
          d = `M ${fx(pa.x)} ${fx(pa.y)} L ${fx(pb.x)} ${fx(pb.y)}`;
        }
      }
      edge.line.setAttribute('d', d);
      edge.dotA.setAttribute('cx', String(fx(pa.x)));
      edge.dotA.setAttribute('cy', String(fx(pa.y)));
      edge.dotB.setAttribute('cx', String(fx(pb.x)));
      edge.dotB.setAttribute('cy', String(fx(pb.y)));
    }
    // The stamp is what lets CSS show the SVG (≥ the 2-column tier) — no-JS
    // never stamps, so the fallback is the clean grid + the relations text.
    if (!map.dataset.cxnReady) map.dataset.cxnReady = 'true';
  };

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      compute();
    });
  };

  const ro = new ResizeObserver(schedule);
  ro.observe(map);
  for (const node of nodes) ro.observe(node);
  schedule();
}

// Side-effect module (the loader dynamic-imports it) — the empty export marks
// it a module for TS (ts2306) without changing the emitted chunk.
export {};
