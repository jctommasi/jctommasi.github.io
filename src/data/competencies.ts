/**
 * Competency constellation model (2026-08-08 owner ask — the "04 / SKILL
 * CONSTELLATION" redesign of the Competencies section).
 *
 * The Competencies section is no longer a summary + flat pillar list + a
 * purple-team callout; it is a technical CONSTELLATION — six capability nodes
 * wired by MEANINGFUL connections, so the competencies read as connected parts
 * of one offensive system rather than isolated skills. This module is the DATA
 * + pure helpers for that view (rendering lives in PageBody.astro). It is the
 * "generated from data, not six duplicated markup blocks" source the redesign
 * requires.
 *
 * WHAT IS REAL vs DERIVED (P3 — no fabricated content, "no inventes
 * competencias/claims nuevos"):
 *  - The six nodes are the FIVE existing cv.json.competencies.pillars + the
 *    purpleTeam posture, restructured. Each node's FULL DESCRIPTION is that
 *    exact bilingual {es,en} cv.json field, resolved by the caller via pick()
 *    — so ES/EN parity is carried by the DATA and this view adds ZERO new P8
 *    strings for the descriptions.
 *  - `tagline` is a faithful COMPACT compression of that same pillar, in both
 *    locales (every tool/term in it appears in the source pillar). Kept in this
 *    module (like quizzes.ts / snippets.ts detection notes — component content
 *    that gate:i18n does not walk); both halves are filled by construction.
 *  - `concepts` are language-agnostic technical identifiers (tool + technique
 *    names) and EVERY one traces to cv.json (pillars / purpleTeam / skills) —
 *    the US-003 "terms of art repeat unchanged in both locales" class, like the
 *    research stage codes and the skills `$ ls` paths (OD-3). Nothing here is a
 *    new professional claim.
 *  - `title` is the node's short technical LABEL (Red Team Operations, …),
 *    English in both locales for the same OD-3 reason the skills category titles
 *    are (a technical category name is a language-agnostic identifier); the
 *    control's substantive prose (tagline + description + relation labels) is
 *    fully bilingual, so ES readers get Spanish for everything that is prose.
 *
 * RELATIONS carry real semantic meaning (the owner's brief lists them): each
 * edge says HOW two capabilities feed each other (e.g. vulnerability research
 * weaponized by red team ops). The labels are bilingual {es,en} here and picked
 * by the caller. Not every pair is connected — only the eight relationships the
 * owner specified, so the graph stays legible (never a hairball).
 *
 * LAYOUT (2026-08-09 "04 — Ruta Activa" evolution; supersedes the fractional
 * cx/cy constellation coordinates): the six nodes sit on a STABLE CSS grid —
 * desktop two rows of three (top: Red Team Operations / Vulnerability
 * Research / AI · LLM Security; bottom: Platforms & Internals / Purple Team /
 * AI-Assisted Analysis, the owner's mandated rows), tablet two auto-flow
 * columns, mobile one column. Card heights are content-driven (never rigid),
 * so the decorative SVG connectors can no longer be baked endpoints — they are
 * MEASURED from the real cards at runtime by
 * src/components/competencies-map.ts (ResizeObserver + one rAF batch). This
 * module keeps only the DETERMINISTIC part of the layout: which grid cell each
 * node occupies (COMPETENCY_GRID) and which edge takes the over-the-row route
 * (competencyEdges().route — the brief's explicit "route Red Team ↔ AI/LLM
 * through the space above the row so it never crosses Vulnerability
 * Research"). Green-dominant, violet only on the purple-team node + its edges
 * (the owner's explicit accent call; uses the existing --note-accent violet
 * token, no new hex — P7 owner amendment).
 */

export type CompetencyAccent = 'green' | 'purple';

export type CompetencyNodeId =
  | 'red-team'
  | 'vulnerability-research'
  | 'ai-security'
  | 'ai-assisted-analysis'
  | 'platforms-internals'
  | 'purple-team';

