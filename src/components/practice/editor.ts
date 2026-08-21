/**
 * Shared CodeMirror 6 editor factory for the practice widgets (US-034 / US-036).
 *
 * The CodeMirror theme, syntax-highlight style, language resolution, and the
 * "real editor + no focus trap" keymap were first written for the CodeMirror
 * widget (US-034); US-036's Sandpack widget needs the SAME editable, on-brand
 * editor for its source pane, so the shared pieces live here and BOTH widgets
 * import them (DRY + one P7 palette definition). Every colour is an `--mx-*`
 * ramp token (a monochrome-green editor, on-brand Matrix), never a stray colour.
 *
 * This module pulls `@codemirror/*` at import time, so whichever practice widget
 * imports it carries CodeMirror into ITS lazy chunk — never the initial bundle
 * (the loader in PageBody dynamically `import()`s the widget on approach).
 */
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  type KeyBinding,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting,
  HighlightStyle,
  indentUnit,
  bracketMatching,
  indentOnInput,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/** Resolve a snippet language id to its CodeMirror language extension (lazy). */
export async function languageExtension(lang: string): Promise<Extension> {
  switch (lang) {
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'python':
      return (await import('@codemirror/lang-python')).python();
    case 'json':
      return (await import('@codemirror/lang-json')).json();
    case 'markdown':
      return (await import('@codemirror/lang-markdown')).markdown();
    default:
      // Unknown language → no syntax pack (the editor still works as plain text).
      return [];
  }
}

/**
 * Matrix-palette editor chrome. Every colour is an `--mx-*` token (or a
 * color-mix of one with transparent), so the editor stays inside the theme
 * ramp (P7). Dark editor over the chapter card's dark void surface.
 */
export const matrixTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: 'var(--mx-green-hi)',
      backgroundColor: 'color-mix(in srgb, var(--mx-void) 92%, transparent)',
      fontSize: 'clamp(0.78rem, 1.5vw, 0.88rem)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-body)',
      lineHeight: '1.6',
    },
    '.cm-content': {
      caretColor: 'var(--mx-green)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--mx-green)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--mx-green-dim) 45%, transparent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--mx-green-far) 35%, transparent)',
    },
    '.cm-gutters': {
      backgroundColor: 'color-mix(in srgb, var(--mx-void) 96%, transparent)',
      color: 'var(--mx-green-dim)',
      border: 'none',
      borderRight: '1px solid var(--mx-green-far)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--mx-green-far) 35%, transparent)',
      color: 'var(--mx-green)',
    },
    '&.cm-focused': {
      // US-046: shared theme-aware focus ring. Editors live in the research
      // (Matrix) zone — a dark surface — so this inherits the bright root value.
      outline: '2px solid var(--focus-ring)',
      outlineOffset: '0',
    },
  },
  { dark: true },
);

/**
 * Live syntax highlight style on the US-607 code palette (US-608). The mapping
 * is the SAME one the static Shiki blocks use (src/theme/shiki-matrix.ts):
 *
 *   keywords                   → --code-amber
 *   strings                    → --mx-green-hi
 *   comments                   → --mx-green-dim italic
 *   numbers/constants/builtins → --code-cyan
 *   function/property names    → --mx-green
 *   operators/punctuation      → --mx-green-mid
 *
 * The colours are read from the RESOLVED CSS custom properties at first mount
 * (getComputedStyle on <html>) — theme.css stays the single source; this file
 * carries NO hex copies (shiki-matrix.ts is the one documented mirror, kept
 * honest by its build assert). Should a token somehow resolve empty, the
 * `var()` expression itself is the fallback (same computed value in CSS).
 * Memoized: the tokens are static, so one HighlightStyle serves every editor.
 */
let codePaletteHighlight: HighlightStyle | null = null;

function matrixCodeHighlight(): HighlightStyle {
  if (codePaletteHighlight) return codePaletteHighlight;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string): string => styles.getPropertyValue(name).trim() || `var(${name})`;
  const amber = token('--code-amber');
  const cyan = token('--code-cyan');
  const green = token('--mx-green');
  const mid = token('--mx-green-mid');
  const dim = token('--mx-green-dim');
  const hi = token('--mx-green-hi');

  codePaletteHighlight = HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: dim, fontStyle: 'italic' },
    // Word keywords → amber; markdown headings read as the "keyword" of prose
    // (the shiki-matrix `markup.heading` rule).
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.modifier], color: amber },
    { tag: t.heading, color: amber, fontWeight: 'bold' },
    { tag: [t.string, t.special(t.string), t.link, t.url], color: hi },
    { tag: t.strong, color: hi, fontWeight: 'bold' },
    // Numbers / language constants / builtins (standard names, self, escapes).
    {
      tag: [t.number, t.bool, t.null, t.atom, t.escape, t.standard(t.variableName), t.self],
      color: cyan,
    },
    { tag: [t.propertyName, t.attributeName, t.function(t.variableName), t.definition(t.variableName)], color: green },
    { tag: [t.typeName, t.className, t.namespace], color: green },
    // Operators + punctuation → mid (operatorKeyword mirrors shiki's
    // `keyword.operator` → mid, NOT amber).
    { tag: [t.operator, t.operatorKeyword, t.punctuation, t.bracket, t.separator], color: mid },
    { tag: t.meta, color: dim },
  ]);
  return codePaletteHighlight;
}

export interface CreateEditorOptions {
  /** Initial editable buffer contents. */
  doc: string;
  /** Snippet language id (resolved to a lazy CodeMirror language pack). */
  lang: string;
  /** Accessible name for the multiline textbox. */
  ariaLabel: string;
  /** id of the visible hint element to wire via `aria-describedby` (optional). */
  describedById?: string;
  /**
   * Called when the user presses Escape inside the editor. The editor first
   * blurs its content DOM; the caller should move focus somewhere sensible
   * (e.g. a `tabindex=-1` wrapper) so the next Tab continues just after the
   * editor — i.e. the editor is never a focus trap (AC5 / US-034).
   */
  onEscape: () => void;
  /** Called on every document change (e.g. to push edits to a live preview). */
  onChange?: (doc: string) => void;
}

/**
 * Build a themed, accessible, keyboard-friendly CodeMirror editor. Returns the
 * `EditorView`; the caller appends `view.dom` (so it controls when the static
 * fallback is swapped, keeping the zero-CLS guarantee).
 */
export async function createEditor(opts: CreateEditorOptions): Promise<EditorView> {
  const langExtension = await languageExtension(opts.lang);

  const escapeBinding: KeyBinding = {
    key: 'Escape',
    run: (view) => {
      view.contentDOM.blur();
      opts.onEscape();
      return true;
    },
  };

  const contentAttributes: Record<string, string> = { 'aria-label': opts.ariaLabel };
  if (opts.describedById) contentAttributes['aria-describedby'] = opts.describedById;

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    dropCursor(),
    bracketMatching(),
    indentOnInput(),
    indentUnit.of('  '),
    EditorView.lineWrapping,
    syntaxHighlighting(matrixCodeHighlight()),
    matrixTheme,
    langExtension,
    EditorView.contentAttributes.of(contentAttributes),
    // Tab/Shift-Tab indent (real editor); Escape leaves; defaults + undo/redo.
    keymap.of([escapeBinding, indentWithTab, ...defaultKeymap, ...historyKeymap]),
  ];

  if (opts.onChange) {
    const onChange = opts.onChange;
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),
    );
  }

  const state = EditorState.create({ doc: opts.doc, extensions });
  return new EditorView({ state });
}
