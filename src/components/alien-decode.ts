/**
 * Alien-mode decode (US-802 titles → US-1202 FULL CONTENT) — the Matrix world
 * reads as an alien transmission that resolves as you read it. TWO target
 * kinds share ONE module, one states map, one midline trigger and one
 * teardown (owner ask 2026-08-02, tasks/prd-matrix-alien-full-content.md):
 *
 *   - TITLES (the shipped US-903/US-1004/US-1103 path, byte-identical): the matrix-register
 *     `.section__title` h2s (6 since the US-1401 reorder) — encoded at init with the
 *     aria-label accname discipline, ambient churn while near the viewport
 *     (US-1003), decode profile 'sequential' on the midline, once forever.
 *   - CONTENT BLOCKS (new, US-1202): every PROSE element of the same
 *     sections' `.section__body` — h3 sub-headings, paragraphs, list items
 *     (chips/tags/pills/highlights/cards), link TEXT (attrs/behavior
 *     untouched), figcaptions, dt/dd/th/td, visible text spans/divs, and
 *     aria-hidden decorative text (↗ cues). Decode profile 'sweep'
 *     (length-scaled, any block resolves in ~1.5–3 s) — except hosts inside
 *     a US-703 [data-collapse-region], which run 'sweep-fast' (US-1302,
 *     ~×0.65: caps ≈1820/2080 ms, gap band ≈59–78 ms) so summoned content
 *     resolves noticeably quicker wherever it decodes.
 *
 * SCOPE — included vs excluded is CORRECTNESS, not taste (owner decisions
 * 2026-08-02): the collector walks TEXT NODES under
 * '.section[data-register="matrix"] .section__body' and SKIPS any node whose
 * ancestry matches the exclusion set — the ENTIRE practice partial
 * `.research__practice` (the loader reads pre.textContent at mount and the
 * editor doc must === snippet.code; the quiz is a native radio form), every
 * `pre`/`code` (Shiki fallbacks, detection rules), the `<details>` transcript
 * (display:none while collapsed would strand encoded), `audio`, `button`
 * (incl. the disabled pending-CV/audio affordances — control accnames stay
 * theirs), `input`/`select`/`textarea`/`label`, `svg`, `script`/`style`,
 * `iframe`, and `.section__title` (owned by the title path). The hero
 * terminal, nav labels and the 4 sky/note sections are outside the selector
 * entirely (the US-1103 boundary): 0 script mutations on every path.
 *
 * THE PAIR PATTERN (the a11y core — prose cannot ride aria-label the way an
 * h2 does): at encode each included text node is REPLACED in place by
 *   <span aria-hidden="true" data-alien-slot>scramble</span>
 *   <span class="alien-sr" data-alien-final>final</span>
 * so the visual is the scramble while the accessibility tree (and every link
 * accname) reads ONLY the real text throughout. The ORIGINAL Text node object
 * is RETAINED in state and RE-INSERTED at resolve (unwrap) → the settled DOM
 * is BYTE-IDENTICAL to SSR: node identity, attributes and inline markup all
 * preserved. Text nodes under an aria-hidden ancestor (decorative cues) get
 * the slot only — no sr mirror is needed where AT already ignores the text.
 * `.alien-sr` is a global theme.css utility (runtime spans carry no Astro
 * scoped cid — the US-036/cloneNode boundary rule).
 *
 * BLOCK HOSTS are the lifecycle unit for pin/trigger/decode: text nodes group
 * under their nearest block-container ancestor (whitelist h3, p, li,
 * figcaption, dt, dd, th, td + a computed-display fallback for generic
 * wrappers — a one-time init cost, never per-frame). A host's characters
 * concatenate in DOM order into ONE sweep (a card resolves as one
 * left-to-right pass, not confetti); each step writes ONLY the leaf spans
 * whose slice changed (≤1 write per leaf per step, the runDecode `write`
 * fan-out).
 *
 * ZERO NET CLS: per host, inline-size + block-size (+ box-sizing, the
 * pinTarget discipline) are pinned to the REAL-text geometry measured BEFORE
 * the first mutation — batched reads-then-writes so init costs one layout —
 * plus overflow:hidden while encoded: scramble pseudo-words wrap/hyphenate
 * differently than real words and that wrap-noise stays INSIDE the pinned,
 * clipped box (clipped noise is acceptable; it IS noise). The mono stacks +
 * preserved whitespace keep per-char metrics stable — the glyph pool stays
 * printable latin U+0021–00FF (the decode-core contract). document.fonts.ready
 * re-measures every still-encoded host with the swap-finals-in → measure →
 * swap-back-within-ONE-task discipline (sr spans are absolutely positioned
 * and never contribute); resolve restores the text nodes + releases
 * pin/overflow in the same task → the box returns to its exact pinned
 * geometry (same text, same styles) → net CLS 0.
 *
 * TRIGGER = PER-SECTION MIDLINE (US-1301, owner ask 2026-08-02 "la sección
 * entera"; supersedes the per-target midline of US-903/US-1202): ONE one-shot
 * IntersectionObserver (threshold 0, rootMargin '0px 0px -50% 0px' — geometry
 * unchanged) observes the matrix-register `.section` elements themselves
 * (6 since the US-1401 reorder).
 * When a section's border-box top enters the TOP HALF of the viewport, its
 * title ('sequential') AND every encoded, non-deferred block host ('sweep')
 * start in the SAME task, in parallel — the whole section resolves as one
 * event (parts below the fold resolve unseen; the owner's literal pick — no
 * viewport-entry gating, no stagger). About, the last matrix section
 * since US-1401 (education retired), always has 4 full sections below it
 * (the US-1103 argument, re-measured in US-1402: ~4.1 vh), so the midline
 * always fires naturally. DEFERRAL (owner decision 2): a host inside a
 * COLLAPSED US-703 card's [data-collapse-region] does NOT start with its
 * section — it stays encoded (clipped ⇒ 0 churn writes, inert per
 * collapse.ts, sr finals already serving AT). The always-visible card-HEAD
 * hosts (chapter title/tags, experience meta) are outside the region and
 * decode with the section. EXPANSION (owner decision 3): a per-card
 * MutationObserver (attributeFilter ['data-collapsed'] — the POST-flip state
 * collapse.ts owns; NEVER a click listener, that's an ordering race) decodes
 * the card's whole region together the moment it expands IF its section
 * already fired; a card expanded BEFORE its section fires simply rides the
 * section's own fire. Deferral is STATE-based at decode-attempt time, so
 * expand→re-collapse→fire re-defers correctly; re-collapse mid-decode is
 * harmless (the sweep completes into the clipped inert region, restore lands
 * the final text).
 *
 * AMBIENT CHURN (US-1003 titles → US-1203 blocks) runs on ONE shared rAF
 * ticker for BOTH kinds. Membership is the same ±200px IntersectionObserver
 * pattern (threshold 0, rootMargin '200px 0px 200px 0px'): while an encoded,
 * not-decoding target intersects, each non-whitespace slot swaps pool glyphs
 * on the randomized CHURN_MIN/MAX_MS period (re-rolled per swap — identical
 * cadence and feel to the titles). Per frame: each churning TITLE gets at
 * most one textContent write (≤8 total — titles are exempt from the budget);
 * BLOCK leaf-span writes are capped by the global CHURN_FRAME_WRITE_BUDGET
 * (≈24), spent ROUND-ROBIN one leaf per host per visit with a carried cursor
 * (every in-band host keeps boiling at dense viewports; past-due slots an
 * exhausted budget defers simply fire on a later frame). The ticker stops
 * scheduling when nothing is eligible and the churn IO re-arms it; hidden
 * tabs pause structurally (rAF stops firing). Churn NEVER runs while a
 * target decodes (the sweep's churn-cadence tail owns the run — no
 * double-writer on any leaf) and stops FOREVER at its resolve; after the
 * LAST target resolves the ticker + every observer (churn, section midline,
 * per-card expansion) all tear down.
 *
 * FLASH-SAFETY (§15 / WCAG 2.3.1), re-argued for AREA now that whole
 * viewports can be encoded AND churning: the effect mutates GLYPHS ONLY —
 * colour, opacity, glow, background and the pinned box stay constant on
 * every path (encode, churn, sweep, resolve), so even a fully-churning
 * viewport is texture noise, not luminance flashing; no frame ever
 * approaches a general-flash pair, and the write budget bounds how much of
 * the viewport can even change per frame.
 *
 * P5: the module never attaches under data-motion='reduced'
 * (`prefersReducedMotion()` early return); the default DOM state is the final
 * SSR text (no-JS static; readers have no matrix-register hosts and are
 * structurally inert). Per-target try/catch restore on ANY error — one host
 * failing restores THAT host and leaves the rest alive.
 */
