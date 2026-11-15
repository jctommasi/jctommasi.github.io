/**
 * Dynamic career tenures — US-1604 (generalized).
 *
 * Every running "N years" figure on the site is computed here from its real
 * start month, never authored as a literal digit (a literal rots silently each
 * anniversary):
 *
 *  - `{yearsOffensive}` — corporate offensive security, since **February 2020**
 *  - `{yearsBackend}`   — back-end development & systems, since **January 2018**
 *  - `{yearsAi}`        — AI / agentic workflows, since **April 2025**
 *
 * ("Self-taught since 2001" stays a literal year — it is a date, not a span.)
 *
 * The bilingual JSON prose carries these template tokens and every render site
 * fills them through {@link fillYears}. A token may also carry its own
 * singular/plural unit words — `{yearsAi|year|years}` renders `1 year` /
 * `2 years` (`{yearsAi|año|años}` in Spanish) — so prose stays grammatical as
 * the number grows.
 *
 * STALENESS BOUND (deliberate, documented): the site is a STATIC build, so the
 * values are baked at build time from the build machine's clock and only change
 * on the first deploy after each anniversary month. The page is therefore never
 * more than one deploy behind, and it never OVER-states a tenure (the floor
 * rounds down). No client JS is involved, so this costs nothing in the
 * initial-JS budget (US-048).
 */

/** Start of each span (month index is 0-based, as in `Date`). */
export const TENURE_STARTS = {
  Offensive: { year: 2020, monthIndex: 1 }, // February 2020
  Backend: { year: 2018, monthIndex: 0 }, // January 2018
  Ai: { year: 2025, monthIndex: 3 }, // April 2025
} as const;

export type Tenure = keyof typeof TENURE_STARTS;

/**
 * Full elapsed years from the span's start month to `now` (defaults to the
 * build clock), floored — a figure only increments once the anniversary month
 * is actually reached, so the site never claims a year it has not completed.
 */
export function yearsSince(tenure: Tenure, now: Date = new Date()): number {
  const { year, monthIndex } = TENURE_STARTS[tenure];
  const elapsedMonths = (now.getFullYear() - year) * 12 + (now.getMonth() - monthIndex);
  return Math.max(0, Math.floor(elapsedMonths / 12));
}

/** Back-compat alias for the original single-span helper. */
export function yearsSinceFeb2020(now: Date = new Date()): number {
  return yearsSince('Offensive', now);
}

/** `{yearsOffensive}`, `{yearsBackend}`, `{yearsAi}` — optionally `|singular|plural`. */
const TOKEN_RE = /\{years(Offensive|Backend|Ai)(?:\|([^|}]+)\|([^}]+))?\}/g;

/**
 * Fill every tenure token in a rendered string. THE shared helper — every
 * render site that prints prose carrying a token must go through this, so a
 * number can never drift between sections.
 *
 * Safe on strings without tokens (returns them unchanged), so it can be
 * applied uniformly across a `body[].map(...)` without per-paragraph knowledge.
 */
export function fillYears(text: string, now?: Date): string {
  return text.replace(TOKEN_RE, (_m, tenure: Tenure, singular?: string, plural?: string) => {
    const n = yearsSince(tenure, now);
    if (singular === undefined || plural === undefined) return String(n);
    return `${n} ${n === 1 ? singular : plural}`;
  });
}
