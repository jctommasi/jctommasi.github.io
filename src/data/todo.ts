/**
 * `{{TODO}}` placeholder normalization (P1 / FR-7, manual §9.4) — US-006.
 *
 * Seed JSON legitimately carries `{{TODO: …}}` placeholders for facts that do
 * not exist yet: article permalinks (cv.articles[].exactPermalink), podcast
 * audio (research-chapters audioUrl), and the pilot/music specifics in
 * hobbies.json. The schema (`todoCapable` in src/content.config.ts) ACCEPTS
 * the literal — honest seed state is valid data — but the literal must NEVER
 * reach the rendered DOM (P1). The dist gate (scripts/gates/todo-lint.mjs)
 * fails the build if it ever does.
 *
 * This module is the sanctioned normalization point: accessors call it to turn
 * a placeholder into `null` so the consuming UI can render an honest "coming
 * soon"/disabled affordance (never the literal, never a fabricated value).
 * When real data lands, the same field flows through unchanged and the feature
 * activates with ZERO code change (US-022 article links, US-032 audio player,
 * US-041/US-042 hobby specifics).
 */

/** True when a seed string is still an unresolved `{{TODO …}}` placeholder. */
export function isTodo(value: string): boolean {
  return value.startsWith('{{TODO');
}

/**
 * Normalize a `{{TODO}}`-capable seed string for render: the real value, or
 * `null` when it is still a placeholder. Callers render the honest pending
 * state on `null` (P1) — they must not pass the raw field to a template.
 */
export function resolveTodo(value: string): string | null {
  return isTodo(value) ? null : value;
}
