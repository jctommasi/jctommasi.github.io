/**
 * Hero terminal typewriter (US-202) — under FULL motion only: for each command in
 * order it shows the jctommasi@website:~$ prompt, types the `echo '<payload>'` command
 * char-by-char with a blinking block cursor, pauses a short Enter beat, then prints
 * the echoed phrase WHOLE/instant (a real `echo`), and advances to the next prompt
 * — ending at rest on a trailing jctommasi@website:~$ ▌. Vanilla TS, no deps; loaded by a
 * processed <script> in PageBody.astro. Plays ONCE per load (no observer/loop).
 *
 * The server-rendered .hero__transcript (always in the DOM, held at opacity:0 under
 * the flag) is the single source of the copy AND the resting state: this module
 * reads its payloads as the typing targets and CLONES its .hero__cmd/.hero__out
 * nodes so typed lines inherit the Astro scoped-style id (data-astro-cid) — the
 * scoped .hero__cmd/.hero__out rules (font-size clamp, hanging indent, colours)
 * then apply, so the overlay matches the static transcript exactly → zero CLS.
 *
 * Between messages it simulates `clear` (US-206): a fresh prompt types ` clear`,
 * Enter, then the overlay is wiped so the next command types on an empty screen.
 * The LAST message does NOT clear — the animation rests on it (Option A): the
 * .hero__stream overlay keeps showing the last echo line + output + trailing
 * prompt, and the [data-hero-anim] flag STAYS set on natural end and on skip
 * (WCAG 2.2.2) so the resting overlay remains the visual (the full static
 * transcript is NOT revealed). Only the error path (catch) empties the overlay
 * and drops the flag → the static .hero__transcript shows (the P5 safety net).
 * Calm (data-motion='reduced'), no-JS, and error paths never blank (P5).
 *
 * Flash-free (the US-110 split-flag): the BaseLayout pre-paint head script sets
 * html[data-hero-anim] only under full motion, so CSS hides .hero__transcript
 * (opacity:0) and shows the (empty) .hero__stream overlay from the first paint.
 *
 * Interactive (US-1606): when the scripted part is DONE — natural end, skip, or
 * error — and immediately on the calm (data-motion='reduced') path, the resting
 * prompt becomes a real one: `activateConsole()` builds a runtime console layer
 * (a role="log" screen + a focusable input) over the same grid cell. Three
 * commands run — whoami, echo, clear — and every other input answers
 * `bash: <cmd>: command not found`. Nothing is server-rendered, so the no-JS
 * path is unchanged (P5); nothing fetches, and typed text only ever becomes
 * textContent on a cloned SSR node.
 *
 * Drag (US-203): the .hero__titlebar is a drag handle that moves the whole
 * .hero__term via transform:translate (visual only → no reflow, zero CLS, no
 * scrollbar growth), clamped so the title bar can never leave the viewport. It
 * runs REGARDLESS of motion (interaction, not gratuitous motion) — set up below
 * the motion gate — and is in-memory only, so a reload resets to the layout spot.
 */
import { prefersReducedMotion } from '../theme/motion';

// Tuning knobs — the echo command types SLOWLY so a soon-to-be-cleared message
// (US-206) is readable. MAX_TICKS ≥ the longest seed command length ⇒ the seeds
// type one char per tick; the ceiling still streams a few chars/tick for an
// unusually long future payload so it doesn't drag.
const TYPE_MS = 60; // per-tick delay while typing a command (~2× US-205)
const MAX_TICKS = 100; // caps a command's ticks → chars/tick scales with length (≥ longest seed command incl. the longer ES translation ⇒ 1 char/tick)
const PROMPT_HOLD_MS = 240; // dwell on a fresh prompt before typing starts
const ENTER_BEAT_MS = 320; // pause after the command, before the output (the Enter)
const POST_OUTPUT_MS = 460; // pause after the output, before the next prompt

