#!/usr/bin/env node
/**
 * Gate: `{{TODO}}` lint (P1 / FR-7 / FR-8, manual §9.4) — US-006.
 *
 * Scans the EMITTED build for the literal `{{TODO`:
 *   - dist/**\/*.html
 *   - dist/_astro/*.js
 * Zero matches, or the build fails (exit 1) listing every offender (file:line).
 *
 * Seed JSON legitimately carries `{{TODO: …}}` placeholders for facts that do
 * not exist yet (article permalinks, podcast audio URLs, pilot/music
 * specifics). The literal must NEVER reach the rendered DOM — accessors
 * normalize a placeholder to `null` + an honest "coming soon" state
 * (src/data/todo.ts → resolveTodo) BEFORE it can reach a template or island
 * prop, so honest placeholder data never trips this gate.
 *
 * Must run AFTER `astro build` (it reads dist/). Runnable locally:
 * `npm run build && npm run gate:todo`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');
const ASTRO = join(DIST, '_astro');
const NEEDLE = '{{TODO';

if (!existsSync(DIST)) {
  console.error('✗ {{TODO}} gate: dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

/** Recursively collect files under `dir` whose path satisfies `test`. */
function walk(dir, test, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, test, out);
    else if (test(full)) out.push(full);
  }
}

const targets = [];
walk(DIST, (f) => f.endsWith('.html'), targets);
if (existsSync(ASTRO)) walk(ASTRO, (f) => f.endsWith('.js'), targets);

const offenders = [];
for (const file of targets) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(NEEDLE)) continue;
  // Report each hit with a trimmed surrounding snippet (minified JS lines can
  // be very long, so slice around the match column rather than print the line).
  text.split('\n').forEach((line, i) => {
    let col = line.indexOf(NEEDLE);
    while (col !== -1) {
      const snippet = line.slice(Math.max(0, col - 30), col + 40).trim();
      offenders.push(`${relative(ROOT, file)}:${i + 1}  …${snippet}…`);
      col = line.indexOf(NEEDLE, col + 1);
    }
  });
}

if (offenders.length > 0) {
  console.error(
    `\n✗ {{TODO}} gate FAILED (P1) — literal "${NEEDLE}" found in ${offenders.length} place(s) in emitted output:\n`,
  );
  for (const o of offenders) console.error(`  • ${o}`);
  console.error(
    '\nFix: normalize {{TODO}}-bearing data (src/data/todo.ts → resolveTodo: placeholder → null +\n' +
      'an honest "coming soon"/disabled state) BEFORE it reaches the DOM. Never render the literal.\n',
  );
  process.exit(1);
}

console.log(`✓ {{TODO}} gate passed — scanned ${targets.length} emitted file(s), 0 "${NEEDLE}" literals (P1).`);