/** A bilingual field, mirroring the i18n Localized shape (kept local so this
 *  module imports nothing from the content/i18n layers). */
export interface LocalizedText {
  es: string;
  en: string;
}

/** Which cv.json.competencies bilingual field supplies a node's full
 *  description. The caller resolves it via pick(locale, …) so this module stays
 *  i18n-free (the research-pipeline.ts precedent). */
export type CompetencySource = { kind: 'pillar'; index: number } | { kind: 'purpleTeam' };

export interface CompetencyNode {
  id: CompetencyNodeId;
  /** Short technical label, English in both locales (OD-3, a category name is a
   *  language-agnostic identifier). Rendered as the node's <h3>. */
  title: string;
  /** Icon.astro glyph name (decorative cue; the title carries the meaning). */
  icon: string;
  accent: CompetencyAccent;
  /** Faithful compact bilingual summary of the source pillar (both halves
   *  filled by construction; every term traces to the source). */
  tagline: LocalizedText;
  /** Language-agnostic technical identifiers; every one traces to cv.json. */
  concepts: readonly string[];
  /** The cv.json bilingual field that is this node's full description. */
  source: CompetencySource;
}

export interface CompetencyRelation {
  source: CompetencyNodeId;
  target: CompetencyNodeId;
  /** How the two capabilities feed each other (bilingual, picked by caller). */
  label: LocalizedText;
}

/** Stable grid cell of a node on the desktop 3×2 map (1-based CSS grid
 *  lines). Tablet/mobile ignore it (auto-flow / single column). */
export interface NodeGridPos {
  col: 1 | 2 | 3;
  row: 1 | 2;
}

/* ------------------------------------------------------------------ */
/* NODES — the six capabilities (the 5 pillars + purpleTeam).          */
/* ------------------------------------------------------------------ */

