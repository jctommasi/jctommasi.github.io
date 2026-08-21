/**
 * decode-core (US-904) — the ONE shared alien-decode engine, extracted from
 * alien-decode.ts (US-802/US-903) so the section titles AND the top-bar labels
 * (nav-decode.ts) run the identical effect with no duplicated scheduler:
 *
 *   - the font-deterministic glyph POOL (the US-009 rule applied to DOM text:
 *     printable latin-subset characters U+0021–00FF ONLY — no katakana, no
 *     U+25xx box glyphs; those exist only in the WebGL-atlas fonts and render
 *     tofu in the DOM on font-less systems, including headless chrome),
 *   - the per-slot SCHEDULER (each character slot independently cycles a few
 *     random glyphs, then resolves left-to-right with a stagger wave; long
 *     strings clamp the stagger to the reveal budget, never the swap cadence),
 *   - the PIN / ACCNAME / RESTORE discipline (`pinTarget`/`restoreTarget`):
 *     aria-label = the final string while scrambled glyphs are shown (AT never
 *     sees the scramble) + an inline-size pin of the final text's box so a run
 *     causes zero layout shift; restore snaps back to the captured final,
 *     drops the accname pin and releases the box.
 *
 * PROFILES (US-1004, owner call 2026-08-01 "titles only"): `runDecode` takes
 * an OPTIONAL profile argument —
 *   - 'wave' (the DEFAULT when omitted) = the shipped US-903 cascade timing:
 *     SWAP 45–90 ms, STAGGER 33 ms, caps 1350/1800 ms, CYCLES 3–5 (the ×1.5
 *     owner constants, "50% slower" = duration ×1.5). nav-decode.ts passes
 *     nothing and stays behavior-identical.
 *   - 'sequential' = strict left-to-right single-slot locks ~90–120 ms apart
 *     (randomized per gap; long titles clamp the gap toward a ~55 ms floor to
 *     fit SEQ_REVEAL_CAP_MS), whitespace locks instantly, and the unresolved
 *     TAIL keeps swapping at the ambient churn cadence (CHURN 200–450 ms,
 *     re-rolled each swap — visual continuity with the US-1003 idle churn, no
 *     gear-shift at decode start). alien-decode.ts (section titles) uses it.
 *   - 'sweep' (US-1201, the content-block reveal) = the sequential LOOK scaled
 *     to any length: strict left-to-right lock ORDER, but K ≥ 1 CONSECUTIVE
 *     slots lock per step, with K and the per-step gap derived from the
 *     non-whitespace length so the TOTAL run lands ≤ SWEEP_TOTAL_CAP_MS
 *     (~1.5–3 s for any block; hard error-cap SWEEP_HARD_CAP_MS). Short
 *     strings (≤ ~24 non-ws chars ⇒ K=1, unclamped 90–120 ms gaps) behave
 *     exactly like 'sequential', so small labels feel identical to titles.
 *     The unresolved tail churns at the same ambient cadence.
 *   - 'sweep-fast' (US-1302, collapse-region content) = the identical sweep
 *     shape at ~×0.65: caps SWEEP_FAST_TOTAL/HARD_CAP_MS (≈1820/2080), gap
 *     band = the sequential band × SWEEP_FAST_GAP_SCALE (≈59–78 ms) floored
 *     at SEQ_GAP_FLOOR_MS — text the reader summons by opening a card
 *     resolves noticeably quicker than ambient prose.
 *
 * Flash-safety (§15 / WCAG 2.3.1): the engine mutates textContent ONLY — glyph
 * swaps, never color/opacity/glow/background (character changes are not
 * flashes).
 *
 * Error discipline: `runDecode`'s tick is try/caught — ANY error finishes the
 * run, and finishing ALWAYS goes through the caller's `finish` callback, whose
 * job is to restore the captured final string (P5: an error can strand the
 * scramble nowhere).
 */

/* --- Tunable timing constants (the owner-facing knobs, ×1.5 per US-903) --- */
/** Per-slot glyph swap period range (ms). */
export const SWAP_MIN_MS = 45;
export const SWAP_MAX_MS = 90;
/** Random glyph cycles a slot shows before resolving (unchanged by ×1.5). */
export const CYCLES_MIN = 3;
export const CYCLES_MAX = 5;
/** Left-to-right resolve stagger per character (ms) — the wave. */
export const STAGGER_MS = 33;
/** Whole-run budget (long strings clamp the stagger down to fit; HARD_CAP_MS
 * is the absolute ceiling either way). */
