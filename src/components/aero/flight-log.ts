/**
 * Flight-logbook live module (US-1404) — hydrates the US-1403 honest shell
 * ([data-flightlog] hooks) from the owner's PUBLIC Google Sheet, fetched in
 * the browser on every page view (owner decision 1, 2026-08-02: always-current
 * data over build-time snapshots; no API key, no secrets — the sheet answers
 * anonymous gviz CSV requests with CORS echoing the requesting origin,
 * verified 2026-08-02).
 *
 * Lazy by construction: this file is a dynamic import() target of
 * ./flight-log-loader (the US-034 approach-IO shape), so it lands in its own
 * code-split chunk that never enters the initial bundle (gate:js).
 *
 * QA hooks (query param `?flightlog=`, the ?tier=/?motion= convention):
 *   ?flightlog=off     → force the honest unavailable path (no fetch at all)
 *   ?flightlog=<url>   → override the CSV source (harness fixtures, e.g. a
 *                        /fixture.csv served from the dist origin)
 *
 * Fallback contingency: if Google ever regresses the gviz CORS behaviour,
 * republish the sheet via File → Share → Publish to web → CSV and point
 * SHEET_CSV_URL at the resulting /pub?output=csv URL — same quoted-CSV shape,
 * same parser (recorded owner fallback, 2026-08-02).
 *
 * PINNED SHEET SCHEMA (read 2026-08-02, first/default tab): header
 * `HORAS DE VUELO, MATRICULA, DESDE, HASTA, FECHA, ATERRIZAJES`; hours are
 * H:MM durations summed in INTEGER MINUTES (never float math); dates are
 * DD/MM/YYYY (never MM/DD); route = 'DESDE → HASTA'; gviz quotes EVERY field.
 * All states are honest (P3): counters/strips only ever come from the fetched
 * CSV; any failure shows the pending status + em-dash counters + an empty bay
 * (the SSR shell), NEVER partial or fabricated numbers.
 *
 * "04 — Flight Strip" render (2026-08-08, supersedes the <tr> ledger rows):
 * every parsed flight becomes a <li class="aero__strip"> holding a <dl> of
 * dt/dd pairs (Route / Date / Registration / Hours / Landings). The dt label
 * texts are read from the SSR aria-hidden header rail ([data-log-col] —
 * locale-correct, so this module stays locale-blind, the quiz.ts precedent).
 * ALL rows render (the totals already required parsing all of them); rows
 * beyond LOG_VISIBLE_ROWS carry [data-log-overflow] and stay display:none
 * while the bay has [data-log-collapsed] — the SSR Show-all <button>
 * ([data-flightlog="more"]) toggles that attribute + its own aria-expanded/
 * label ({count} filled with the DERIVED row count). Focus stays on the
 * button across both flips (never dropped).
 */

// Language-agnostic identifiers (sheet id + column mapping), NOT P8 strings.
const SHEET_ID = '1G-nP8k-1FkLrBB65KeUPGuzo2MFWKnPe2AcTUGKTUBc';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const LOG_VISIBLE_ROWS = 8;
const FETCH_TIMEOUT_MS = 10_000;

/** Case/accent-insensitive header aliases (ES pinned schema + EN belt-and-
 *  suspenders). Keys are matched against normalize()d header cells. */
const HEADER_ALIASES: Record<string, readonly string[]> = {
  hours: ['HORAS DE VUELO', 'HORAS', 'FLIGHT HOURS', 'HOURS'],
  reg: ['MATRICULA', 'REGISTRATION'],
  from: ['DESDE', 'FROM'],
  to: ['HASTA', 'TO'],
  date: ['FECHA', 'DATE'],
  landings: ['ATERRIZAJES', 'LANDINGS'],
};

interface FlightRow {
  /** original sheet order — the newest-first tie-break (later row first) */
  idx: number;
  dateMs: number;
  dateRaw: string;
  reg: string;
  route: string;
  hoursRaw: string;
  minutes: number;
  landings: number;
}

/** Uppercase, strip diacritics + BOM, collapse whitespace — header matching. */
const normalize = (s: string): string =>
  s
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

/** Real quoted-CSV parse (gviz quotes every field; embedded commas/newlines;
 *  doubled-quote escapes; CRLF). Never a naive comma split. */
const parseCsv = (text: string): string[][] => {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

/** H:MM → integer minutes (the sheet convention); tolerates a decimal-hours
 *  cell ('1.5' / '1,5') defensively. null = not a duration (row skipped /
 *  totals-style rows excluded by construction). */
const parseHoursToMinutes = (raw: string): number | null => {
  const s = raw.trim();
  const hm = /^(\d+):([0-5]?\d)$/.exec(s);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  const dec = /^\d+(?:[.,]\d+)?$/.exec(s);
  if (dec) return Math.round(parseFloat(s.replace(',', '.')) * 60);
  return null;
};

/** DD/MM/YYYY → UTC ms for sorting (NEVER read as MM/DD). */
const parseDateDmy = (raw: string): number | null => {
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d);
};