import { prefersReducedMotion } from '../theme/motion';
import {
  CHURN_FRAME_WRITE_BUDGET,
  CHURN_MAX_MS,
  CHURN_MIN_MS,
  pinTarget,
  randomBetween,
  randomGlyph,
  restoreTarget,
  runDecode,
  scrambleText,
  type DecodeTarget,
} from './decode-core';

/** Whitespace holds the string's shape — never scrambled, never churned. */
const isWs = (ch: string): boolean => /\s/u.test(ch);

interface TitleState extends DecodeTarget {
  kind: 'title';
  /** A decode is currently running (never restart/stack). */
  decoding: boolean;
  /** Resolved (or restored) — frozen forever, zero further mutations. */
  resolved: boolean;
  /** Ambient-churn membership: the title's rect intersects viewport ±200px. */
  churning: boolean;
  /** The glyph currently shown per slot (the scramble the churn mutates). */
  shown: string[];
  /** Per-slot next-swap timestamps on the rAF clock; built on first tick. */
  churnAt: number[] | null;
}

/** One wrapped text node of a block host: the pair spans + the RETAINED
 * original Text node (re-inserted verbatim at resolve). */
interface BlockLeaf {
  /** The ORIGINAL Text node object — never mutated, re-inserted at resolve. */
  node: Text;
  /** The aria-hidden visual span the scramble/sweep writes into. */
  slot: HTMLElement;
  /** The visually-hidden final (null under an aria-hidden ancestor). */
  sr: HTMLElement | null;
  /** The leaf's final text (== node.nodeValue, captured at encode). */
  text: string;
  /** This leaf's slice [start, end) of the host's concatenated chars. */
  start: number;
  end: number;
  /** Cache of the last string written to the slot (≤1 write per change). */
  written: string;
}

