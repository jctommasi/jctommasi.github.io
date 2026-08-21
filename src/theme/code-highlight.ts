/**
 * Build-time Shiki highlighting for static code blocks (US-607).
 *
 * SERVER-ONLY: imported exclusively from .astro frontmatter, so Shiki (and the
 * node:fs mirror assert below) never enters any client chunk — the emitted HTML
 * simply carries the token <span>s with the literal palette hexes (zero client
 * JS; gate:js unchanged). The palette lives in ./shiki-matrix.ts, a documented
 * mirror of the theme.css tokens (the P7 amendment: amber/cyan are legal ONLY
 * inside code blocks).
 *
 * THE TEXTCONTENT CONTRACT: Shiki wraps tokens in <span>s but never alters the
 * text itself, so the highlighted <pre>'s textContent stays byte-identical to
 * the source `code` string — the CodeMirror/Sandpack widgets keep reading
 * `pre.textContent` for the editor buffer with no change (US-034/US-036), and
 * the transformer re-adds the existing pre class so the widgets' selectors and
 * the fixed-height/zero-CLS boxes are untouched.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeToHtml } from 'shiki';
import type { BundledLanguage, ShikiTransformer } from 'shiki';
import { CODE_TOKEN_HEXES, shikiMatrix } from './shiki-matrix';

/* Mirror assert (runs once per build at module load): shiki-matrix.ts must
   match theme.css exactly, or the build fails — the palette.ts discipline made
   mechanical. process.cwd() is the repo root under astro build/CI (the SiteNav
   build-time-probe precedent). */
const themeCss = readFileSync(join(process.cwd(), 'src', 'theme', 'theme.css'), 'utf8');
for (const [token, hex] of Object.entries(CODE_TOKEN_HEXES)) {
  const match = themeCss.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]+)`));
  if (!match || match[1].toLowerCase() !== hex) {
    throw new Error(
      `[code-highlight] mirror drift: ${token} is ${match?.[1] ?? 'missing'} in theme.css ` +
        `but ${hex} in shiki-matrix.ts — update src/theme/shiki-matrix.ts (US-607).`,
    );
  }
}

/**
 * Map a detection rule's `format` label to a Shiki grammar id (US-607):
 * KQL → kusto, Sigma → yaml, SPL → splunk; anything else renders plaintext on
 * the themed surface.
 */
export function detectionLang(format: string): string {
  if (format.startsWith('KQL')) return 'kusto';
  if (format.startsWith('Sigma')) return 'yaml';
  if (format.startsWith('SPL')) return 'splunk';
  return 'text';
}

/* Shiki emits its own <pre class="shiki …" style="…">; the transformer re-adds
   the existing class (so scoped-selector-free CSS + the widget querySelectors
   keep matching) and strips the inline style so CSS owns the surface
   (--surface-code) and the default text colour. */
function withPreClass(cls: string): ShikiTransformer {
  return {
    pre(node) {
      this.addClassToHast(node, cls);
      delete node.properties.style;
    },
  };
}

const resolvedLangs = new Set<string>();
const fallbackLangs = new Set<string>();

/**
 * Highlight `code` as `lang`, returning a full <pre class={cls}><code>…</code>
 * element. An unavailable grammar falls back to plaintext on the themed bg and
 * is logged at build (AC — the graceful-degradation rung).
 */
export async function highlightCode(code: string, lang: string, cls: string): Promise<string> {
  const transformers = [withPreClass(cls)];
  try {
    const html = await codeToHtml(code, {
      lang: lang as BundledLanguage,
      theme: shikiMatrix,
      transformers,
    });
    if (!resolvedLangs.has(lang)) {
      resolvedLangs.add(lang);
      console.log(`[code-highlight] grammar resolved: ${lang}`);
    }
    return html;
  } catch {
    if (!fallbackLangs.has(lang)) {
      fallbackLangs.add(lang);
      console.warn(`[code-highlight] grammar "${lang}" unavailable — falling back to plaintext on the themed bg.`);
    }
    return codeToHtml(code, { lang: 'text', theme: shikiMatrix, transformers });
  }
}
