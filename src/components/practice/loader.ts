/**
 * Practice-widget loader (US-034, extracted in US-606) — the [data-practice]
 * dispatch, shared by the home page (PageBody) and the research reader pages
 * (ResearchArticle) via the ResearchPractice partial's processed <script>.
 *
 * A thin side-effect module (no GSAP, no framework — the manual's "islands →
 * ship minimal JS, hydrate only the WebGL canvas", §11). Each [data-practice]
 * region is upgraded by a widget module dynamically imported ON APPROACH
 * (IntersectionObserver, ~300px lead), so the widget code (CodeMirror) is
 * code-split into an on-demand chunk that never enters the initial bundle.
 * Dispatch is BY practiceType via the registry — codemirror (US-034) is the
 * only published widget since US-1605 unpublished the quiz/sandpack chapters
 * (their modules were deleted with them); a new widget is one registry line,
 * no loader change.
 *
 * Runs regardless of reduced motion (the editor is content/interaction, not
 * gratuitous motion — its only motion, the caret blink, is disabled under
 * reduced motion by the global .cm-cursor rule in ResearchPractice.astro, P5).
 * A failed chunk/module load leaves the static <pre> in place (honest
 * degradation — the import() stays try/caught).
 */
type WidgetModule = { mount: (region: HTMLElement) => void | Promise<void> };
const registry: Record<string, () => Promise<WidgetModule>> = {
  codemirror: () => import('./codemirror'),
};

const mountRegion = async (region: HTMLElement) => {
  const type = region.dataset.practiceType;
  const load = type ? registry[type] : undefined;
  if (!load) return; // unknown practice type → graceful no-op
  try {
    const mod = await load();
    await mod.mount(region);
  } catch {
    /* chunk/widget load failed → keep the static <pre> (honest fallback) */
  }
};

const regions = document.querySelectorAll<HTMLElement>('[data-practice]');
if (regions.length) {
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          obs.unobserve(entry.target); // mount once
          void mountRegion(entry.target as HTMLElement);
        }
      },
      { rootMargin: '300px 0px' },
    );
    regions.forEach((r) => io.observe(r));
  } else {
    regions.forEach((r) => void mountRegion(r));
  }
}

export {};