interface BlockState {
  kind: 'block';
  /** The block host — the pinned lifecycle unit. */
  el: HTMLElement;
  /** All leaf finals concatenated in DOM order (the ONE sweep's slots). */
  chars: string[];
  leaves: BlockLeaf[];
  decoding: boolean;
  resolved: boolean;
  /** Ambient-churn membership: the host's rect intersects viewport ±200px. */
  churning: boolean;
  /** The glyph currently shown per slot (the scramble the churn mutates);
   * aligned with `chars` — leaves write their [start, end) slice. */
  shown: string[];
  /** Per-slot next-swap timestamps on the rAF clock; built on first tick. */
  churnAt: number[] | null;
}

type TargetState = TitleState | BlockState;

const TITLE_SELECTOR = '.section[data-register="matrix"] .section__title';
const BODY_SELECTOR = '.section[data-register="matrix"] .section__body';
/** The exclusion set (owner decision 2026-08-02) — a text node with ANY of
 * these in its ancestry stays static on every path. `.skills__value` is the
 * skills diagnostic-console readout (2026-08-09 Channel Stack): a JS-mirrored
 * STATE surface that must never become a host (skills-console.ts writes its
 * textContent), kept a semantic-neutral <span> — NOT <code> — because the
 * FOCUS value is localized prose and role=code is announced by NVDA/JAWS. */
const EXCLUDE_SELECTOR =
  '.research__practice,pre,code,details,audio,button,input,select,textarea,label,svg,script,style,iframe,.section__title,.skills__value';
/** Block-container whitelist — the nearest of these is the host. */
const HOST_TAGS = new Set([
  'H3',
  'P',
  'LI',
  'FIGCAPTION',
  'DT',
  'DD',
  'TH',
  'TD',
]);

