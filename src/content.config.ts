/**
 * Content collections for the four src/data/ seed JSON files (US-002).
 *
 * These Zod schemas are the AUTHORITATIVE schema definition for the site's
 * data layer (the manual's `docs/schemas.md` does not exist in this repo).
 * Every collection loads its whole file as a single entry (id = file stem),
 * so cross-cutting invariants (locale parity, unique chapter ids/orders,
 * exactly one hobby of each type) are enforced here and any drift fails
 * `astro build` loudly with the offending path.
 *
 * Schema philosophy:
 * - Shapes are pinned strictly (strictObject: unknown keys are drift), but
 *   content counts (e.g. number of pillars/roles) are data, not schema.
 * - `todoCapable` marks string fields whose seed value is an intentional
 *   `{{TODO: …}}` placeholder (manual §9.4). The schema ACCEPTS the literal —
 *   honest seed state is valid data — and data accessors must normalize it
 *   (null / state flag) before it can reach templates or island props (P1;
 *   enforced mechanically by the US-006 dist lint).
 * - Per-field `{es,en}` objects (`localized`) make ES/EN parity structural
 *   for content files; site-strings parity is enforced by a superRefine (P8).
 */
import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
// astro:content's `z` re-export is deprecated in Astro 6; astro/zod is the
// supported zod (v4) surface and carries the type namespace (z.ZodType etc.).
import { z } from 'astro/zod';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Bilingual human-facing string: both locales required, never empty (P8/G4). */
const localized = z.strictObject({
  es: z.string().min(1),
  en: z.string().min(1),
});

/**
 * String field that may hold a `{{TODO: …}}` placeholder in seed data.
 * Valid at the schema layer; must never reach the DOM as a literal (P1).
 */
const todoCapable = z.string().min(1);

/** Seed locale list, frozen in order (es, en). */
const seedLocales = z.tuple([z.literal('es'), z.literal('en')]);

const yearOrPresent = z.union([z.number().int(), z.literal('Present')]);

/** file() parser: load a whole single-object JSON file as one entry. */
const asSingleEntry = (id: string) => ({
  parser: (text: string): Record<string, Record<string, unknown>> => ({
    [id]: JSON.parse(text) as Record<string, unknown>,
  }),
});

/* ------------------------------------------------------------------ */
/* cv.json — canonical content store (manual §9.1, US-000b)            */
/* Human-facing prose fields are per-field {es,en} objects (US-003):   */
/* es is a faithful translation of en (P3 — no new facts). Identifiers */
/* (org, period, years, tags, URLs, emails, icons) and tool-name lists */
/* (skills[].items) stay language-agnostic plain strings.              */
/* ------------------------------------------------------------------ */