export const REVEAL_CAP_MS = 1350;
export const HARD_CAP_MS = 1800;
/** Ambient churn per-slot swap period range (ms) — the "alive while encoded"
 * cadence (US-1003 idle churn on the section titles; the US-1004 sequential
 * profile's unresolved tail shares it for visual continuity). Owner locked
 * "ambient calm": each non-whitespace slot swaps independently on a
 * randomized period in this band, re-rolled after every swap. */
export const CHURN_MIN_MS = 200;
export const CHURN_MAX_MS = 450;
/** Ambient-churn global per-frame write budget (US-1203, content blocks): at
 * most this many LEAF-SPAN textContent writes per rAF tick across ALL
 * churning block hosts, spent round-robin (one leaf per host per visit) with
 * a carried cursor so every in-band host keeps boiling at dense viewports.
 * Titles are exempt (≤1 write each, ≤8 total). Past-due slots left unswapped
 * by an exhausted budget simply fire on a later frame — the cadence band is
 * wide enough that the deferral is invisible. */
export const CHURN_FRAME_WRITE_BUDGET = 24;
/** Sequential profile (US-1004, the section-title reveal): gap between
 * successive left-to-right slot LOCKS (ms), randomized per gap; long titles
 * clamp the gap range down (never below the floor) so the run fits the
 * reveal budget. */
export const SEQ_GAP_MIN_MS = 90;
export const SEQ_GAP_MAX_MS = 120;
export const SEQ_GAP_FLOOR_MS = 55;
export const SEQ_REVEAL_CAP_MS = 2600;
export const SEQ_HARD_CAP_MS = 3200;
/** Sweep profile (US-1201, the content-block reveal): total-run budget any
 * block must fit by raising K (slots locked per step) before clamping gaps
 * toward SEQ_GAP_FLOOR_MS; the hard cap mirrors the SEQ pair. */
export const SWEEP_TOTAL_CAP_MS = 2800;
export const SWEEP_HARD_CAP_MS = 3200;
/** Sweep-fast profile (US-1302, collapse-region text — the owner's "apenas
 * más rápido" ≈ ×0.65): the identical K-per-step sweep shape with the caps
 * AND the gap band scaled to 65% (band ≈ 59–78 ms), floored at the shared
 * SEQ_GAP_FLOOR_MS like every left-to-right profile. Summoned content (an
 * expanded US-703 card) resolves noticeably quicker than ambient prose. */
export const SWEEP_FAST_TOTAL_CAP_MS = 1820;
export const SWEEP_FAST_HARD_CAP_MS = 2080;
export const SWEEP_FAST_GAP_SCALE = 0.65;

/** Decode profiles: 'wave' = the shipped stagger cascade (nav-decode.ts,
 * the default); 'sequential' = strict one-slot-at-a-time left-to-right locks
 * with a churn-cadence tail (alien-decode.ts titles); 'sweep' = the same
 * left-to-right order with K ≥ 1 consecutive slots locking per step, scaled
 * so any length resolves within SWEEP_TOTAL_CAP_MS (content blocks);
 * 'sweep-fast' = the same sweep shape at the ×0.65 caps/gap band
 * (collapse-region content, US-1302). */
export type DecodeProfile = 'wave' | 'sequential' | 'sweep' | 'sweep-fast';

/** Font-deterministic pool — printable latin-subset glyphs only (U+0021–00FF). */
export const GLYPHS = '!#$%&*+<=>?@0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ¤§±µ¶¿×÷';

export const randomGlyph = (): string =>
  GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? '#';
export const randomBetween = (lo: number, hi: number): number =>
  lo + Math.random() * (hi - lo);

/** Whitespace is never scrambled — it holds the string's shape (nav labels
 * carry the template's leading/trailing spaces; scrambling one would repaint
 * collapsed whitespace as a visible glyph and move the box). */
const isPreserved = (ch: string): boolean => /\s/u.test(ch);

/** One static scramble of `text` — pool glyphs, whitespace preserved. */
export const scrambleText = (text: string): string =>
  Array.from(text)
    .map((ch) => (isPreserved(ch) ? ch : randomGlyph()))
    .join('');

/** One decode target: `el` is where textContent mutates; `accEl` carries the
 * aria-label pin during the run (null = the accname is already stable without
 * help, e.g. the pending CV button's permanent aria-label). */
export interface DecodeTarget {
  el: HTMLElement;
  accEl: HTMLElement | null;
  /** The exact final string, CAPTURED before the first mutation. */
  finalText: string;
  /** finalText split into user-perceived characters (decode slot targets). */
  chars: string[];
}

/**
 * Pin accname + box BEFORE the first mutation, while `el` still shows the
 * final text: aria-label = the final string, inline-size (+ optionally
 * block-size, for the long-lived title pins) = the measured final box.
 * `box-sizing:border-box` is pinned alongside so the border-box rect width is
 * exact for content-box elements too (a no-op where border-box already holds).
 */