// The shell's own literals (US-1606). These are language-agnostic shell output
// — the same class as the `jctommasi@website:~$` prompt and the `echo '…'`
// wrapper (US-003) — so they are identical in both locales and stay OUT of the
// string bundle. The only translatable string the console needs is the input's
// accessible name, which rides in on data-terminal-label.
const PS1_TEXT = 'jctommasi@website:~$';
const WHOAMI_OUT = 'visitor';
const notFound = (name: string): string => `bash: ${name}: command not found`;

const root = document.documentElement;
const term = document.querySelector<HTMLElement>('.hero__term');
const stream = term?.querySelector<HTMLElement>('.hero__stream') ?? null;
const transcript = term?.querySelector<HTMLElement>('.hero__transcript') ?? null;
const io = term?.querySelector<HTMLElement>('.hero__io') ?? null;
const termBody = term?.querySelector<HTMLElement>('.hero__body') ?? null;

// The static lines to clone (single source). The last .hero__cmd is the trailing
// bare prompt (ps1 + cursor); the first N are the echo commands, paired 1:1 with
// the N .hero__out payload lines.
const cmds = transcript
  ? Array.from(transcript.querySelectorAll<HTMLElement>('.hero__cmd'))
  : [];
const outs = transcript
  ? Array.from(transcript.querySelectorAll<HTMLElement>('.hero__out'))
  : [];
const trailing = cmds.length ? cmds[cmds.length - 1] : null;

// Line factories, shared by the typewriter (US-202) and the interactive console
// (US-1606). Every line the page ever adds is a cloneNode of an SSR node, so it
// inherits the Astro scoped-style id (data-astro-cid) and matches the static
// transcript's metrics exactly — the zero-CLS rule. The fallbacks only fire if
// the SSR nodes are missing (they never are), so the console degrades instead of
// throwing.
const ps1Source = trailing?.querySelector('.hero__ps1') ?? null;
const cursorSource = trailing?.querySelector('.cursor') ?? null;

function makePs1(): Node {
  if (ps1Source) return ps1Source.cloneNode(true);
  const s = document.createElement('span');
  s.className = 'hero__ps1';
  s.textContent = PS1_TEXT;
  return s;
}
function makeCursor(): Element {
  if (cursorSource) return cursorSource.cloneNode(true) as Element;
  const c = document.createElement('span');
  c.className = 'cursor';
  c.setAttribute('aria-hidden', 'true');
  c.textContent = '▌';
  return c;
}

// US-1606 activation latch. It MUST be declared above the calm-path call below:
// `function activateConsole` hoists, but a `let` it closes over does not — a
// declaration further down the module leaves it in the temporal dead zone when
// the reduced-motion branch calls it during module evaluation (ReferenceError,
// and the calm path would ship no console at all).
let consoleLive = false;

// Drag (US-203) — unconditional (interaction, not motion): move the window by
// its title bar. No JS ⇒ the window is simply static (progressive enhancement).
const titlebar = term?.querySelector<HTMLElement>('.hero__titlebar') ?? null;
if (term && titlebar) setupDrag(term, titlebar);

// Full-motion gate (P5). Under reduced motion the head script never set the flag,
// so the static transcript is already the visual — hand it straight to the
// interactive console (US-1606 AC1). Under full motion: animate if we have the
// overlay + copy, else drop the flag so the static transcript shows (the flag
// would otherwise leave the hero blank — never blank, P5). Either way the
// console activates when the scripted part is DONE — `play` resolves on natural
// end, on skip and on error alike, so one `.then` covers all three.
if (!prefersReducedMotion()) {
  if (stream && outs.length && trailing && cmds.length) {
    void play(stream, outs, cmds[0], trailing).then(activateConsole);
  } else {
    root.removeAttribute('data-hero-anim');
    activateConsole();
  }
} else {
  activateConsole();
}

