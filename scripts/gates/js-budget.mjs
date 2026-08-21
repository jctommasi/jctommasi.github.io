#!/usr/bin/env node
/**
 * Gate: initial-JS budget (§2 success metrics / §14 budgets) — US-048.
 *
 * Enforces "Total transferred JS (initial) ≤ 250 KB gzipped, EXCLUDING the
 * lazy-loaded WebGL bundle". "Initial JS" = everything the browser fetches
 * eagerly to render first paint: the entry `<script type="module" src>`s plus the
 * `<link rel="modulepreload">` chunks the HTML preloads for them. Dynamic
 * `import()`s (the Three.js `engine.<hash>.js` WebGL chunk, the CodeMirror /
 * Sandpack practice chunks) are fetched on demand, NOT preloaded, so they are
 * correctly OUTSIDE this set — the budget measures the cost of arriving, not the
 * cost of the cinematic extras that stream in afterward.
 *
 * The WebGL engine chunk is additionally excluded by name as belt-and-suspenders:
 * if a future change ever eager-loads it, the gate reports it separately rather
 * than silently letting 150 KB of Three.js into the "initial" total.
 *
 * Must run AFTER `astro build` (it reads dist/). Runnable locally:
 * `npm run build && npm run gate:js`. Wired into `npm run gate` and the deploy
 * workflow before the artifact upload.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');

/** Budget: 250 KB gzipped (KB = 1024 B). */
const BUDGET_BYTES = 250 * 1024;
/** The lazy WebGL bundle, excluded from the initial total (manual §14). */
const WEBGL_CHUNK = /(^|\/)engine\.[^/]*\.js$/;

/**
 * EVERY emitted dist HTML page defines the "initial JS" set (US-605: the two
 * home routes plus the 12 research reader pages — and any future route, with no
 * gate edit). Recursive walk instead of a hard-coded entry list.
 */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('✗ JS-budget gate: dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

/**
 * Collect the JS URLs the HTML loads eagerly: `<script ... src="…js">` (entry
 * modules) and `<link rel="modulepreload" href="…js">` (their static-import
 * graph, preloaded). Both are real network requests on first paint.
 */
function eagerJsUrls(html) {
  const urls = new Set();
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+\.js)["']/gi;
  const preloadRe = /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+\.js)["']/gi;
  // href may precede rel — also match the reverse attribute order.
  const preloadRe2 = /<link\b[^>]*\bhref=["']([^"']+\.js)["'][^>]*\brel=["']modulepreload["']/gi;
  for (const re of [scriptRe, preloadRe, preloadRe2]) {
    let m;
    while ((m = re.exec(html)) !== null) urls.add(m[1]);
  }
  return urls;
}

/** Resolve a site-absolute URL (base '/') to a file under dist/. */
function distPathFor(url) {
  return join(DIST, url.replace(/^\//, ''));
}

const entryHtml = htmlFiles(DIST).map((f) => relative(DIST, f)).sort();
if (entryHtml.length === 0) {
  console.error('✗ JS-budget gate: no emitted *.html found in dist/.');
  process.exit(1);
}
if (!entryHtml.includes('index.html')) {
  console.error('✗ JS-budget gate: expected entry index.html not found in dist/.');
  process.exit(1);
}

const eager = new Set();
for (const rel of entryHtml) {
  for (const url of eagerJsUrls(readFileSync(join(DIST, rel), 'utf8'))) eager.add(url);
}

const counted = [];
const excluded = [];
let totalGz = 0;
for (const url of [...eager].sort()) {
  const file = distPathFor(url);
  if (!existsSync(file)) continue; // external/CDN url — not a local asset
  const gz = gzipSync(readFileSync(file)).length;
  if (WEBGL_CHUNK.test(url)) {
    excluded.push({ url, gz });
    continue;
  }
  counted.push({ url, gz });
  totalGz += gz;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log(`\nInitial JS budget (≤ ${kb(BUDGET_BYTES)} gz, excl. lazy WebGL bundle) — US-048`);
console.log(`  Entry HTML (${entryHtml.length} pages): ${entryHtml.join(', ')}`);
for (const { url, gz } of counted) console.log(`    • ${relative(DIST, distPathFor(url))}  ${kb(gz)} gz`);
if (counted.length === 0) console.log('    (no eager JS chunks)');
for (const { url, gz } of excluded) {
  console.log(`    – excluded (lazy WebGL): ${relative(DIST, distPathFor(url))}  ${kb(gz)} gz`);
}
console.log(`  Initial JS total: ${kb(totalGz)} gz`);

if (totalGz > BUDGET_BYTES) {
  console.error(
    `\n✗ JS-budget gate FAILED — initial JS ${kb(totalGz)} gz exceeds the ${kb(BUDGET_BYTES)} budget (§2/§14).\n` +
      'Fix: keep heavy code behind dynamic import() so it code-splits into a lazy chunk\n' +
      '(the WebGL engine + practice widgets already do); only the tiny bootstraps load eagerly.\n',
  );
  process.exit(1);
}

console.log(`✓ JS-budget gate passed — ${kb(totalGz)} gz initial, ${kb(BUDGET_BYTES - totalGz)} under budget.\n`);