/** Integer minutes → the sheet's H:MM display convention (no float drift). */
const formatMinutes = (total: number): string =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

/** Parse the whole CSV into flight rows, pinned to the real schema, tolerant
 *  around it: the header row is located by matching (first row that yields a
 *  date AND an hours column); a data row REQUIRES a parseable FECHA + HORAS —
 *  which excludes blank lines and any future in-sheet totals row by
 *  construction; ATERRIZAJES blank/invalid → 0 (the row still counts for
 *  hours); unknown extra columns are ignored, never rendered. */
const parseFlights = (text: string): FlightRow[] => {
  const rows = parseCsv(text);
  let headerIdx = -1;
  const col: Record<string, number> = {};
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const cells = rows[r].map(normalize);
    const found: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      const i = cells.findIndex((c) => aliases.includes(c));
      if (i !== -1) found[key] = i;
    }
    if (found.date !== undefined && found.hours !== undefined) {
      headerIdx = r;
      Object.assign(col, found);
      break;
    }
  }
  if (headerIdx === -1) return [];

  const cell = (row: string[], key: string): string => {
    const i = col[key];
    return i === undefined ? '' : (row[i] ?? '').trim();
  };

  const flights: FlightRow[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const dateRaw = cell(row, 'date');
    const hoursRaw = cell(row, 'hours');
    const dateMs = parseDateDmy(dateRaw);
    const minutes = parseHoursToMinutes(hoursRaw);
    if (dateMs === null || minutes === null) continue;
    const landingsInt = parseInt(cell(row, 'landings'), 10);
    const from = cell(row, 'from');
    const to = cell(row, 'to');
    flights.push({
      idx: r,
      dateMs,
      dateRaw,
      reg: cell(row, 'reg'),
      route: from || to ? `${from} → ${to}` : '',
      hoursRaw,
      minutes,
      landings: Number.isFinite(landingsInt) ? landingsInt : 0,
    });
  }
  return flights;
};