async function play(
  stream: HTMLElement,
  outs: HTMLElement[],
  cmdTemplate: HTMLElement,
  trailing: HTMLElement,
): Promise<void> {
  const SKIP = Symbol('skip');
  const skipEvents = ['keydown', 'pointerdown', 'wheel', 'scroll'] as const;
  let ended = false;
  let timer = 0;
  let rejectWait: ((reason?: unknown) => void) | null = null;

  const cleanup = (): void => {
    window.clearTimeout(timer);
    rejectWait?.(SKIP);
    skipEvents.forEach((e) => window.removeEventListener(e, skip));
  };

  // Build the resting frame (Option A): the LAST message's echo line + output +
  // trailing prompt, on an otherwise-cleared screen. This is exactly what the
  // loop leaves at natural end (the prior message was cleared away); skip() also
  // renders it so an early skip snaps to the same resting visual, never blank,
  // never frozen mid-clear. Clones inherit data-astro-cid ⇒ zero CLS.
  const renderRest = (): void => {
    const last = outs.length - 1;
    const payload = (outs[last].textContent ?? '').trim();
    const line = cmdTemplate.cloneNode(false) as HTMLElement;
    line.append(makePs1(), document.createTextNode(` echo '${payload}'`));
    stream.replaceChildren(line, outs[last].cloneNode(true), trailing.cloneNode(true));
  };

  // Skip (WCAG 2.2.2): the first user intent snaps to the resting overlay and
  // KEEPS the flag set (the overlay stays the visual — Option A).
  const skip = (): void => {
    if (ended) return;
    ended = true;
    cleanup();
    renderRest();
  };
  // Error path (P5 safety net): empty the overlay + drop the flag → the static
  // .hero__transcript shows again. Never leaves the hero mid-line or blank.
  const fail = (): void => {
    if (ended) return;
    ended = true;
    cleanup();
    stream.replaceChildren();
    root.removeAttribute('data-hero-anim');
  };

  skipEvents.forEach((e) => window.addEventListener(e, skip, { passive: true }));

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve, reject) => {
      if (ended) {
        reject(SKIP);
        return;
      }
      rejectWait = reject;
      timer = window.setTimeout(resolve, ms);
    });

  // The ps1 prompt + block cursor come from the module-level factories (clones of
  // the SSR trailing prompt, so they keep the data-astro-cid → the
  // "jctommasi@website:~$" styling and the full-motion blink). A fresh cursor per
  // line; only one is ever in the DOM at a time.
  const makeCmdLine = (): HTMLElement => cmdTemplate.cloneNode(false) as HTMLElement;

  // Type `text` into `node` char-by-char; the cursor sits after `node`, so it
  // trails the growing command with no re-positioning.
  const typeInto = async (node: Text, text: string): Promise<void> => {
    const step = Math.max(1, Math.ceil(text.length / MAX_TICKS));
    for (let i = 0; i < text.length; ) {
      i = Math.min(text.length, i + step);
      node.data = text.slice(0, i);
      await wait(TYPE_MS);
    }
  };

  try {
    for (let i = 0; i < outs.length; i += 1) {
      // Fresh prompt: jctommasi@website:~$ ▌ (text node seeded with the space).
      const line = makeCmdLine();
      const text = document.createTextNode(' ');
      const cursor = makeCursor();
      line.append(makePs1(), text, cursor);
      stream.append(line);
      await wait(PROMPT_HOLD_MS);

      // Type the echo command; the payload is the accessible output line's text.
      const payload = (outs[i].textContent ?? '').trim();
      await typeInto(text, ` echo '${payload}'`);

      // Enter: cursor leaves the input line, then the phrase echoes WHOLE/instant.
      await wait(ENTER_BEAT_MS);
      cursor.remove();
      stream.append(outs[i].cloneNode(true));
      await wait(POST_OUTPUT_MS);

      // Between messages (US-206): simulate `clear` — a fresh prompt types
      // ` clear`, an Enter beat, then wipe the overlay so the next command types
      // on an empty screen. The LAST message is NOT cleared (Option A rest).
      if (i < outs.length - 1) {
        const clr = makeCmdLine();
        const clrText = document.createTextNode(' ');
        const clrCursor = makeCursor();
        clr.append(makePs1(), clrText, clrCursor);
        stream.append(clr);
        await wait(PROMPT_HOLD_MS);
        await typeInto(clrText, ' clear');
        await wait(ENTER_BEAT_MS);
        stream.replaceChildren(); // the screen wipes
        await wait(PROMPT_HOLD_MS); // a beat of blank screen before the next prompt
      }
    }
    // Land on the trailing bare prompt (its own ps1 + blinking cursor) and hold a
    // beat. The overlay now shows ONLY the last message + trailing prompt (Option
    // A rest) — keep the flag set so it stays the visual; do NOT reveal the full
    // static transcript. The GOTCHA (wait BEFORE ending) still holds so the
    // resting ▌ frame paints before listeners are torn down.
    stream.append(trailing.cloneNode(true));
    await wait(POST_OUTPUT_MS);
    ended = true;
    cleanup();
  } catch (err) {
    if (err !== SKIP) fail(); // real error → static transcript (P5); skip already rested
  }
}