const cvSchema = z.strictObject({
  _source: z.string(),
  _note: z.string(),
  name: z.string().min(1),
  title: localized,
  email: z.email(),
  blogUrl: z.url(),
  locales: seedLocales,
  profile: z.strictObject({
    headline: localized,
    body: z.array(localized).min(1),
    // US-1604: `offensive` was REMOVED (deliberate schema edit — the data-shape
    // rule). The corporate offensive-security tenure is no longer a literal:
    // the prose carries the `{yearsOffensive}` token and src/data/years.ts
    // computes it from February 2020 at build time, so a numeric duplicate here
    // could only ever go stale. `backend` + `aiAutomation` are fixed historical
    // spans and stay.
    yearsExperience: z.strictObject({
      backend: z.number().int().nonnegative(),
      aiAutomation: z.number().int().nonnegative(),
    }),
    origin: localized,
  }),
  specializations: z.array(localized).min(1),
  competencies: z.strictObject({
    summary: localized,
    pillars: z.array(localized).min(1),
    purpleTeam: localized,
  }),
  skills: z
    .array(
      z.strictObject({
        category: localized,
        items: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  experience: z
    .array(
      z.strictObject({
        org: z.string().min(1),
        role: localized,
        period: z.string().min(1),
        startYear: z.number().int(),
        endYear: yearOrPresent,
        highlights: z.array(localized).min(1),
        tags: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  education: z
    .array(
      z.strictObject({
        institution: localized,
        credential: localized,
        period: z.string().min(1),
        startYear: z.number().int(),
        endYear: yearOrPresent,
        notes: localized,
      }),
    )
    .min(1),
  interests: z
    .array(
      z.strictObject({
        label: localized,
        icon: z.string().min(1),
      }),
    )
    .min(1),
  articles: z
    .array(
      z.strictObject({
        title: z.string().min(1),
        source: z.string().min(1),
        url: z.url(),
        publication: z.string().min(1),
        // US-1704: the publication date as ONE ISO calendar day (language-
        // agnostic, like every other identifier here). The rendered per-locale
        // string is derived from THIS value at build time via Intl (PageBody) —
        // never a second, translatable copy that could drift.
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        // US-022 typed this todoCapable while both permalinks were {{TODO}}
        // placeholders and the link fell back to `url`. US-1704 landed the two
        // real, verified permalinks; the type stays todoCapable so a future
        // article may be added before its URL is known (resolveTodo ?? url).
        exactPermalink: todoCapable,
        // 2026-08-08 editorial-stack restyle: an OPTIONAL bilingual dek — the
        // short description under the title in the editorial row. ABSENT in
        // the seed data (writing one would be authoring new claims about the
        // article, P3); a real {es,en} value renders via pick() with zero code
        // change (the US-033 transcriptText drop-in-slot precedent).
        description: localized.optional(),
      }),
    )
    .min(1),
  contact: z.strictObject({
    email: z.email(),
    blogUrl: z.url(),
    social: z
      .array(z.strictObject({ label: z.string().min(1), url: z.url() }))
      .min(1),
  }),
});

/* ------------------------------------------------------------------ */
/* site-strings.json — UI string bundle (manual §9.2, P8)              */
/* ------------------------------------------------------------------ */

/**
 * Additive string keys (P8): a new key may be a leaf string or a nested
 * group of strings. Parity across es/en is enforced by the superRefine below.
 */
type StringTree = string | { [key: string]: StringTree };
const stringTree: z.ZodType<StringTree> = z.lazy(() =>
  z.union([z.string().min(1), z.record(z.string(), stringTree)]),
);

const requiredStrings = <const K extends string>(keys: readonly K[]) =>
  z
    .object(
      Object.fromEntries(keys.map((k) => [k, z.string().min(1)])) as Record<
        K,
        z.ZodString
      >,
    )
    .catchall(stringTree);

/**
 * One locale's bundle. Every key listed in a `requiredStrings([...])` is a
 * REQUIRED, parity-checked key (P8): the frozen seed keys PLUS app-added strings
 * the UI reads in typed code (so they infer as `string`, not `StringTree`) —
 * e.g. `nav.label` and `cta.comingSoon` (US-014). Removing or renaming any of
 * them fails the build. `.catchall(stringTree)` remains the additive path for
 * keys not (yet) consumed in typed contexts. `switcher` is retained per the
 * seed freeze but UNUSED by the app (no theme picker; manual §9.2, Appendix D).
 */
const seedBundle = z
  .object({
    // `label` (US-014) = the primary nav's accessible name; the other six are
    // the seed nav anchors. Iterated explicitly in SiteNav, never as a set.
    nav: requiredStrings(['home', 'about', 'work', 'research', 'experience', 'contact', 'label']),
    sections: requiredStrings([
      'hero',
      'about',
      'competencies',
      'skills',
      'work',
      'research',
      'articles',
      'experience',
      'education',
      'aeronautics',
      'music',
      'interests',
      'contact',
    ]),
    // US-017: chrome labels the app authors, rendered INSIDE a section's body
    // (distinct from `sections`, the 13 landmark headings). `purpleTeam` labels
    // the competencies purple-team callout (an <h3>). US-041 adds `licensedPilot`
    // — the text of the aeronautics verified-credential mark (a non-heading
    // badge, gated on hobbies.meta.isLicensedPilot, so the heading invariant is
    // unchanged). Read in typed code, so requiredStrings (infers as `string`,
    // parity-enforced both ways). 2026-07-03 adds the flight-logbook chrome:
    // `nightRating` (the second credential badge, gated on meta.isNightRated),
    // `logbook` (the logbook <h3> — the ONE new heading), `logbookTotal` (the
    // total-hours counter label) and the four column headers (`logDate`,
    // `logAircraft`, `logRoute`, `logHours`) — the logbook ENTRIES themselves are
    // language-agnostic identifiers from the live sheet (dates/registrations/
    // airfield codes/H:MM figures, US-003), so only this chrome is translatable.
    // US-1403 (live-logbook shell) adds exactly 3: `logLandings` (the second
    // counter tile beside Total Hours), `logStatusPending` (the honest at-rest /
    // no-JS status line) and `logStatusLoading` (the fetch-in-flight status the
    // US-1404 module swaps in).
    // 2026-08-08 editorial-stack restyle adds `article` — the small kicker
    // label over each write-up title in the Articles rows. aria-hidden (the
    // <ul> under the Articles h2 already names the set, so AT never hears the
    // repeat) but VISIBLE text, so it is localized like any chrome label.
    // The 2026-08-08 Flight Strip redesign adds `logShowMore`/`logShowFewer` —
    // the Show-all disclosure under the strip bay (a `{count}` template, the
    // `{n}` convention; the count is DERIVED from the live sheet row count by
    // flight-log.ts, never authored — P3).
    labels: requiredStrings([
      'article',
      'purpleTeam',
      'licensedPilot',
      'nightRating',
      'logbook',
      'logbookTotal',
      'logLandings',
      'logDate',
      'logAircraft',
      'logRoute',
      'logHours',
      'logStatusPending',
      'logStatusLoading',
      'logShowMore',
      'logShowFewer',
    ]),
    // Music section chrome. 2026-08-09 "01 — Cover Flow" redesign (+ the
    // same-day cover-as-link correction): the section is a titled album
    // selector per collection (src/data/music-albums.ts) — `openAlbum` is the
    // ACTIVE COVER link's accessible-name TEMPLATE (`{title}`/`{artist}`
    // placeholders filled at render — "Open “Animals” by Pink Floyd on
    // TIDAL"), `prevAlbum`/`nextAlbum` name the step controls, `albumPosition`
    // is the screen-reader position TEMPLATE (`{n}`/`{total}`), `linkPending`
    // is the honest text for an album without a real Tidal URL and
    // `albumsPending` the empty-collection message. Album titles/artists/URLs
    // are language-agnostic identifiers (US-003), so these are the only
    // translatable chrome the feature needs. FROZEN-UNUSED (the `switcher` P8
    // precedent — parity never breaks, re-adding is code-only): the US-1609
    // playlist keys (`playlistTitle`, `playlistPending`) since the embeds
    // left, and `openOnTidal` since the visible link button was replaced by
    // the cover-as-link. Read in typed code, so requiredStrings (infers
    // `string`, parity-enforced both locales).
    music: requiredStrings([
      'playlistTitle',
      'playlistPending',
      'openOnTidal',
      'openAlbum',
      'prevAlbum',
      'nextAlbum',
      'albumPosition',
      'linkPending',
      'albumsPending',
    ]),
    // US-025: the research section's lead-in paragraph — chrome prose rendered
    // in the section body (distinct from the `sections` landmark heading).
    // US-1605 dropped its `{count}` placeholder (and the plural phrasing that
    // needed it) when the published set shrank to one chapter: the string is
    // count-free prose now, rendered verbatim, so it can never claim a stale
    // number. Read in typed code, so requiredStrings (infers `string`,
    // parity-enforced).
    research: requiredStrings(['lead']),
    // US-034: per-chapter practice widget chrome. `label` captions the widget
    // region (a non-heading <span>, so the heading invariant is unchanged) and
    // composes the editor's accessible name; `editorHint` tells keyboard users
    // how to operate/leave the editor (Tab indents · Esc exits).
    // US-035 (quiz widget) adds: `quizHint` (the analogue of `editorHint` —
    // tells keyboard users a choice gives instant feedback) and the instant
    // verdict words `correct` / `incorrect` (the visible + announced feedback;
    // a glyph cue accompanies them so correctness never relies on colour alone).
    // US-036 (Sandpack widget) adds: `sandboxHint` (tells keyboard users they can
    // edit and the preview re-runs), `previewLoading` (the live-region status while
    // the bundler boots), `previewUnavailable` (the honest offline/failed-CDN
    // message — never a blank region) and `previewTitle` (the preview iframe's
    // accessible name).
    // US-037 (CodeMirror chapter content + detection mappings) adds the labels for
    // the per-chapter purple-team pairing rendered below each codemirror editor:
    // `detectionTitle` (the block label), `techniquesLabel` (the MITRE ATT&CK/ATLAS
    // technique list), `detectionRuleLabel` (the paired Sysmon/SPL/KQL/Sigma rule).
    // The technique IDs/names and rule bodies are language-agnostic data (US-003),
    // so only these chrome labels are P8. All read in typed code, so requiredStrings
    // (infers `string`, parity-enforced both locales).
    practice: requiredStrings([
      'label',
      'editorHint',
      'quizHint',
      'correct',
      'incorrect',
      'sandboxHint',
      'previewLoading',
      'previewUnavailable',
      'previewTitle',
      'detectionTitle',
      'techniquesLabel',
      'detectionRuleLabel',
    ]),
    // US-201: hero terminal commands. `commands` holds the PAYLOADS only — the
    // `neo@matrix:~$` prompt and `echo '…'` wrapper are language-agnostic
    // presentation rendered in the template, not stored. Any count ≥ 1 (seed =
    // 2), and the template + typewriter iterate the array generically, so more
    // commands are added with data + translation only (no code change). Both
    // locales must match — the parity superRefine walks each `commands[i]`
    // (Object.entries on the array yields index paths `hero.commands.0`, `.1`,
    // …), so an uneven count fails as a parity gap. `.catchall` keeps the group
    // open to future additive hero strings.
    hero: z
      .object({
        commands: z.array(z.string().min(1)).min(1),
      })
      .catchall(stringTree),
    // US-1606: the interactive hero terminal. `inputLabel` is the accessible
    // name of the runtime-created command input (the ONE new string this story
    // needs). Everything the shell PRINTS — `visitor`, `bash: <cmd>: command
    // not found` — is a language-agnostic shell literal (US-003, like the
    // `jctommasi@website:~$` prompt and the `echo '…'` wrapper), so it is NOT
    // translatable chrome and never enters the bundle. Read in typed code, so
    // requiredStrings (infers `string`, parity-enforced both locales).
    terminal: requiredStrings(['inputLabel']),
    switcher: z
      .object({
        buttonLabel: z.string().min(1),
        menuLabel: z.string().min(1),
        ariaLabelTemplate: z.string().min(1),
        statusTemplate: z.string().min(1),
        themes: requiredStrings([
          'terminal-neon',
          'cockpit-aero',
          'editorial-minimal',
          'hybrid-terminal-aero',
        ]),
      })
      .catchall(stringTree),
    cta: requiredStrings([
      'viewWork',
      'readResearch',
      'getInTouch',
      'downloadCv',
      'listen',
      'readTranscript',
      'skipToContent',
      // US-014: honest "coming soon" label for not-yet-available actions (P1).
      'comingSoon',
      // US-032: accessible label for the disabled per-chapter audio control while
      // its audioUrl is still a {{TODO}} placeholder — explains the pending state
      // to assistive tech (the visible affordance uses `listen` + `comingSoon`).
      'audioPending',
      // US-033: the message shown inside an opened transcript region while the
      // copy is not yet written (the toggle uses `readTranscript`). Mirrors
      // `audioPending` — an honest "coming soon" affordance (P1).
      'transcriptPending',
      // Motion toggle (SiteNav): the full WebGL experience is the default for
      // everyone, with an in-page control to switch to the calm/poster version.
      // `enableEffects` shows when the calm version is active; `reduceMotion`
      // shows when full motion is active (the visible label IS the action).
      'enableEffects',
      'reduceMotion',
      // US-605 research reader pages: the per-chapter "read the full article"
      // action link (home cards), the reader's back-to-home link, and the honest
      // "coming soon" notice shown while a chapter's bodyText slot is absent.
      'readArticle',
      'backToPortfolio',
      'articleBodyPending',
    ]),
    locale: requiredStrings(['label', 'es', 'en']),
  })
  .catchall(stringTree);

/** Collect every nested key path of a string tree ("cta.downloadCv", …). */
function collectKeyPaths(node: unknown, prefix: string, out: Set<string>): void {
  if (typeof node !== 'object' || node === null) return;
  for (const [key, value] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    out.add(path);
    collectKeyPaths(value, path, out);
  }
}

const siteStringsSchema = z
  .strictObject({
    _note: z.string(),
    // Seed value stays 'es' (P8 freeze); the i18n layer applies EN as the
    // build's default locale (manual §10) — never edit this file for that.
    defaultLocale: z.literal('es'),
    locales: seedLocales,
    es: seedBundle,
    en: seedBundle,
  })
  .superRefine((bundle, ctx) => {
    // P8 parity gate: every key path present in one locale must exist in the
    // other — covers seed AND app-added keys.
    const esPaths = new Set<string>();
    const enPaths = new Set<string>();
    collectKeyPaths(bundle.es, '', esPaths);
    collectKeyPaths(bundle.en, '', enPaths);
    for (const [have, haveName, missName] of [
      [esPaths, 'es', 'en'],
      [enPaths, 'en', 'es'],
    ] as const) {
      const other = haveName === 'es' ? enPaths : esPaths;
      const missing = [...have].filter((p) => !other.has(p));
      if (missing.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: [missName],
          message: `Locale parity violation (P8): key path(s) present in "${haveName}" but missing in "${missName}": ${missing.join(', ')}`,
        });
      }
    }
  });

/* ------------------------------------------------------------------ */
/* research-chapters.json — the 6 chapters (manual §9.2)               */
/* ------------------------------------------------------------------ */

/**
 * One block of a reader-page article body (2026-08-20). A discriminated union
 * on `kind`, so an unknown block type fails the build rather than rendering
 * nothing.
 *
 * WHAT IS AND IS NOT LOCALIZED (the US-003 split, applied here): prose —
 * headings, paragraphs, figure alt text and captions — is `localized`, so ES/EN
 * parity stays structural. Code listings and image paths are language-agnostic
 * IDENTIFIERS: a payload repeats UNCHANGED in both locales exactly like the
 * detection rules and MITRE IDs, so `code`/`lang`/`src` are plain strings.
 *
 * A figure's `width`/`height` are REQUIRED: the reader reserves the box from
 * them so evidence images cost ZERO CLS by construction, never by measurement
 * (the house reservation rule). `alt` is required and bilingual because these
 * are content images carrying meaning (P4).
 */
const articleBlock = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('heading'), text: localized }),
  z.strictObject({ kind: z.literal('paragraph'), text: localized }),
  z.strictObject({
    kind: z.literal('code'),
    lang: z.string().min(1),
    code: z.string().min(1),
    caption: localized.optional(),
  }),
  z.strictObject({
    kind: z.literal('figure'),
    src: z.string().regex(/^\/[\w./-]+\.(png|jpg|jpeg|webp|svg)$/, 'figure src must be a site-absolute image path'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alt: localized,
    caption: localized,
  }),
]);

const researchChapter = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'chapter id must be a language-agnostic slug'),
  order: z.number().int().min(1),
  practiceType: z.enum(['codemirror', 'quiz', 'sandpack']),
  lang: seedLocales,
  // `transcript: true` means the chapter offers a transcript affordance (all 6
  // do); the bilingual copy itself lives in the OPTIONAL `transcriptText` slot
  // below (US-033).
  transcript: z.boolean(),
  // Intentional {{TODO}} until real episodes exist; normalize to
  // null + 'pending' state at the data layer before render (P1, US-032).
  audioUrl: todoCapable,
  // US-033 transcript drop-in slot: the bilingual transcript prose. ABSENT in
  // seed data (the copy is not written yet) → the chapter's transcript region
  // shows the honest "coming soon" affordance. When real copy lands, dropping a
  // `{es,en}` value here renders it with ZERO code change (read via
  // resolveTodo(pick(...)) so even a stray {{TODO}} half normalizes to pending,
  // P1). Optional, but `localized` when present ⇒ ES/EN parity stays structural.
  transcriptText: localized.optional(),
  // US-605 reader-page drop-in slot (mirrors transcriptText): the article body
  // for the chapter's dedicated reader page. ABSENT ⇒ the reader shows the
  // honest cta.articleBodyPending notice (P3 — never a fabricated draft);
  // present ⇒ it renders with ZERO component change.
  //
  // 2026-08-20: the slot was `bodyText` (one bilingual string split on blank
  // lines) until the first REAL article landed — a security write-up needs
  // section headings, evidence figures and code listings, not just prose — so
  // it became this BLOCK LIST. A `paragraph` block is exactly the old
  // element, so the drop-in contract is unchanged; only the shape is richer.
  bodyBlocks: z.array(articleBlock).min(1).optional(),
  title: localized,
  summary: localized,
  tags: z.array(z.string().min(1)).min(1),
});