const init = (): void => {
  if (prefersReducedMotion()) return;
  const titles = Array.from(
    document.querySelectorAll<HTMLElement>(TITLE_SELECTOR),
  );
  const bodies = Array.from(document.querySelectorAll<HTMLElement>(BODY_SELECTOR));
  // Reader pages: no matrix-register hosts of either kind — structurally inert.
  if (titles.length === 0 && bodies.length === 0) return;

  const states = new Map<HTMLElement, TargetState>();

  /** Snap a title back to its captured final text and freeze it (P5 net). */
  const restoreTitle = (state: TitleState): void => {
    state.resolved = true;
    state.decoding = false;
    restoreTarget(state);
  };

  /** Unwrap a block host: re-insert every ORIGINAL Text node (byte-identical
   * to SSR), drop the pair spans, release pin + overflow — one task. */
  const restoreBlock = (state: BlockState): void => {
    state.resolved = true;
    state.decoding = false;
    for (const leaf of state.leaves) {
      try {
        leaf.slot.replaceWith(leaf.node);
        leaf.sr?.remove();
      } catch {
        // Best-effort fallback: at least show the real text (P5).
        try {
          leaf.slot.textContent = leaf.text;
          leaf.slot.removeAttribute('aria-hidden');
          leaf.slot.removeAttribute('data-alien-slot');
          leaf.sr?.remove();
        } catch {
          /* leave the leaf as-is — the sibling leaves still restore */
        }
      }
    }
    const style = state.el.style;
    style.removeProperty('inline-size');
    style.removeProperty('block-size');
    style.removeProperty('box-sizing');
    style.removeProperty('overflow');
    // An empty style="" attribute would break the byte-identical-to-SSR
    // restore contract — drop it once no inline property remains.
    if (style.length === 0) state.el.removeAttribute('style');
  };

  /* --- ENCODE titles (module init, the shipped US-903 path): accname + pins
     BEFORE the first mutation, then the one static scramble. Per-title
     try/catch — an error on one title restores that title and leaves the
     rest working. ------------------------------------------------------- */
  for (const title of titles) {
    let finalText = '';
    try {
      finalText = title.textContent ?? '';
      const chars = Array.from(finalText);
      if (chars.length === 0) continue;
      const state: TitleState = {
        kind: 'title',
        el: title,
        accEl: title,
        finalText,
        chars,
        decoding: false,
        resolved: false,
        churning: false,
        shown: chars.map((ch) => (isWs(ch) ? ch : randomGlyph())),
        churnAt: null,
      };
      pinTarget(state, true);
      states.set(title, state);
      title.textContent = state.shown.join('');
    } catch {
      const state = states.get(title);
      if (state && state.kind === 'title') {
        restoreTitle(state);
      } else if (finalText) {
        restoreTarget({ el: title, accEl: title, finalText, chars: [] });
      }
    }
  }

  /* --- COLLECT content blocks (US-1202): TreeWalker over each matrix
     section body's text nodes, exclusion-set skip, nearest-block-container
     grouping (whitelist tags + a cached computed-display fallback for
     generic wrappers — the one-time init cost). ------------------------- */
  const hostNodes = new Map<HTMLElement, Text[]>();
  const blockish = new Map<HTMLElement, boolean>();
  const isHostEl = (el: HTMLElement): boolean => {
    if (HOST_TAGS.has(el.tagName)) return true;
    let b = blockish.get(el);
    if (b === undefined) {
      const d = getComputedStyle(el).display;
      // Anything that establishes its own block box hosts; inline wrappers
      // (spans, links) group upward. display:none still "hosts" — its rect
      // measures 0×0 below and the subtree stays static.
      b = d !== 'contents' && !d.startsWith('inline');
      blockish.set(el, b);
    }
    return b;
  };
  for (const body of bodies) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      if (!/\S/.test(textNode.nodeValue ?? '')) continue;
      const parent = textNode.parentElement;
      if (!parent || parent.closest(EXCLUDE_SELECTOR)) continue;
      let host: HTMLElement | null = null;
      for (
        let el: HTMLElement | null = parent;
        el && el !== body;
        el = el.parentElement
      ) {
        if (isHostEl(el)) {
          host = el;
          break;
        }
      }
      if (!host) continue;
      const list = hostNodes.get(host);
      if (list) list.push(textNode);
      else hostNodes.set(host, [textNode]);
    }
  }

  /* --- ENCODE blocks: batched reads (every host's REAL-text rect at the
     untouched SSR layout — one layout pass) then writes (pin + wrap). A
     zero-size host (hidden subtree) is skipped and stays static. Per-host
     try/catch: a failing host unwraps itself and leaves the rest alive. -- */
  const hostEntries = Array.from(hostNodes.entries());
  const hostRects = hostEntries.map(([host]) => host.getBoundingClientRect());
  for (let h = 0; h < hostEntries.length; h += 1) {
    const [host, textNodes] = hostEntries[h]!;
    const rect = hostRects[h]!;
    if (rect.width <= 0 || rect.height <= 0) continue;
    const leaves: BlockLeaf[] = [];
    const chars: string[] = [];
    const shown: string[] = [];
    try {
      for (const textNode of textNodes) {
        const text = textNode.nodeValue ?? '';
        const start = chars.length;
        for (const ch of text) chars.push(ch);
        const slot = document.createElement('span');
        slot.setAttribute('aria-hidden', 'true');
        slot.setAttribute('data-alien-slot', '');
        const scramble = scrambleText(text);
        // The host-level shown array mirrors the scramble (same per-perceived
        // -char alignment as `chars`) — the churn mutates it slot-by-slot.
        for (const ch of scramble) shown.push(ch);
        slot.textContent = scramble;
        // Under an aria-hidden ancestor (decorative cues) AT already ignores
        // the text — the slot needs no sr mirror. Checked BEFORE replaceWith
        // (the node's parent chain is gone after).
        let sr: HTMLElement | null = null;
        if (!textNode.parentElement?.closest('[aria-hidden="true"]')) {
          sr = document.createElement('span');
          sr.className = 'alien-sr';
          sr.setAttribute('data-alien-final', '');
          sr.textContent = text;
        }
        if (sr) textNode.replaceWith(slot, sr);
        else textNode.replaceWith(slot);
        leaves.push({
          node: textNode,
          slot,
          sr,
          text,
          start,
          end: chars.length,
          written: scramble,
        });
      }
      if (chars.length === 0) continue;
      const style = host.style;
      style.boxSizing = 'border-box';
      style.inlineSize = `${rect.width}px`;
      style.blockSize = `${rect.height}px`;
      style.overflow = 'hidden';
      states.set(host, {
        kind: 'block',
        el: host,
        chars,
        leaves,
        decoding: false,
        resolved: false,
        churning: false,
        shown,
        churnAt: null,
      });
    } catch {
      for (const leaf of leaves) {
        try {
          leaf.slot.replaceWith(leaf.node);
          leaf.sr?.remove();
        } catch {
          /* keep unwinding the rest */
        }
      }
      const style = host.style;
      style.removeProperty('inline-size');
      style.removeProperty('block-size');
      style.removeProperty('box-sizing');
      style.removeProperty('overflow');
      states.delete(host);
    }
  }
  if (states.size === 0) return;

  /* --- Section-level trigger index (US-1301): every target groups under its
     `.section` so ONE midline fire decodes the whole section together; a
     fired-sections Set lets a late card expansion know whether to decode now
     (section fired) or wait (the no-longer-collapsed hosts ride the section's
     own fire). Region bookkeeping maps each US-703 card to its
     still-unresolved [data-collapse-region] hosts — the deferrable, CLIPPED
     content (card-head hosts outside the region are deliberately NOT mapped:
     they stay visible while collapsed and decode with the section). -------- */
  const sectionTargets = new Map<HTMLElement, HTMLElement[]>();
  const firedSections = new Set<HTMLElement>();
  /** Block host → its US-703 card, ONLY for hosts inside the card's region. */
  const hostCard = new Map<HTMLElement, HTMLElement>();
  /** Card → its still-unresolved region hosts (drives the per-card expansion
   * observer's disconnect-when-done). */
  const cardHosts = new Map<HTMLElement, Set<HTMLElement>>();
  states.forEach((state, el) => {
    const section = el.closest<HTMLElement>('.section');
    if (section) {
      const list = sectionTargets.get(section);
      if (list) list.push(el);
      else sectionTargets.set(section, [el]);
    }
    if (state.kind !== 'block') return;
    const card = el
      .closest('[data-collapse-region]')
      ?.closest<HTMLElement>('[data-collapse]');
    if (!card) return;
    hostCard.set(el, card);
    const set = cardHosts.get(card);
    if (set) set.add(el);
    else cardHosts.set(card, new Set([el]));
  });

  /* --- Re-pin on real fonts, one task, no paint between (US-903 titles +
     US-1202 blocks). Titles keep the shipped per-title swap → measure →
     swap-back; blocks batch (unpin + finals in → ONE read pass → scrambles
     back + re-pin) so the whole page re-measures in one layout. ---------- */
  const remeasure = (): void => {
    for (const [, state] of states) {
      if (state.kind !== 'title' || state.resolved) continue;
      const title = state.el;
      try {
        const shownNow = title.textContent ?? '';
        title.style.removeProperty('inline-size');
        title.style.removeProperty('block-size');
        title.textContent = state.finalText;
        const rect = title.getBoundingClientRect();
        title.textContent = shownNow;
        title.style.inlineSize = `${rect.width}px`;
        title.style.blockSize = `${rect.height}px`;
      } catch {
        finishTarget(title, state); // async (fonts.ready) — bindings are live
      }
    }
    const pending: BlockState[] = [];
    for (const [, state] of states) {
      if (state.kind === 'block' && !state.resolved && !state.decoding) {
        pending.push(state);
      }
    }
    try {
      for (const state of pending) {
        const style = state.el.style;
        style.removeProperty('inline-size');
        style.removeProperty('block-size');
        style.removeProperty('overflow');
        for (const leaf of state.leaves) leaf.slot.textContent = leaf.text;
      }
      const rects = pending.map((state) => state.el.getBoundingClientRect());
      for (let i = 0; i < pending.length; i += 1) {
        const state = pending[i]!;
        const rect = rects[i]!;
        for (const leaf of state.leaves) {
          leaf.slot.textContent = leaf.written;
        }
        const style = state.el.style;
        style.boxSizing = 'border-box';
        style.inlineSize = `${rect.width}px`;
        style.blockSize = `${rect.height}px`;
        style.overflow = 'hidden';
      }
    } catch {
      // Restore every still-encoded block (their leaves may hold finals
      // mid-swap — restoring lands on the final text either way, P5).
      for (const state of pending) finishTarget(state.el, state);
    }
  };
  if (document.fonts?.ready) {
    document.fonts.ready.then(remeasure).catch(() => {});
  }

  /* --- Ambient churn (US-1003 titles → US-1203 blocks): ONE shared rAF
     ticker for BOTH kinds. Titles are budget-exempt (≤1 textContent write
     each, ≤8 total); block LEAF writes share the global
     CHURN_FRAME_WRITE_BUDGET, spent round-robin ONE leaf per host per visit
     with a carried cursor so every in-band host keeps boiling even when the
     due backlog exceeds the budget (deferred past-due slots fire on a later
     frame). The ticker re-schedules only while at least one target is
     eligible; the churn observer re-arms it on re-entry; hidden tabs pause
     structurally (rAF stops firing). A tick error on one target restores
     THAT target (P5) and leaves the rest churning. ----------------------- */
  let churnRaf = 0;
  /** Round-robin cursor over the churning block hosts, carried across frames
   * so budget exhaustion rotates which hosts get served first (fairness). */
  let churnCursor = 0;

  /** Leaf indices of `state` holding ≥1 due slot at `ts`. The first tick
   * builds the per-slot timers and reports nothing due (the titles' lazy
   * pattern — swaps start one churn period after membership). */
  const dueLeaves = (state: BlockState, ts: number): number[] => {
    let next = state.churnAt;
    if (!next) {
      next = state.chars.map(
        () => ts + randomBetween(CHURN_MIN_MS, CHURN_MAX_MS),
      );
      state.churnAt = next;
      return [];
    }
    const due: number[] = [];
    for (let li = 0; li < state.leaves.length; li += 1) {
      const leaf = state.leaves[li]!;
      for (let i = leaf.start; i < leaf.end; i += 1) {
        const ch = state.chars[i] ?? '';
        if (!isWs(ch) && ts >= next[i]!) {
          due.push(li);
          break;
        }
      }
    }
    return due;
  };

  /** Swap every due slot of ONE leaf + write that leaf span — one budget
   * unit (≤1 write per leaf per frame: a leaf appears once in its list). */
  const churnLeaf = (state: BlockState, li: number, ts: number): void => {
    const leaf = state.leaves[li]!;
    const next = state.churnAt!;
    for (let i = leaf.start; i < leaf.end; i += 1) {
      const ch = state.chars[i] ?? '';
      if (isWs(ch) || ts < next[i]!) continue;
      state.shown[i] = randomGlyph();
      next[i] = ts + randomBetween(CHURN_MIN_MS, CHURN_MAX_MS);
    }
    let text = '';
    for (let i = leaf.start; i < leaf.end; i += 1) text += state.shown[i];
    leaf.written = text;
    leaf.slot.textContent = text;
  };

  const churnTick = (ts: number): void => {
    churnRaf = 0;
    let eligible = false;
    // Titles (budget-exempt, the shipped US-1003 path).
    for (const [title, state] of states) {
      if (state.kind !== 'title') continue;
      if (state.resolved || state.decoding || !state.churning) continue;
      eligible = true;
      try {
        let next = state.churnAt;
        if (!next) {
          next = state.chars.map(
            () => ts + randomBetween(CHURN_MIN_MS, CHURN_MAX_MS),
          );
          state.churnAt = next;
        }
        let changed = false;
        for (let i = 0; i < state.chars.length; i += 1) {
          const ch = state.chars[i] ?? '';
          if (isWs(ch) || ts < next[i]!) continue;
          state.shown[i] = randomGlyph();
          next[i] = ts + randomBetween(CHURN_MIN_MS, CHURN_MAX_MS);
          changed = true;
        }
        if (changed) title.textContent = state.shown.join('');
      } catch {
        finishTarget(title, state);
      }
    }
    // Blocks (US-1203): the budgeted round-robin over churning hosts.
    const hosts: BlockState[] = [];
    for (const [, state] of states) {
      if (state.kind !== 'block') continue;
      if (state.resolved || state.decoding || !state.churning) continue;
      hosts.push(state);
    }
    if (hosts.length > 0) {
      eligible = true;
      const n = hosts.length;
      const lists = hosts.map((state) => {
        try {
          return dueLeaves(state, ts);
        } catch {
          finishTarget(state.el, state);
          return [];
        }
      });
      const pos = lists.map(() => 0);
      let remaining = 0;
      for (const list of lists) remaining += list.length;
      let budget = CHURN_FRAME_WRITE_BUDGET;
      let k = churnCursor % n;
      while (budget > 0 && remaining > 0) {
        const idx = k % n;
        k += 1;
        const list = lists[idx]!;
        const p = pos[idx]!;
        if (p >= list.length) continue;
        pos[idx] = p + 1;
        remaining -= 1;
        const state = hosts[idx]!;
        if (state.resolved) continue; // an earlier error resolved it mid-frame
        try {
          churnLeaf(state, list[p]!, ts);
          budget -= 1;
        } catch {
          remaining -= list.length - pos[idx]!;
          pos[idx] = list.length;
          finishTarget(state.el, state);
        }
      }
      churnCursor = k % n;
    }
    if (eligible) churnRaf = requestAnimationFrame(churnTick);
  };
  const scheduleChurn = (): void => {
    if (!churnRaf) churnRaf = requestAnimationFrame(churnTick);
  };

  const churnObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const state = states.get(entry.target as HTMLElement);
        if (!state || state.resolved) continue;
        state.churning = entry.isIntersecting;
        if (entry.isIntersecting) scheduleChurn();
      }
    },
    { threshold: 0, rootMargin: '200px 0px 200px 0px' },
  );
  states.forEach((state, el) => {
    if (!state.resolved) churnObserver.observe(el);
  });

  /** Resolve a target forever + tear the whole module down once EVERY target
   * (all titles + every block host) has resolved: the churn ticker, the section
   * midline IO and every expansion observer all disconnect (the self-removal
   * discipline); a card's own expansion observer disconnects as soon as its
   * region's hosts have all resolved. Only ever called AFTER init completes
   * (decode / churn / fonts.ready callbacks are async), so every referenced
   * binding is live. */
  const finishTarget = (el: HTMLElement, state: TargetState): void => {
    if (state.kind === 'title') restoreTitle(state);
    else restoreBlock(state);
    churnObserver.unobserve(el);
    const card = hostCard.get(el);
    if (card) {
      const set = cardHosts.get(card);
      if (set) {
        set.delete(el);
        if (set.size === 0) {
          expandObservers.get(card)?.disconnect();
          expandObservers.delete(card);
          cardHosts.delete(card);
        }
      }
    }
    for (const [, s] of states) {
      if (!s.resolved) return;
    }
    if (churnRaf) {
      cancelAnimationFrame(churnRaf);
      churnRaf = 0;
    }
    churnObserver.disconnect();
    midlineObserver.disconnect();
    expandObservers.forEach((observer) => observer.disconnect());
    expandObservers.clear();
  };

  /** The sweep's per-frame fan-out: write ONLY the leaf spans whose slice of
   * the host's concatenated chars changed (≤1 write per leaf per step). */
  const blockWriter =
    (state: BlockState) =>
    (shown: string[]): void => {
      for (const leaf of state.leaves) {
        let text = '';
        for (let i = leaf.start; i < leaf.end; i += 1) text += shown[i];
        if (text !== leaf.written) {
          leaf.written = text;
          leaf.slot.textContent = text;
        }
      }
    };

  const decode = (el: HTMLElement): void => {
    const state = states.get(el);
    if (!state || state.decoding || state.resolved) return;
    // Deferral (owner decision 2), STATE-based at decode-attempt time: a host
    // inside a COLLAPSED card's region stays encoded — its card's expansion
    // observer decodes it once the card opens (expand→re-collapse→fire
    // re-defers correctly with no history).
    if (hostCard.get(el)?.hasAttribute('data-collapsed')) return;
    state.decoding = true; // churn skips this target from the very next tick
    // The engine resolves to the CAPTURED chars — never the mutated DOM — and
    // ALWAYS lands in finishTarget() (natural end, hard cap or error alike).
    if (state.kind === 'title') {
      // 'sequential' (US-1004): strict left-to-right single-slot locks with a
      // churn-cadence tail — the nav cascade keeps the default wave.
      runDecode(el, state.chars, () => finishTarget(el, state), 'sequential');
    } else {
      // 'sweep' (US-1201): the same left-to-right order + churning tail, K ≥ 1
      // consecutive slots per step so any block length lands in ~1.5–3 s.
      // Collapse-REGION hosts run 'sweep-fast' (US-1302, the ×0.65 caps/gap
      // band): text the reader summons by opening a card resolves noticeably
      // quicker — selected here, the ONE decode entry, so it applies on EVERY
      // path (the expansion decode AND a section fire over a region expanded
      // before its section fired).
      runDecode(
        el,
        state.chars,
        () => finishTarget(el, state),
        el.closest('[data-collapse-region]') ? 'sweep-fast' : 'sweep',
        blockWriter(state),
      );
    }
  };

  // The one trigger for BOTH kinds (US-1301): the SECTION's border-box
  // entering the TOP HALF of the viewport (rootMargin trims the bottom 50%
  // off the root box) decodes the whole section — title + every non-deferred
  // block host — in the same task, in parallel. One shot per section; a
  // section already intersecting the top half at init fires at observe (deep
  // link / scroll restoration).
  const midlineObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        midlineObserver.unobserve(entry.target);
        const section = entry.target as HTMLElement;
        firedSections.add(section);
        for (const el of sectionTargets.get(section) ?? []) decode(el);
      }
    },
    { threshold: 0, rootMargin: '0px 0px -50% 0px' },
  );
  sectionTargets.forEach((_targets, section) => midlineObserver.observe(section));

  /* --- Expansion observers (US-1301, owner decision 3): one MutationObserver
     per US-703 card holding encoded region hosts, watching the POST-flip
     [data-collapsed] state collapse.ts owns (never a click listener — that
     races collapse.ts's own handler). Card expanded + owning section already
     fired ⇒ the whole region decodes together NOW; section not fired yet ⇒
     nothing starts (the hosts ride the section's own fire). The boot
     collapse only ADDS [data-collapsed], which the guard ignores. --------- */
  const expandObservers = new Map<HTMLElement, MutationObserver>();
  cardHosts.forEach((set, card) => {
    const observer = new MutationObserver(() => {
      if (card.hasAttribute('data-collapsed')) return;
      const section = card.closest<HTMLElement>('.section');
      if (!section || !firedSections.has(section)) return;
      // Copy: finishTarget prunes `set` as hosts resolve (error path).
      for (const el of [...set]) decode(el);
    });
    observer.observe(card, {
      attributes: true,
      attributeFilter: ['data-collapsed'],
    });
    expandObservers.set(card, observer);
  });
};

init();

export {};