export const pinTarget = (target: DecodeTarget, pinBlock = false): void => {
  const rect = target.el.getBoundingClientRect();
  target.accEl?.setAttribute('aria-label', target.finalText);
  target.el.style.boxSizing = 'border-box';
  target.el.style.inlineSize = `${rect.width}px`;
  if (pinBlock) target.el.style.blockSize = `${rect.height}px`;
};

/** Snap back to the captured final string and release every pin. */
export const restoreTarget = (target: DecodeTarget): void => {
  target.el.textContent = target.finalText;
  target.accEl?.removeAttribute('aria-label');
  target.el.style.removeProperty('inline-size');
  target.el.style.removeProperty('block-size');
  target.el.style.removeProperty('box-sizing');
};

/**
 * Run ONE decode over `el`, glyph swaps only. Profile 'wave' (the default —
 * nav-decode.ts passes nothing): per-slot random cycles resolving
 * left-to-right with the stagger wave. Profile 'sequential' (the titles):
 * slots lock strictly one at a time left-to-right ~90–120 ms apart while the
 * unresolved tail churns at the ambient 200–450 ms cadence. Profile 'sweep'
 * (content blocks): the same left-to-right order + churning tail, but K ≥ 1
 * consecutive slots lock per step so any length fits SWEEP_TOTAL_CAP_MS.
 * Profile 'sweep-fast' (collapse-region content): the sweep shape at the
 * ×0.65 caps/gap band, fitting SWEEP_FAST_TOTAL_CAP_MS.
 * `finish` is invoked exactly once — on natural completion, at the hard cap,
 * or on any error — and is where the caller restores the captured final
 * string (+ accname/pins).
 *
 * `write` (optional, US-1202): a caller-owned frame writer. When provided the
 * engine hands it the live `shown` array instead of setting `el.textContent`
 * — the content-block path fans one sweep out over MANY leaf spans (a host's
 * text nodes concatenated in DOM order), writing only the leaves whose slice
 * changed. Omitted (titles, nav labels) the engine writes `el` directly —
 * byte-identical to the pre-US-1202 behavior.
 */