const researchChaptersSchema = z.strictObject({
  _note: z.string(),
  chapters: z
    .array(researchChapter)
    .min(1)
    .superRefine((chapters, ctx) => {
      const seen = new Map<string, Set<string | number>>([
        ['id', new Set()],
        ['order', new Set()],
      ]);
      chapters.forEach((chapter, index) => {
        for (const field of ['id', 'order'] as const) {
          const bucket = seen.get(field)!;
          if (bucket.has(chapter[field])) {
            ctx.addIssue({
              code: 'custom',
              path: [index, field],
              message: `duplicate chapter ${field}: ${String(chapter[field])}`,
            });
          }
          bucket.add(chapter[field]);
        }
      });
    }),
});

/* ------------------------------------------------------------------ */
/* hobbies.json — aeronautics + music (manual §9.2)                    */
/* ------------------------------------------------------------------ */

// Both src and alt are {{TODO}} placeholders today. When real images land,
// alt stays REQUIRED and must be meaningful (P4, US-041 drop-in rule).
const galleryItem = z.strictObject({ src: todoCapable, alt: todoCapable });

const aeronauticsHobby = z.strictObject({
  type: z.literal('aeronautics'),
  icon: z.string().min(1),
  // Real CV credentials — drive the verified-credential marks (US-041 pilot
  // license; 2026-07-03 night rating).
  meta: z.strictObject({ isLicensedPilot: z.boolean(), isNightRated: z.boolean() }),
  title: localized,
  intro: localized,
  aircraft: todoCapable,
  ratings: todoCapable,
  totalHours: todoCapable,
  routes: z.array(todoCapable),
  // The flight logbook is deliberately NOT a data field (US-1403): the dummy
  // design rows were removed with their schema — rows + both counters render
  // LIVE in the browser from the owner's public Google Sheet (US-1404 module),
  // and the SSR ships an honest pending shell. Data shape = schema edit,
  // deliberate (strictObject rejects a stray `logbook` key on re-add).
  gallery: z.array(galleryItem),
});