export const COMPETENCY_NODES: readonly CompetencyNode[] = [
  {
    id: 'red-team',
    title: 'Red Team Operations',
    icon: 'crosshair',
    accent: 'green',
    tagline: {
      en: 'Red team engagements & adversarial simulations — cloud, container, on-prem.',
      es: 'Ejercicios de red team y simulaciones adversarias — cloud, contenedores, on-premise.',
    },
    // Every term below appears in pillar[0] / pillar[1] (cv.json).
    concepts: ['Cloud', 'Containers', 'On-prem', 'Adversary simulation', 'Attack chaining'],
    source: { kind: 'pillar', index: 0 },
  },
  {
    id: 'vulnerability-research',
    title: 'Vulnerability Research',
    icon: 'bug',
    accent: 'green',
    tagline: {
      en: 'Discovery & chaining of complex vulnerabilities and novel attack vectors.',
      es: 'Descubrimiento y encadenamiento de vulnerabilidades y vectores de ataque novedosos.',
    },
    // Traces to pillar[1] + the Offensive Security & Code Analysis skills group.
    concepts: [
      'Vulnerability discovery',
      'Exploit-chain reasoning',
      'Attack chaining',
      'Taint analysis',
      'Third-party dependencies',
      'Source-code analysis',
    ],
    source: { kind: 'pillar', index: 1 },
  },
  {
    id: 'ai-security',
    title: 'AI / LLM Security',
    icon: 'cpu',
    accent: 'green',
    tagline: {
      en: 'Red-teaming enterprise AI — M365 Copilot, RAG pipelines, agentic workflows.',
      es: 'Red-teaming de IA empresarial — M365 Copilot, pipelines RAG y flujos agénticos.',
    },
    // Traces to pillar[3] (the enterprise-AI red-teaming pillar).
    concepts: [
      'Prompt injection',
      'Indirect injection',
      'Context leakage',
      'RAG abuse',
      'Agent manipulation',
      'Connector SSRF',
      'Data exfiltration',
      'Microsoft 365 Copilot',
    ],
    source: { kind: 'pillar', index: 3 },
  },
  {
    id: 'ai-assisted-analysis',
    title: 'AI-Assisted Analysis',
    icon: 'sparkles',
    accent: 'green',
    tagline: {
      en: 'LLM-assisted discovery, static analysis & exploit-chain reasoning.',
      es: 'Descubrimiento asistido por LLM, análisis estático y razonamiento de cadenas de exploits.',
    },
    // Traces verbatim to pillar[2] (the AI-assisted offensive-security pillar).
    concepts: [
      'Ollama',
      'vLLM',
      'Claude API',
      'Joern',
      'CodeQL',
      'Semgrep',
      'LangGraph',
      'Claude Code',
      'OpenCode',
    ],
    source: { kind: 'pillar', index: 2 },
  },
  {
    id: 'platforms-internals',
    title: 'Platforms & Internals',
    icon: 'server',
    accent: 'green',
    tagline: {
      en: 'Linux internals, Windows forensics, containers & cloud under offensive work.',
      es: 'Internals de Linux, forense de Windows, contenedores y cloud al servicio de la ofensiva.',
    },
    // Traces verbatim to pillar[4] (the platforms/internals pillar).
    concepts: [
      'Linux',
      'Windows',
      'SysInternals',
      'WinDBG',
      'Kernel callbacks',
      'Minifilters',
      'Docker',
      'Kubernetes',
      'Proxmox',
      'AWS',
      'Azure',
      'DigitalOcean',
    ],
    source: { kind: 'pillar', index: 4 },
  },
  {
    id: 'purple-team',
    title: 'Purple Team',
    icon: 'shield',
    accent: 'purple',
    tagline: {
      en: 'Offensive findings translated into detection, hunting & remediation.',
      es: 'Hallazgos ofensivos traducidos en detección, hunting y remediación.',
    },
    // Traces to the purpleTeam posture (cv.json.competencies.purpleTeam).
    concepts: [
      'Sysmon',
      'Windows Security events',
      'Splunk SPL',
      'KQL',
      'Sigma',
      'MITRE ATT&CK',
      'Detection engineering',
      'Remediation',
      'Compensating controls',
    ],
    source: { kind: 'purpleTeam' },
  },
];

/* ------------------------------------------------------------------ */
/* RELATIONS — the eight meaningful connections (never fully-connected). */
/* ------------------------------------------------------------------ */

export const COMPETENCY_RELATIONS: readonly CompetencyRelation[] = [
  {
    source: 'red-team',
    target: 'vulnerability-research',
    label: {
      en: 'Weaponizes findings into realistic attack paths',
      es: 'Convierte los hallazgos en rutas de ataque realistas',
    },
  },
  {
    source: 'vulnerability-research',
    target: 'ai-assisted-analysis',
    label: {
      en: 'Automates discovery and exploit-chain reasoning',
      es: 'Automatiza el descubrimiento y el razonamiento de cadenas de exploits',
    },
  },
  {
    source: 'ai-assisted-analysis',
    target: 'ai-security',
    label: {
      en: 'Turns analysis workflows onto AI attack surfaces',
      es: 'Vuelca los flujos de análisis sobre superficies de ataque de IA',
    },
  },
  {
    source: 'red-team',
    target: 'ai-security',
    label: {
      en: 'AI vectors are part of modern adversarial simulations',
      es: 'Los vectores de IA forman parte de las simulaciones adversarias modernas',
    },
  },
  {
    source: 'platforms-internals',
    target: 'red-team',
    label: {
      en: 'Systems knowledge underpins offensive operations',
      es: 'El conocimiento de sistemas sustenta las operaciones ofensivas',
    },
  },
  {
    source: 'platforms-internals',
    target: 'vulnerability-research',
    label: {
      en: 'Internals enable behavior, persistence & exploitation research',
      es: 'Los internals permiten investigar comportamiento, persistencia y explotación',
    },
  },
  {
    source: 'purple-team',
    target: 'red-team',
    label: {
      en: 'Converts adversarial behavior into detection & telemetry',
      es: 'Convierte el comportamiento adversario en detección y telemetría',
    },
  },
  {
    source: 'purple-team',
    target: 'vulnerability-research',
    label: {
      en: 'Turns findings into rules, mitigations & controls',
      es: 'Traduce los hallazgos en reglas, mitigaciones y controles',
    },
  },
];

