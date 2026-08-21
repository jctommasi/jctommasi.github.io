/**
 * Research pipeline model (2026-08-08 owner ask — the "07 / RESEARCH PIPELINE"
 * lab-console redesign of the Research section).
 *
 * The Research section is no longer a stack of collapsible chapter cards; it is
 * an offensive-security lab pipeline — each investigation is one row advancing
 * through five shared stages (hypothesis → publish). This module is the DATA +
 * pure helpers for that view (rendering lives in PageBody.astro). It is the
 * "data-driven, not duplicated markup" source the redesign requires.
 *
 * WHAT IS REAL vs DEMO (P3 — no fabricated content):
 *  - The PUBLISHED rows are DERIVED from research-chapters.json (the real,
 *    published research). buildPipeline() maps each published chapter to a
 *    { status:'published', currentStage:'publish' } row that links to its
 *    reader page. This is genuine content, single-sourced from the collection.
 *  - The DEMO roadmap rows (validated / in-progress / upcoming) below are
 *    PLACEHOLDERS to demonstrate the non-published pipeline states while the
 *    owner's real roadmap is private. They are NOT real research. Every one
 *    carries isDemo:true (surfaced as a data-demo attribute + a build warning),
 *    none links anywhere, and the whole set is gated behind SHOW_DEMO_PIPELINE.
 *    Flip that flag to false to ship the real published research alone, or
 *    replace DEMO_PIPELINE with real entries — zero component change either way.
 *
 * LANGUAGE-AGNOSTIC CHROME (US-003 precedent): the stage codes (HYPOTHESIS …),
 * the status codes (IN PROGRESS …) and the screen-reader progress sentence are
 * TECHNICAL LABELS of an internal lab console — like the shell literals
 * (`$ ls`, `bash: … command not found`, `visitor visitor`) and the MITRE IDs
 * elsewhere, they read the same in both locales. So this view adds ZERO new P8
 * strings and never goes through pick(). The one bilingual value — a real
 * chapter's TITLE — is picked by the caller before it reaches ResearchItem.
 *
 * TWO GATES LIVE HERE, both off by default since 2026-08-20 — SHOW_RESEARCH
 * (the whole feature) just below, and SHOW_DEMO_PIPELINE (the placeholder
 * roadmap rows) further down. They are kept in one module so every research
 * switch is found together.
 */

/* ------------------------------------------------------------------ */
/* SECTION VISIBILITY — the whole research feature, on one switch.     */
/* ------------------------------------------------------------------ */

/**
 * Ship the research feature at all? (owner call 2026-08-20: "ocultar
 * temporalmente… quiero dejar la sección disponible para un futuro" — the one
 * chapter in research-chapters.json is not finished yet, so nothing is ready to
 * publish.) false hides it END TO END and leaves no dead ends behind:
 *  - PageBody drops the whole #research section (SiteNav then also drops the
 *    `research` nav anchor, so no /#research fragment points at nothing),
 *  - both reader routes return no paths from getStaticPaths ⇒ the pages are
 *    not built (an unfinished article must not stay reachable by URL), and
 *  - sitemap.xml drops their <loc> entries, so nothing unlinked stays indexed.
 *
 * NOTHING is deleted to hide it: the section markup, this model, the reader
 * components, the `.research*`/`.pipe*` styles and the research strings all
 * stay in place, dormant (the SHOW_CV_CONTROL precedent, US-1601). Flipping
 * this back to true restores the feature with zero other change — the section
 * returns after #articles, the nav anchor comes back, and the reader pages +
 * their sitemap entries rebuild from the collection.
 *
 * Typed `boolean` (not the inferred literal) so BOTH branches stay type-checked
 * while the flag is off.
 */
export const SHOW_RESEARCH: boolean = true;

/** The five shared pipeline stages, in lifecycle order. */
export type ResearchStage = 'hypothesis' | 'test' | 'exploit' | 'validate' | 'publish';

/** Where an investigation sits in its life. */
export type ResearchStatus = 'published' | 'validated' | 'in-progress' | 'upcoming';

export interface ResearchItem {
  /** Short lab code (LAB-001 …). Derived for real rows, explicit for demo. */
  id: string;
  /** Render-ready title. Redaction is already applied here — a redacted item
   *  stores "[REDACTED RESEARCH]", never a real title, so nothing sensitive can
   *  reach the DOM, an attribute, a comment or a client payload. */
  title: string;
  /** The stage the investigation is CURRENTLY at; progress is derived from this
   *  (never five per-item booleans). */
  currentStage: ResearchStage;
  status: ResearchStatus;
  /** Render-ready tags (redacted rows carry the generalized ["CLASSIFIED"]). */
  tags: string[];
  /** Optional freeform date/ETA shown under the status (language-agnostic). */
  displayDate?: string;
  /** Present ONLY for genuinely published research with a real destination.
   *  A row without an href renders a STATIC title (never an <a href="#"> or a
   *  link without a destination). */
  href?: string;
  /** True → the title/tags are the redacted placeholders above. */
  isRedacted?: boolean;
  /** True → a placeholder roadmap row, not real research (P3). */
  isDemo?: boolean;
}