const musicHobby = z.strictObject({
  type: z.literal('music'),
  icon: z.string().min(1),
  meta: z.strictObject({}),
  title: localized,
  intro: localized,
  instruments: z.array(todoCapable),
  artists: z.array(todoCapable),
  links: z.array(z.strictObject({ label: todoCapable, url: todoCapable })),
  // US-1609: the owner's public Tidal playlist SHARE urls (language-agnostic
  // identifiers, US-003 — never localized). todoCapable so a placeholder entry
  // normalizes to null at the accessor layer and is silently filtered out (the
  // US-041 gallery drop-in rule, P1); an all-placeholder/empty list renders the
  // honest pending affordance instead of the grid.
  tidalPlaylists: z.array(todoCapable),
  gallery: z.array(galleryItem),
});

const hobbiesSchema = z.strictObject({
  _note: z.string(),
  hobbies: z
    .array(z.discriminatedUnion('type', [aeronauticsHobby, musicHobby]))
    .superRefine((hobbies, ctx) => {
      // The page composition (US-025/US-041/US-042) needs exactly one of each.
      for (const type of ['aeronautics', 'music'] as const) {
        const count = hobbies.filter((h) => h.type === type).length;
        if (count !== 1) {
          ctx.addIssue({
            code: 'custom',
            message: `expected exactly one "${type}" hobby entry, found ${count}`,
          });
        }
      }
    }),
});

/* ------------------------------------------------------------------ */
/* Collections — one per data file; entry id = file stem               */
/* ------------------------------------------------------------------ */

export const collections = {
  cv: defineCollection({
    loader: file('src/data/cv.json', asSingleEntry('cv')),
    schema: cvSchema,
  }),
  'site-strings': defineCollection({
    loader: file('src/data/site-strings.json', asSingleEntry('site-strings')),
    schema: siteStringsSchema,
  }),
  'research-chapters': defineCollection({
    loader: file('src/data/research-chapters.json', asSingleEntry('research-chapters')),
    schema: researchChaptersSchema,
  }),
  hobbies: defineCollection({
    loader: file('src/data/hobbies.json', asSingleEntry('hobbies')),
    schema: hobbiesSchema,
  }),
};