/* ------------------------------------------------------------------ */
/* LAYOUT — deterministic grid cells (never random; see header).        */
/* ------------------------------------------------------------------ */

/**
 * The owner's mandated desktop rows (Ruta Activa brief): top = Red Team
 * Operations / Vulnerability Research / AI · LLM Security, bottom = Platforms
 * & Internals / Purple Team / AI-Assisted Analysis. Red Team (the four-edge
 * hub) sits top-left with three of its neighbours adjacent; its fourth edge
 * (AI/LLM Security, same row, one card between) takes the over-the-row route
 * — see competencyEdges().
 */
export const COMPETENCY_GRID: Record<CompetencyNodeId, NodeGridPos> = {
  'red-team': { col: 1, row: 1 },
  'vulnerability-research': { col: 2, row: 1 },
  'ai-security': { col: 3, row: 1 },
  'platforms-internals': { col: 1, row: 2 },
  'purple-team': { col: 2, row: 2 },
  'ai-assisted-analysis': { col: 3, row: 2 },
};

/** The node served [open] from SSR — the initial "example focus" (the
 *  reference active state: double contour, its routes lit, the unrelated
 *  remainder softly dimmed). The brief's illustration used red-team; the
 *  owner moved the default selection to vulnerability-research (call
 *  2026-08-09). Native <details name> exclusivity takes over from the first
 *  user interaction; no JS involved. */
export const COMPETENCY_INITIAL_FOCUS: CompetencyNodeId = 'vulnerability-research';

/* ------------------------------------------------------------------ */
/* Pure helpers.                                                        */
/* ------------------------------------------------------------------ */

/** Undirected edges for the SVG. `accent` is 'purple' when either endpoint is
 *  the purple-team node (so its lines take the violet accent), else 'green'.
 *  `route` is the ONE presentation hint the measured connector layer honours:
 *  'top' arches the edge through the headroom above the row (applied only when
 *  the two cards actually share a row — on the stacked tablet/mobile flows the
 *  same edge falls back to a straight segment). The brief mandates it for
 *  Red Team Operations ↔ AI / LLM Security, whose straight run would otherwise
 *  pass behind Vulnerability Research on the 3-column map. */
export function competencyEdges(): {
  a: CompetencyNodeId;
  b: CompetencyNodeId;
  accent: CompetencyAccent;
  route: 'top' | 'direct';
}[] {
  const isTop = (r: CompetencyRelation) =>
    (r.source === 'red-team' && r.target === 'ai-security') ||
    (r.source === 'ai-security' && r.target === 'red-team');
  return COMPETENCY_RELATIONS.map((r) => ({
    a: r.source,
    b: r.target,
    accent: r.source === 'purple-team' || r.target === 'purple-team' ? 'purple' : 'green',
    route: isTop(r) ? 'top' : 'direct',
  }));
}

/** The relations incident to `id`, with the OTHER endpoint id (for rendering a
 *  node's "connects to" list). Direction is irrelevant — the graph is
 *  undirected. */
export function relationsForNode(
  id: CompetencyNodeId,
): { otherId: CompetencyNodeId; label: LocalizedText }[] {
  return COMPETENCY_RELATIONS.filter((r) => r.source === id || r.target === id).map((r) => ({
    otherId: r.source === id ? r.target : r.source,
    label: r.label,
  }));
}