/** Stage descriptor: `code` is the visible uppercase console label, `name` the
 *  title-case word used in the accessible progress sentence, `icon` an
 *  Icon.astro glyph name (decorative). */
export interface StageMeta {
  id: ResearchStage;
  code: string;
  name: string;
  icon: string;
}

export const RESEARCH_STAGES: readonly StageMeta[] = [
  { id: 'hypothesis', code: 'HYPOTHESIS', name: 'Hypothesis', icon: 'lightbulb' },
  { id: 'test', code: 'TEST', name: 'Test', icon: 'flask' },
  { id: 'exploit', code: 'EXPLOIT', name: 'Exploit', icon: 'crosshair' },
  { id: 'validate', code: 'VALIDATE', name: 'Validate', icon: 'shield' },
  { id: 'publish', code: 'PUBLISH', name: 'Publish', icon: 'flag' },
];

export const STAGE_COUNT = RESEARCH_STAGES.length;

/** Index of a stage in the lifecycle (0-based). Progress = this vs each cell. */
export const stageIndex = (stage: ResearchStage): number =>
  RESEARCH_STAGES.findIndex((s) => s.id === stage);

/** status → { code (visible), name (spoken) }. Language-agnostic codes. */
export const STATUS_META: Record<ResearchStatus, { code: string; name: string }> = {
  published: { code: 'PUBLISHED', name: 'Published' },
  validated: { code: 'VALIDATED', name: 'Validated' },
  'in-progress': { code: 'IN PROGRESS', name: 'In progress' },
  upcoming: { code: 'UPCOMING', name: 'Upcoming' },
};

/**
 * The accessible progress sentence for one row (the "Stage 3 of 5: Exploit"
 * the redesign asks for). Rendered into a visually-hidden .alien-sr span so
 * assistive tech gets the pipeline position the decorative nodes convey to
 * sighted users. Language-agnostic (see the module header). The visible status
 * label carries the status separately, so this sentence stays progress-only to
 * avoid a duplicate reading.
 */
export function progressText(item: ResearchItem): string {
  const i = stageIndex(item.currentStage);
  const stage = RESEARCH_STAGES[i];
  return `Pipeline stage ${i + 1} of ${STAGE_COUNT}: ${stage.name}.`;
}

/* ------------------------------------------------------------------ */
/* DEMO ROADMAP — placeholders, NOT real research (P3).                */
/* ------------------------------------------------------------------ */

/**
 * Ship the demo roadmap rows? true renders LAB-002…004 below so the pipeline
 * demonstrates the validated / in-progress / upcoming states. Set to false to
 * ship ONLY the real published research (the pipeline then collapses to the
 * chapters in research-chapters.json), or replace DEMO_PIPELINE with real work.
 *
 * OFF since 2026-08-20 (owner call, taken with SHOW_RESEARCH above): when the
 * section comes back it should come back carrying real research alone, never
 * placeholders (P3). DEMO_PIPELINE below stays for whenever the states need
 * demonstrating again.
 */
export const SHOW_DEMO_PIPELINE: boolean = false;

export const DEMO_PIPELINE: readonly ResearchItem[] = [
  {
    id: 'LAB-002',
    title: 'OAuth Token Replay in Multi-Tenant SaaS',
    currentStage: 'validate',
    status: 'validated',
    displayDate: 'COMING SOON',
    tags: ['OAuth', 'Token Replay', 'Multi-Tenant'],
    isDemo: true,
  },
  {
    id: 'LAB-003',
    title: 'Supply-Chain Attacks via VS Code Extensions',
    currentStage: 'exploit',
    status: 'in-progress',
    displayDate: 'IN PROGRESS',
    tags: ['Supply Chain', 'VS Code', 'Extension Security'],
    isDemo: true,
  },
  {
    // Redacted at the SOURCE (privacy + P3): the title and tags stored here ARE
    // the redacted placeholders — there is no real title/tag to leak, and the
    // row gets no href.
    id: 'LAB-004',
    title: '[REDACTED RESEARCH]',
    currentStage: 'test',
    status: 'upcoming',
    displayDate: 'UPCOMING',
    tags: ['CLASSIFIED'],
    isRedacted: true,
    isDemo: true,
  },
];

/** Minimal shape a published chapter must supply to buildPipeline (already
 *  locale-picked title). Keeps this module free of the content-collection /
 *  i18n imports. */
export interface PublishedChapter {
  id: string;
  order: number;
  title: string;
  tags: string[];
}

/**
 * Build the pipeline rows: the real PUBLISHED chapters first (linking to their
 * reader page), then the demo roadmap when SHOW_DEMO_PIPELINE is on.
 *
 * @param chapters   published chapters, title already picked for the locale.
 * @param readerHref chapter id → its reader-page URL (locale-aware, from PageBody).
 */
export function buildPipeline(
  chapters: readonly PublishedChapter[],
  readerHref: (id: string) => string,
): ResearchItem[] {
  const real: ResearchItem[] = chapters.map((ch) => ({
    id: `LAB-${String(ch.order).padStart(3, '0')}`,
    title: ch.title,
    currentStage: 'publish',
    status: 'published',
    tags: ch.tags,
    href: readerHref(ch.id),
  }));
  return SHOW_DEMO_PIPELINE ? [...real, ...DEMO_PIPELINE] : real;
}
