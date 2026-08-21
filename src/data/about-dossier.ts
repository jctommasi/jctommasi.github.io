/**
 * About "Split Dossier" model (2026-08-08 owner ask — the "02 — Split Dossier"
 * redesign of the About section).
 *
 * The About section is no longer a single editorial prose column (US-1711); it
 * is an asymmetric DOSSIER — a compact, scannable FACT INDEX beside the
 * PROFILE SUMMARY narrative and its ORIGIN case-file block. This module is the
 * fact-row DATA for that view (rendering lives in PageBody.astro), so the index
 * generates from data and accepts new rows with zero structural change — the
 * "rows derive from data, never duplicated markup" source the redesign
 * requires (the competencies.ts / research-pipeline.ts pattern).
 *
 * WHAT IS REAL vs DERIVED (P3 — every rendered fact traces to cv.json):
 *  - The corporate offensive-security tenure is NEVER an authored digit here:
 *    its value keeps the `{yearsOffensive}` template token and every render
 *    goes through the shared fillYears() (US-1604 — years.ts is the single
 *    source, so the dossier can never drift from the About prose beside it).
 *  - The backend / AI-automation spans are the structured
 *    cv.json profile.yearsExperience fields, passed in by the caller —
 *    {@link buildAboutFacts} composes the value from the REAL number (only the
 *    unit word is authored here), so the index and the schema'd data can't
 *    disagree.
 *  - "Since 2001" and the CORE PRACTICE line are faithful COMPACT compressions
 *    of profile.body[0] / profile.body[1] (every term appears verbatim in the
 *    source prose) — the competencies `tagline` class: module-held bilingual
 *    content that gate:i18n does not walk, both halves filled by construction.
 *  - `label` is the row's short technical console label (SELF-TAUGHT,
 *    OFFENSIVE SECURITY, …), English in both locales — the US-003
 *    shell-literal / OD-3 class the exp chapter console (CHAPTERS, PERIOD:,
 *    ACTIVE) and the research pipeline (HYPOTHESIS…PUBLISH) already use, so
 *    the dossier adds ZERO new P8 strings. The substantive VALUES are fully
 *    bilingual, so ES readers get Spanish for everything that is prose.
 *
 * The rows are an UNORDERED set (facts, not a ranked sequence — the US-021
 * set-vs-sequence rule), rendered as a <ul>. `icon` names an Icon.astro glyph
 * (decorative cue; the visible label + value carry the meaning).
 */

/** A bilingual field, mirroring the i18n Localized shape (kept local so this
 *  module imports nothing from the content/i18n layers — the competencies.ts
 *  precedent). */
export interface LocalizedText {
  es: string;
  en: string;
}

export interface AboutFact {
  /** Stable row id (DOM/debug hook; never rendered as text). */
  id: string;
  /** Icon.astro glyph name — decorative, aria-hidden at the render site. */
  icon: string;
  /** Console label, English in both locales (the OD-3 shell-literal class). */
  label: string;
  /**
   * The substantive value, bilingual. May carry the `{yearsOffensive}`
   * template token — the caller renders EVERY value through
   * `fillYears(pick(locale, value))` (fillYears is a no-op on token-free
   * strings, so it applies uniformly — the years.ts contract).
   */
  value: LocalizedText;
}

/** The derived spans the caller reads from cv.json profile.yearsExperience —
 *  passed in so the module never duplicates a structured number (P3). */
export interface AboutFactInputs {
  yearsBackend: number;
  yearsAiAutomation: number;
}

/** `N years` / `N años` from a REAL span number (unit word only lives here). */
function yearsValue(n: number): LocalizedText {
  return {
    es: `${n} ${n === 1 ? 'año' : 'años'}`,
    en: `${n} ${n === 1 ? 'year' : 'years'}`,
  };
}

/**
 * The FACT INDEX rows, in the narrative order of profile.body[0] (origin →
 * tenure → backend → AI → practice). Adding a row = adding an entry here; the
 * render site iterates.
 */
export function buildAboutFacts({ yearsBackend, yearsAiAutomation }: AboutFactInputs): AboutFact[] {
  return [
    {
      id: 'self-taught',
      icon: 'terminal',
      label: 'SELF-TAUGHT',
      value: { es: 'Desde 2001', en: 'Since 2001' },
    },
    {
      id: 'offensive-security',
      icon: 'shield',
      label: 'OFFENSIVE SECURITY',
      // The running tenure stays the US-1604 template — filled at render via
      // the shared fillYears(), never an authored digit (it would rot).
      value: { es: '{yearsOffensive} años', en: '{yearsOffensive} years' },
    },
    {
      id: 'backend-systems',
      icon: 'database',
      label: 'BACKEND & SYSTEMS',
      value: yearsValue(yearsBackend),
    },
    {
      id: 'ai-workflows',
      icon: 'sparkles',
      label: 'AI WORKFLOWS',
      value: yearsValue(yearsAiAutomation),
    },
    {
      id: 'core-practice',
      icon: 'code',
      label: 'CORE PRACTICE',
      // Faithful compression of profile.body[1] — the cv.json terms verbatim
      // ("pruebas de penetración", not the anglicism), separated by the house
      // middot (the org · role · period register).
      value: {
        es: 'Análisis de código · Pruebas de penetración · Bug bounty',
        en: 'Code analysis · Penetration testing · Bug bounty',
      },
    },
  ];
}