/** The neighbour ids of `id` (nodes it shares an edge with). */
export function neighborIds(id: CompetencyNodeId): CompetencyNodeId[] {
  return relationsForNode(id).map((r) => r.otherId);
}

/**
 * Generate the constellation's interactive-highlight CSS from the relations
 * data — the ONE state machine that, when a node is hovered / keyboard-focused
 * (:focus-within) / opened ([open]), intensifies ONLY its incident edges and
 * softly dims everything unrelated. Pure CSS via :has() (already used elsewhere
 * in the codebase) — no JavaScript. Every selector is prefixed with the unique
 * `.cxn` root so the injected (is:global) rules cannot leak to other sections.
 *
 * Data-driven: adding/removing a relation here re-generates the correct dim/
 * highlight sets automatically — the visual highlight can never disagree with
 * the rendered edges/relations. The easing of these state changes is gated on
 * `data-motion='full'` in the scoped styles (this returns the instant state
 * only, so the reduced-motion path gets instant colour/opacity changes — P5).
 */
export function buildConstellationCss(): string {
  // ACTIVE = hover / KEYBOARD focus / open — :focus-visible, NOT
  // :focus-within (the Ruta Activa brief names focus-visible): a mouse click
  // on a summary leaves focus behind, and with :focus-within that residual
  // focus pinned the dim on the whole map after simply CLOSING a node.
  // Keyboard focus (and post-keyboard programmatic focus) still activates.
  // GOTCHA: these strings are consumed as :has() arguments, and :has() may
  // not NEST inside :has() (the whole selector list would be dropped as
  // invalid) — so the focus term is the DESCENDANT form
  // `.cxn__node … :focus-visible`, never `.cxn__node:has(:focus-visible)`.
  const anyActive = '.cxn__node:hover, .cxn__node :focus-visible, .cxn__node[open]';
  const active = (id: CompetencyNodeId) =>
    `.cxn__node[data-node="${id}"]:hover, .cxn__node[data-node="${id}"] :focus-visible, .cxn__node[data-node="${id}"][open]`;

  const rules: string[] = [
    // When ANY node is active, dim every node + every edge; the per-node rules
    // below (higher specificity) then re-light the active node, its neighbours
    // and its incident edges.
    `.cxn:has(${anyActive}) .cxn__node{opacity:var(--cxn-dim-node)}`,
    `.cxn:has(${anyActive}) .cxn__edge{opacity:var(--cxn-dim-edge)}`,
  ];

  for (const node of COMPETENCY_NODES) {
    const a = active(node.id);
    const keep = [node.id, ...neighborIds(node.id)];
    // Re-light the active node + its neighbours.
    const nodeSel = keep.map((id) => `.cxn:has(${a}) .cxn__node[data-node="${id}"]`).join(',');
    rules.push(`${nodeSel}{opacity:1}`);
    // Intensify the active node's incident edges. The edge is a <g> (path +
    // the two endpoint dots): stroke/stroke-width inherit to the path, the
    // custom props relight/enlarge the dots (fill:var(--edge-dot,…) /
    // r:var(--edge-dot-r,…) in the scoped styles), and the drop-shadow on the
    // group is the ONLY glow the routes carry (brief: glow limited to the
    // active node, endpoints and highlighted routes). --edge-hi/--edge-glow
    // are per-accent, so purple-team edges light violet and the rest green.
    rules.push(
      `.cxn:has(${a}) .cxn__edge[data-a="${node.id}"],` +
        `.cxn:has(${a}) .cxn__edge[data-b="${node.id}"]` +
        `{opacity:1;stroke:var(--edge-hi);stroke-width:var(--cxn-edge-w-hi);` +
        `--edge-dot:var(--edge-hi);--edge-dot-r:3.1px;` +
        `filter:drop-shadow(0 0 3px var(--edge-glow))}`,
    );
  }

  return rules.join('\n');
}