/**
 * US-1606 — hand the rested prompt to the visitor: a real, tiny shell.
 *
 * Structure (all of it created HERE, never server-rendered — no-JS ships the
 * static transcript with no input at all, P5):
 *
 *   .hero__console            position:absolute;inset:0 inside .hero__io, so it
 *                             is out of flow and can NEVER grow the window box
 *     .hero__log[role=log]    the screen — scrolls internally, newest in view
 *     p.hero__cmd.hero__inputline > .hero__ps1 + input.hero__input
 *
 * The log is seeded with a clone of whatever is on screen at activation (the
 * rested overlay under full motion, the static transcript on the calm path)
 * MINUS its trailing prompt, which the live input line replaces. Those seeded
 * copies are marked aria-hidden: the SSR .hero__transcript (held at opacity 0,
 * still laid out) stays the authoritative copy for assistive tech, so nothing is
 * announced twice — while the log itself is role="log" (NOT aria-hidden, unlike
 * the typewriter stream) so every command's output IS announced as it lands.
 *
 * Exactly three commands run; everything else — curl, wget, help included —
 * answers `bash: <cmd>: command not found`. There is no fetch, no dynamic
 * import, no eval anywhere on this path: typed text can only ever become
 * textContent on a cloned SSR node, so it can neither reach the network nor
 * inject markup.
 */