export const mount = async (): Promise<void> => {
  const region = document.querySelector<HTMLElement>('[data-flightlog="region"]');
  if (!region) return; // reader pages / missing hooks → clean no-op
  const status = region.querySelector<HTMLElement>('[data-flightlog="status"]');
  const hoursEl = region.querySelector<HTMLElement>('[data-flightlog="hours"]');
  const landingsEl = region.querySelector<HTMLElement>('[data-flightlog="landings"]');
  const list = region.querySelector<HTMLElement>('[data-flightlog="rows"]');
  const moreBtn = region.querySelector<HTMLButtonElement>('[data-flightlog="more"]');
  if (!status || !hoursEl || !landingsEl || !list || !moreBtn) return;

  // The SSR shell text IS the honest unavailable state (P1/P5); the loading
  // string + the Show-all labels ride on data attrs so this module stays
  // locale-blind (the quiz.ts data-attr precedent).
  const pendingText = (status.textContent ?? '').trim();
  const loadingText = status.dataset.flightlogLoading || pendingText;

  // Localized dt labels come from the SSR aria-hidden header rail — the ONE
  // locale-correct source (never authored here, zero new plumbing).
  const colLabels: Record<string, string> = {};
  for (const cell of region.querySelectorAll<HTMLElement>('[data-log-col]')) {
    const key = cell.dataset.logCol;
    if (key) colLabels[key] = (cell.textContent ?? '').trim();
  }

  // Failure/off path = back to the SSR shell exactly: pending status,
  // em-dash counters, an empty collapsed bay, the Show-all control hidden —
  // NEVER partial numbers or dead controls (P3/P5).
  const showUnavailable = (): void => {
    status.textContent = pendingText;
    // The honest states are VISIBLE — only the success announce is clip-
    // hidden (below); coming back from a hydrated state restores the text.
    status.classList.remove('alien-sr');
    hoursEl.textContent = '—';
    landingsEl.textContent = '—';
    list.replaceChildren();
    list.setAttribute('data-log-collapsed', '');
    moreBtn.hidden = true;
    moreBtn.setAttribute('aria-expanded', 'false');
  };

  let src = SHEET_CSV_URL;
  try {
    const qa = new URLSearchParams(window.location.search).get('flightlog');
    if (qa === 'off') {
      showUnavailable();
      return;
    }
    if (qa) src = qa;
  } catch {
    /* malformed URL API environment → keep the real endpoint */
  }

  status.textContent = loadingText;
  try {
    const res = await fetch(src, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`flight-log: HTTP ${res.status}`);
    const flights = parseFlights(await res.text());
    if (!flights.length) throw new Error('flight-log: no parseable rows');

    // ONE array, no drift: the visible rows and BOTH counters derive from the
    // same parsed array in the same pass. Newest-first by parsed FECHA; ties
    // keep the sheet's logbook order reversed (later sheet row first).
    flights.sort((a, b) => b.dateMs - a.dateMs || b.idx - a.idx);
    let totalMinutes = 0;
    let totalLandings = 0;
    for (const f of flights) {
      totalMinutes += f.minutes;
      totalLandings += f.landings;
    }

    // Runtime-created strips carry no Astro scoped cid — they are styled by
    // the `.aero__strips :global(…)` rules in PageBody (the US-036 boundary).
    // One <div class="aero__f aero__f-<col>"> per field groups its dt + dd
    // (valid <dl> grouping) so the shared --log-grid can align columns.
    const field = (col: string, value: string): HTMLDivElement => {
      const wrap = document.createElement('div');
      wrap.className = `aero__f aero__f-${col}`;
      const dt = document.createElement('dt');
      dt.textContent = colLabels[col] ?? '';
      const dd = document.createElement('dd');
      dd.textContent = value;
      wrap.append(dt, dd);
      return wrap;
    };

    // ALL flights render (the totals already parsed every row); strips past
    // the LOG_VISIBLE_ROWS default slots are vaulted behind the bay's
    // [data-log-collapsed] + their own [data-log-overflow]. --strip-i drives
    // the full-motion entrance stagger (overflow strips restart from 0 when
    // the Show-all flip first displays them). Per-flight landings (US-1608):
    // the already-parsed integer, so a blank sheet cell renders the honest
    // '0' the parser derived — never a guess.
    const strips = flights.map((f, i) => {
      const li = document.createElement('li');
      li.className = 'aero__strip';
      const overflow = i >= LOG_VISIBLE_ROWS;
      if (overflow) li.setAttribute('data-log-overflow', '');
      li.style.setProperty('--strip-i', String(overflow ? i - LOG_VISIBLE_ROWS : i));
      const dl = document.createElement('dl');
      dl.append(
        field('route', f.route),
        field('date', f.dateRaw),
        field('reg', f.reg),
        field('hours', f.hoursRaw),
        field('landings', String(f.landings)),
      );
      li.appendChild(dl);
      return li;
    });

    const hoursText = `${formatMinutes(totalMinutes)} h`;
    const landingsText = String(totalLandings);
    // The polite success announce composes the two EXISTING summary-rail
    // labels (the sibling <dt> of each value — read from the DOM, locale-
    // correct, zero new P8 strings) with the live totals.
    const labelFor = (el: HTMLElement): string =>
      (el.parentElement?.querySelector('dt')?.textContent ?? '').trim();
    const hoursLabel = labelFor(hoursEl);
    const landingsLabel = labelFor(landingsEl);
    const summary =
      hoursLabel && landingsLabel
        ? `${hoursLabel}: ${hoursText} · ${landingsLabel}: ${landingsText}`
        : `${hoursText} · ${landingsText}`;

    // The Show-all disclosure: only a sheet with more rows than the default
    // slots ever shows the control (≤8 rows → it stays the SSR hidden no-op).
    // The {count} template is filled with the DERIVED row count (P3). Wired
    // once; the toggle flips the bay attribute + aria-expanded + label, and
    // focus never leaves the button (never dropped, the exp-chapters rule).
    const extra = flights.length - LOG_VISIBLE_ROWS;
    const moreLabel = (moreBtn.dataset.logMore ?? '').replace('{count}', String(flights.length));
    const fewerLabel = moreBtn.dataset.logFewer ?? '';
    if (extra > 0 && !moreBtn.dataset.logWired) {
      moreBtn.dataset.logWired = '1';
      moreBtn.addEventListener('click', () => {
        const expand = list.hasAttribute('data-log-collapsed');
        if (expand) {
          list.removeAttribute('data-log-collapsed');
          moreBtn.setAttribute('aria-expanded', 'true');
          moreBtn.textContent = fewerLabel;
        } else {
          list.setAttribute('data-log-collapsed', '');
          moreBtn.setAttribute('aria-expanded', 'false');
          moreBtn.textContent = moreLabel;
        }
      });
    }

    // All DOM writes batched in one task (status, rail counters, bay strips,
    // disclosure) — the bay's min-block-size reservation absorbs the default
    // 8-strip render, zero visible shift on the standard approach path.
    list.replaceChildren(...strips);
    if (extra > 0) {
      moreBtn.textContent = moreLabel;
      moreBtn.hidden = false;
    } else {
      moreBtn.hidden = true;
    }
    hoursEl.textContent = hoursText;
    landingsEl.textContent = landingsText;
    // On success the summary rail is THE visual representation of the totals
    // (second pass — a visible status line duplicated it right above the
    // bay). The announce still fires: the text lands in the live region,
    // clip-hidden via the global .alien-sr utility (in the a11y tree, out of
    // the paint). Pending/loading/error keep their visible text.
    status.textContent = summary;
    status.classList.add('alien-sr');
  } catch {
    showUnavailable();
  }
};
