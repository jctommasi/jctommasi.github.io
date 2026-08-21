/**
 * Matrix-terminal Shiki theme (US-607) — the build-time syntax palette for
 * every static code block (practice <pre> fallbacks, sandpack entry, the
 * detection rules).
 *
 * DOCUMENTED MIRROR (the palette.ts discipline): CODE_TOKEN_HEXES mirrors
 * src/theme/theme.css — the two code-accent tokens (P7 AMENDMENT, owner call
 * 2026-07-30: amber/cyan are legal ONLY inside code blocks) plus the Matrix
 * ramp. Shiki inlines literal colours into the emitted HTML (a TextMate theme
 * cannot reference CSS custom properties), so the hexes must be duplicated
 * here; the build-time assert in ./code-highlight.ts compares this map against
 * theme.css on every build and FAILS the build on drift, keeping the mirror
 * honest.
 *
 * Token mapping (owner-approved, US-607 — shared with the US-608 live editors):
 *   keywords                   → --code-amber   (#ffb000)
 *   strings                    → --mx-green-hi  (#c7ffd0)
 *   comments                   → --mx-green-dim (#008f11) italic
 *   numbers/constants/builtins → --code-cyan    (#5fd7ff)
 *   function/property names    → --mx-green     (#00ff41)
 *   operators/punctuation      → --mx-green-mid (#00b82e)
 *
 * Anything unmapped falls to the default foreground (--mx-green-hi) — the same
 * colour the un-highlighted <pre> used, so degradation is invisible, never
 * off-palette. The background hex is nominal only: the transformer in
 * code-highlight.ts strips Shiki's inline <pre> style so CSS owns the surface
 * (--surface-code, 94% void).
 */
import type { ThemeRegistration } from 'shiki';

/** The theme.css tokens this file mirrors (asserted at build, exact lowercase hex). */
export const CODE_TOKEN_HEXES = {
  '--code-amber': '#ffb000',
  '--code-cyan': '#5fd7ff',
  '--mx-green': '#00ff41',
  '--mx-green-mid': '#00b82e',
  '--mx-green-dim': '#008f11',
  '--mx-green-hi': '#c7ffd0',
  '--mx-void': '#050805',
} as const;

const amber = CODE_TOKEN_HEXES['--code-amber'];
const cyan = CODE_TOKEN_HEXES['--code-cyan'];
const green = CODE_TOKEN_HEXES['--mx-green'];
const mid = CODE_TOKEN_HEXES['--mx-green-mid'];
const dim = CODE_TOKEN_HEXES['--mx-green-dim'];
const hi = CODE_TOKEN_HEXES['--mx-green-hi'];
const voidHex = CODE_TOKEN_HEXES['--mx-void'];

/**
 * TextMate scope notes: the MORE SPECIFIC selector wins regardless of order
 * (`keyword.operator` beats `keyword`, `punctuation.definition.string` beats
 * `punctuation`), so operators/quotes land on their intended colours even
 * though `keyword`/`punctuation` are also mapped. YAML keys (`entity.name.tag`,
 * Sigma) and JSON keys (`support.type.property-name`) count as property names →
 * green; markdown headings read as the "keyword" of prose → amber.
 */
export const shikiMatrix: ThemeRegistration = {
  name: 'matrix-terminal',
  type: 'dark',
  colors: {
    'editor.background': voidHex,
    'editor.foreground': hi,
  },
  settings: [
    // Default (no scope): unmapped tokens = the plain code colour.
    { settings: { foreground: hi, background: voidHex } },
    {
      scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'markup.heading', 'entity.name.section'],
      settings: { foreground: amber },
    },
    {
      scope: ['string', 'punctuation.definition.string'],
      settings: { foreground: hi },
    },
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: dim, fontStyle: 'italic' },
    },
    {
      scope: [
        'constant',
        'constant.numeric',
        'constant.language',
        'constant.character.escape',
        'support',
        'support.function',
        'support.class',
        'support.constant',
        'variable.language',
      ],
      settings: { foreground: cyan },
    },
    {
      scope: [
        'entity.name.function',
        'entity.name.tag',
        'variable.function',
        'variable.other.property',
        'variable.other.object.property',
        'support.type.property-name',
        'meta.object-literal.key',
      ],
      settings: { foreground: green },
    },
    {
      scope: ['keyword.operator', 'punctuation', 'meta.brace', 'punctuation.separator', 'punctuation.terminator'],
      settings: { foreground: mid },
    },
  ],
};