function activateConsole(): void {
  const cmdTemplate = cmds.length ? cmds[0] : null;
  const outTemplate = outs.length ? outs[0] : null;
  if (consoleLive || !io || !cmdTemplate || !outTemplate) return;
  consoleLive = true;

  const consoleEl = document.createElement('div');
  consoleEl.className = 'hero__console';
  consoleEl.tabIndex = -1; // the Escape target — focusable programmatically only

  const log = document.createElement('div');
  log.className = 'hero__log';
  log.setAttribute('role', 'log');

  // Seed the screen with what is on it right now, minus the trailing prompt.
  const source = stream && stream.childElementCount ? stream : transcript;
  const seed = source ? Array.from(source.children) : [];
  seed.slice(0, Math.max(0, seed.length - 1)).forEach((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.setAttribute('aria-hidden', 'true'); // decoration; the transcript is the AT copy
    log.append(copy);
  });
  stream?.replaceChildren(); // the typewriter overlay hands the screen over

  const inputLine = cmdTemplate.cloneNode(false) as HTMLElement;
  inputLine.classList.add('hero__inputline');
  const input = document.createElement('input');
  input.className = 'hero__input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  const label = term?.dataset.terminalLabel;
  if (label) input.setAttribute('aria-label', label); // the ONE new P8 string
  // The resting block cursor stays part of the prompt (US-201/US-206's visual):
  // it shows while nothing is focused — so the handover from the rested
  // animation, and the calm path's first paint, look exactly as before — and CSS
  // hides it on :focus-within, where the real text caret takes over in the same
  // spot.
  inputLine.append(makePs1(), makeCursor(), input);

  consoleEl.append(log, inputLine);
  io.append(consoleEl);
  root.setAttribute('data-hero-live', ''); // CSS hides the transcript behind it
  log.scrollTop = log.scrollHeight;

  // --- the shell -----------------------------------------------------------
  const toBottom = (): void => {
    log.scrollTop = log.scrollHeight;
  };
  /** Echo the typed line back, exactly as a shell does. textContent only. */
  const echoLine = (text: string): void => {
    const line = cmdTemplate.cloneNode(false) as HTMLElement;
    line.append(makePs1(), document.createTextNode(` ${text}`));
    log.append(line);
  };
  /** Print one output line (the accessible half — role=log announces it). */
  const print = (text: string): void => {
    const out = outTemplate.cloneNode(false) as HTMLElement;
    out.textContent = text;
    log.append(out);
  };
  /** Drop ONE matching pair of surrounding quotes, the way `echo 'x'` does. */
  const unquote = (s: string): string => {
    const q = s.charAt(0);
    return (q === "'" || q === '"') && s.length > 1 && s.endsWith(q) ? s.slice(1, -1) : s;
  };

  const run = (raw: string): void => {
    const line = raw.trim();
    echoLine(line);
    if (!line) return; // bare Enter → just a fresh prompt, like a real shell
    const gap = line.indexOf(' ');
    const name = gap === -1 ? line : line.slice(0, gap);
    const rest = gap === -1 ? '' : line.slice(gap + 1).trim();
    if (name === 'clear') {
      log.replaceChildren(); // the animation's clear mechanics: wipe the screen
    } else if (name === 'whoami') {
      print(WHOAMI_OUT);
    } else if (name === 'echo') {
      print(unquote(rest));
    } else {
      print(notFound(name));
    }
  };

  const history: string[] = [];
  let histIdx = 0; // == history.length ⇒ "the line being typed"

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value;
      input.value = '';
      run(value);
      const entry = value.trim();
      if (entry && history[history.length - 1] !== entry) history.push(entry);
      histIdx = history.length;
      toBottom();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx > 0) input.value = history[(histIdx -= 1)]; // assignment moves the caret to the end
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx < history.length - 1) input.value = history[(histIdx += 1)];
      else {
        histIdx = history.length;
        input.value = '';
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      consoleEl.focus(); // hand focus back to the page (the US-034 editor convention)
    }
  });

  // Click/tap anywhere on the terminal body focuses the prompt — the way a
  // terminal window behaves. Never on load (no autofocus), and never while the
  // visitor is selecting text.
  termBody?.addEventListener('click', (e) => {
    if (e.target === input) return;
    if (window.getSelection()?.isCollapsed === false) return;
    input.focus();
  });
}

// Drag the window by its title bar. Pointer Events (unified mouse/touch/pen) +
// setPointerCapture so the move tracks even when the pointer leaves the handle;
// the CSS `touch-action:none` on .hero__titlebar (only there) lets a touch drag
// the bar without hijacking page scroll elsewhere. Transform-only + clamped to
// the viewport ⇒ no reflow, no document overflow, title bar always reachable.
function setupDrag(win: HTMLElement, handle: HTMLElement): void {
  const clamp = (v: number, lo: number, hi: number): number =>
    lo > hi ? lo : Math.min(Math.max(v, lo), hi); // lo>hi ⇒ box wider than vw: keep left visible

  let tx = 0;
  let ty = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;
  // Untransformed layout box, captured at pointerdown (no reflow during a drag).
  let layoutLeft = 0;
  let layoutTop = 0;
  let boxW = 0;
  let barH = 0;

  const onDown = (e: PointerEvent): void => {
    if (dragging || e.button > 0 || !e.isPrimary) return; // primary press only
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    baseX = tx;
    baseY = ty;
    const rect = win.getBoundingClientRect(); // current visual rect (incl. tx/ty)
    layoutLeft = rect.left - tx;
    layoutTop = rect.top - ty;
    boxW = rect.width;
    barH = handle.getBoundingClientRect().height;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault(); // no text selection / native drag from the handle
  };

  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    // Keep the whole window within the viewport horizontally (no document
    // overflow, AC6) and the title bar fully visible vertically (AC2).
    tx = clamp(baseX + (e.clientX - startX), -layoutLeft, window.innerWidth - layoutLeft - boxW);
    ty = clamp(baseY + (e.clientY - startY), -layoutTop, window.innerHeight - layoutTop - barH);
    win.style.transform = `translate(${tx}px, ${ty}px)`;
  };

  const onUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
  };

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}