export const runDecode = (
  el: HTMLElement,
  chars: string[],
  finish: () => void,
  profile: DecodeProfile = 'wave',
  write?: (shown: string[]) => void,
): void => {
  const sequential = profile === 'sequential';
  const sweepFast = profile === 'sweep-fast';
  /** 'sweep-fast' IS the sweep shape — only the caps + gap band scale. */
  const sweep = profile === 'sweep' || sweepFast;
  /** The left-to-right profiles share the ambient churn-cadence tail. */
  const churnTail = sequential || sweep;
  const hardCap = sweepFast
    ? SWEEP_FAST_HARD_CAP_MS
    : sweep
      ? SWEEP_HARD_CAP_MS
      : sequential
        ? SEQ_HARD_CAP_MS
        : HARD_CAP_MS;
  const resolveAt: number[] = [];
  const nextSwapAt: number[] = [];
  const swapPeriod: number[] = [];
  const shown: string[] = [];
  if (sweep) {
    // Length-scaled sweep: same strict left-to-right ORDER as 'sequential',
    // but each step locks K consecutive non-whitespace slots at once. K is
    // the smallest integer that fits the run inside the profile's total cap
    // at the profile's gap band (so short strings — ≤ ~24 non-ws chars — get
    // K=1 + unclamped gaps: 90–120 ms 'sweep' = exactly the title feel,
    // ~59–78 ms 'sweep-fast'); when ceil rounding still overshoots the
    // budget, gaps clamp toward the shared floor. 'sweep' runs at scale 1 /
    // SWEEP_TOTAL_CAP_MS — behavior-identical to the shipped US-1201 math.
    const totalCap = sweepFast ? SWEEP_FAST_TOTAL_CAP_MS : SWEEP_TOTAL_CAP_MS;
    const bandScale = sweepFast ? SWEEP_FAST_GAP_SCALE : 1;
    const gapMinBase = SEQ_GAP_MIN_MS * bandScale;
    const gapMaxBase = SEQ_GAP_MAX_MS * bandScale;
    const nonWs = chars.filter((ch) => !isPreserved(ch)).length;
    const meanGap = (gapMinBase + gapMaxBase) / 2;
    const lockPerStep = Math.max(1, Math.ceil((nonWs * meanGap) / totalCap));
    const steps = Math.max(1, Math.ceil(nonWs / lockPerStep));
    const scale = Math.min(1, totalCap / (steps * meanGap));
    const gapLo = Math.max(SEQ_GAP_FLOOR_MS, gapMinBase * scale);
    const gapHi = Math.max(SEQ_GAP_FLOOR_MS, gapMaxBase * scale);
    let at = 0;
    let inStep = 0;
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i] ?? '';
      if (!isPreserved(ch)) {
        // A new step begins on the first slot of each K-group: one gap per
        // step, all K slots in the group sharing the step's lock time.
        if (inStep === 0) at += randomBetween(gapLo, gapHi);
        inStep = (inStep + 1) % lockPerStep;
      }
      resolveAt[i] = at;
      swapPeriod[i] = 0; // unused — the churn tail re-rolls each swap
      nextSwapAt[i] = randomBetween(0, CHURN_MAX_MS);
      shown[i] = isPreserved(ch) ? ch : randomGlyph();
    }
  } else if (sequential) {
    // Strict left-to-right locks: slot i locks at the running sum of
    // randomized gaps over the non-whitespace slots up to it — so exactly one
    // slot resolves per gap, in order (prefix-stable by construction).
    // Whitespace locks instantly at the running time (it is never scrambled
    // and consumes no gap). Long titles clamp the gap range down (never below
    // the floor) so the run fits SEQ_REVEAL_CAP_MS; short titles never clamp.
    const nonWs = chars.filter((ch) => !isPreserved(ch)).length;
    const meanGap = (SEQ_GAP_MIN_MS + SEQ_GAP_MAX_MS) / 2;
    const scale =
      nonWs > 0 ? Math.min(1, SEQ_REVEAL_CAP_MS / (nonWs * meanGap)) : 1;
    const gapLo = Math.max(SEQ_GAP_FLOOR_MS, SEQ_GAP_MIN_MS * scale);
    const gapHi = Math.max(SEQ_GAP_FLOOR_MS, SEQ_GAP_MAX_MS * scale);
    let at = 0;
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i] ?? '';
      if (!isPreserved(ch)) at += randomBetween(gapLo, gapHi);
      resolveAt[i] = at;
      swapPeriod[i] = 0; // unused — the sequential tail re-rolls each swap
      // Tail slots keep the AMBIENT cadence (continuity with the US-1003
      // idle churn — no gear-shift at decode start): first swaps land spread
      // across one churn period, then re-roll 200–450 ms after each swap.
      nextSwapAt[i] = randomBetween(0, CHURN_MAX_MS);
      shown[i] = isPreserved(ch) ? ch : randomGlyph();
    }
  } else {
    // Wave: slot i resolves at i·stagger + cycles·swap. Long strings clamp
    // the stagger so the whole run fits the budget (never the swap cadence —
    // the per-glyph rhythm is the effect).
    const maxCycleMs = CYCLES_MAX * SWAP_MAX_MS;
    let stagger = STAGGER_MS;
    if (chars.length > 1) {
      const budget = Math.min(REVEAL_CAP_MS, HARD_CAP_MS) - maxCycleMs;
      stagger = Math.min(stagger, Math.max(0, budget) / (chars.length - 1));
    }
    for (let i = 0; i < chars.length; i += 1) {
      const cycles = Math.round(randomBetween(CYCLES_MIN, CYCLES_MAX));
      const period = randomBetween(SWAP_MIN_MS, SWAP_MAX_MS);
      swapPeriod[i] = period;
      resolveAt[i] = i * stagger + cycles * period;
      nextSwapAt[i] = 0;
      shown[i] = chars[i] ?? '';
    }
  }

  let raf = 0;
  let start = -1;
  const done = (): void => {
    if (raf) cancelAnimationFrame(raf);
    finish();
  };

  const tick = (ts: number): void => {
    raf = 0;
    try {
      if (start < 0) start = ts;
      const elapsed = ts - start;
      let pending = 0;
      for (let i = 0; i < chars.length; i += 1) {
        const ch = chars[i] ?? '';
        if (isPreserved(ch) || elapsed >= resolveAt[i]!) {
          shown[i] = ch; // whitespace holds; resolved slots hold the truth
        } else {
          pending += 1;
          if (elapsed >= nextSwapAt[i]!) {
            shown[i] = randomGlyph();
            nextSwapAt[i] =
              elapsed +
              (churnTail
                ? randomBetween(CHURN_MIN_MS, CHURN_MAX_MS)
                : swapPeriod[i]!);
          }
        }
      }
      if (write) write(shown);
      else el.textContent = shown.join('');
      if (pending === 0 || elapsed >= hardCap) {
        done();
        return;
      }
      raf = requestAnimationFrame(tick);
    } catch {
      done(); // any error → the caller's restore (P5)
    }
  };
  raf = requestAnimationFrame(tick);
};
