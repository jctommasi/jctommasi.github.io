/**
 * CodeMirror 6 practice widget (US-034) — the first interactive practice widget.
 *
 * Loaded LAZILY: the practice loader (PageBody) dynamically `import()`s this
 * module only when a `[data-practice][data-practice-type="codemirror"]` region
 * approaches the viewport, so CodeMirror never enters the initial bundle (it is
 * code-split into an on-demand chunk — the WebGL-engine lazy-load pattern, the
 * manual's "islands → ship minimal JS" §11). The per-language packs are
 * themselves dynamically imported so only the languages actually scrolled into
 * view are fetched.
 *
 * Progressive enhancement + zero-CLS: the region server-renders the snippet as
 * a static `<pre>` inside a fixed, reserved-height body (so no-JS readers still
 * see the code, and the box never resizes). `mount()` swaps that `<pre>` for an
 * editable CodeMirror view inside the SAME fixed-height box → no layout shift.
 *
 * Accessibility: the editor's content area is a labelled multiline textbox;
 * Tab indents (so it is a real editor) and Escape leaves it (moving focus to
 * the wrapper, so a keyboard user is never trapped — AC5). The only motion the
 * editor introduces (the caret blink) is disabled under reduced motion by a
 * global rule in PageBody (P5).
 *
 * The themed/accessible editor itself is built by the shared `createEditor`
 * factory (./editor) so the Sandpack widget (US-036) reuses the same on-brand,
 * P7 editor; this module only wires it into the practice-region markup.
 */
import { createEditor } from './editor';

/**
 * Upgrade one practice region's static `<pre>` into an editable CodeMirror view.
 * Idempotent (a second call is a no-op once mounted). Failures are thrown to the
 * caller (the loader), which leaves the static `<pre>` in place (honest fallback).
 */
export async function mount(region: HTMLElement): Promise<void> {
  if (region.dataset.practiceMounted === 'true') return;

  const body = region.querySelector<HTMLElement>('[data-practice-mount]');
  const pre = region.querySelector<HTMLElement>('.research__practice-pre');
  if (!body || !pre) return;

  const code = pre.textContent ?? '';
  const lang = region.dataset.practiceLang ?? '';
  const ariaLabel = region.dataset.practiceLabel ?? 'Code editor';
  const hintId = region.querySelector<HTMLElement>('.research__practice-hint')?.id;

  // The fixed-height body doubles as the Esc focus target: tabindex=-1 lets us
  // move focus here when the user presses Escape, so the next Tab continues from
  // just after the editor in the document — no focus trap (AC5).
  body.tabIndex = -1;

  const view = await createEditor({
    doc: code,
    lang,
    ariaLabel,
    describedById: hintId,
    onEscape: () => body.focus(),
  });

  // Swap the static <pre> for the editor inside the SAME reserved-height box —
  // the box height is fixed in CSS, so this causes no layout shift (CLS ~ 0).
  pre.remove();
  body.appendChild(view.dom);
  region.dataset.practiceMounted = 'true';
}
