/**
 * Dynamic corporate offensive-security tenure — US-1604.
 *
 * The owner's corporate offensive-security career starts in **February 2020**
 * ("calcular los años desde la fecha febrero 2020"). The figure used to be a
 * literal `6` duplicated across `cv.json` prose AND a numeric
 * `profile.yearsExperience.offensive` field, which rots silently every February.
 *
 * This module is now the SINGLE SOURCE for that number: the JSON prose carries
 * the `{yearsOffensive}` template token (the `{count}`/`{name}` placeholder
 * convention already used by `research.lead` / `switcher`) and every render site
 * fills it through {@link fillYears}. The numeric duplicate was removed from
 * both `cv.json` and the `content.config.ts` schema (owner call) — `backend`
 * and `aiAutomation` stay static literals in the prose, they are historical
 * spans, not a running tenure.
 *
 * STALENESS BOUND (deliberate, documented): the site is a STATIC build, so the
 * value is baked at build time from the build machine's clock and only changes
 * on the first deploy after each February. A build from Feb 2026 through Jan
 * 2027 emits `6`; the first build from Feb 2027 onward emits `7`. The page is
 * therefore never more than one year — and in practice one deploy — behind, and
 * it never OVER-states the tenure (the floor rounds down). No client JS is
 * involved, so this costs nothing in the initial-JS budget (US-048).
 */

/** Career start: February 2020 (month index 1 — `Date` months are 0-based). */
const START_YEAR = 2020;
const START_MONTH_INDEX = 1;

/** The template token carried by the bilingual `cv.json` prose. */
export const YEARS_OFFENSIVE_TOKEN = '{yearsOffensive}';

/**
 * Full elapsed years from 2020-02-01 to `now` (defaults to the build clock),
 * floored — the figure is only incremented once the anniversary month is
 * actually reached, so the site never claims a year it has not completed.
 */
export function yearsSinceFeb2020(now: Date = new Date()): number {
  const elapsedMonths =
    (now.getFullYear() - START_YEAR) * 12 + (now.getMonth() - START_MONTH_INDEX);
  return Math.max(0, Math.floor(elapsedMonths / 12));
}

/**
 * Fill every `{yearsOffensive}` token in a rendered string with the computed
 * tenure. THE shared helper — every render site that prints a `cv.json` prose
 * field carrying the token must go through this (About body paragraph 1 and the
 * Competencies summary today), so the number can never drift between sections.
 *
 * Safe on strings without the token (returns them unchanged), so it can be
 * applied uniformly across a `body[].map(...)` without per-paragraph knowledge.
 */
export function fillYears(text: string, now?: Date): string {
  return text.split(YEARS_OFFENSIVE_TOKEN).join(String(yearsSinceFeb2020(now)));
}
