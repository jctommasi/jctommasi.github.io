#!/usr/bin/env node
/**
 * Gate: locale parity (P8 / FR-13, manual §10) — US-006.
 *
 * Fails with exit 1 if any key exists in one locale but not the other, across:
 *   - site-strings.json — full es/en key-path symmetry (seed AND app-added
 *     keys; the P8 additive path).
 *   - cv / research-chapters / hobbies .json — every `{es,en}` field carries
 *     BOTH halves, each a non-empty string.
 *
 * Source-only (reads src/data/*.json), so CI runs it BEFORE `astro build` for
 * a fast, focused failure. The Zod schema (src/content.config.ts) enforces the
 * same invariants during the build itself; this gate is the named, standalone,
 * CI-wired check the policy demands — "honesty and parity are mechanical, not
 * aspirational." Runnable locally: `npm run gate:i18n`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data');
const read = (name) => JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'));

/** Collect every nested key path of an object tree ("cta.downloadCv", …). */
function collectKeyPaths(node, prefix, out) {
  if (typeof node !== 'object' || node === null) return;
  for (const [key, value] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    out.add(path);
    collectKeyPaths(value, path, out);
  }
}

/** A bilingual leaf is a plain object carrying an `es` and/or `en` key. */
const isLocalizedField = (node) =>
  node !== null &&
  typeof node === 'object' &&
  !Array.isArray(node) &&
  ('es' in node || 'en' in node);

const violations = [];

/* --- site-strings.json: es/en bundle key-path symmetry (P8 additive path) --- */
{
  const strings = read('site-strings.json');
  const esPaths = new Set();
  const enPaths = new Set();
  collectKeyPaths(strings.es, '', esPaths);
  collectKeyPaths(strings.en, '', enPaths);
  for (const p of [...esPaths].filter((k) => !enPaths.has(k))) {
    violations.push(`site-strings.json: "${p}" present in es, missing in en`);
  }
  for (const p of [...enPaths].filter((k) => !esPaths.has(k))) {
    violations.push(`site-strings.json: "${p}" present in en, missing in es`);
  }
}

/* --- cv / research / hobbies: every {es,en} field has both non-empty halves --- */
function checkLocalized(node, path, file) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => checkLocalized(item, `${path}[${i}]`, file));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (isLocalizedField(node)) {
    for (const loc of ['es', 'en']) {
      const value = node[loc];
      if (typeof value !== 'string' || value.length === 0) {
        violations.push(`${file}: "${path}" {es,en} field — "${loc}" half missing or empty`);
      }
    }
  }
  // Recurse into every child: localized es/en values are strings (no-ops), and
  // any deeper localized field elsewhere in the tree is still reached.
  for (const [key, value] of Object.entries(node)) {
    checkLocalized(value, path === '' ? key : `${path}.${key}`, file);
  }
}

for (const file of ['cv.json', 'research-chapters.json', 'hobbies.json']) {
  checkLocalized(read(file), '', file);
}

if (violations.length > 0) {
  console.error(`\n✗ Locale parity gate FAILED (P8) — ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  • ${v}`);
  console.error(
    '\nFix: every {es,en} field needs both non-empty halves; site-strings keys must match across es/en (P8).\n',
  );
  process.exit(1);
}

console.log('✓ Locale parity gate passed — site-strings + cv/research-chapters/hobbies (P8).');
