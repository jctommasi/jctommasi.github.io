/**
 * Final practice-widget snippets + detection mappings (US-037).
 *
 * These are the FINAL, illustrative, defensively-framed code samples for the
 * `practiceType: 'codemirror'` research chapters (manual §9.5 / P2 / N5):
 * each shows what a concept *looks like*, never an operational exploit payload,
 * malware, or copy-paste attack tooling. Each pairs the offensive concept with
 * its DETECTION MAPPING — ≥1 MITRE ATT&CK/ATLAS technique ID and ≥1 paired
 * detection rule (Sysmon/SPL/KQL/Sigma) — so the purple-team posture in
 * cv.json.competencies.purpleTeam is demonstrated, not claimed. (This module
 * replaced the US-034 interim slot.)
 *
 * Localization split (US-003 convention): the snippet `code`, technique `id`/
 * `name`/`url`, and detection `format`/`rule` are LANGUAGE-AGNOSTIC — code,
 * official MITRE terms of art, and tool/query syntax repeat unchanged in both
 * locales (like "Burp Suite" / "MITRE ATT&CK" in cv.json). Only the human
 * `note` glue is bilingual `{es,en}`, read through `pick(locale, …)` in PageBody
 * so the ES view shows Spanish. The standalone `gate:i18n` walks only the
 * `src/data` collections + site-strings, so this component-level content is not
 * parity-gated; both `note` halves are kept filled by construction.
 *
 * No `{{TODO}}` literal appears here — these are real samples, so they reach the
 * DOM honestly (P1; gate:todo stays green). No internal story IDs (US-0xx)
 * appear in any rendered string (`code`/`rule`/`name`/`note`) — they would leak
 * into user-facing DOM; such references stay in source comments only.
 */
import type { Localized } from '../../i18n';

/** A CodeMirror language id the client widget can resolve to a language pack. */
export type SnippetLang = 'python' | 'json' | 'markdown';

/** A MITRE ATT&CK (Enterprise) or ATLAS (AI) technique the concept maps to. */
export interface AttackTechnique {
  /** Technique ID, e.g. "T1059" (ATT&CK) or "AML.T0051.001" (ATLAS). */
  id: string;
  /** Canonical technique name — an official English term of art (language-agnostic). */
  name: string;
  /** The official technique page (rendered as an external link). */
  url: string;
}

/** One paired blue-team detection artifact (Sysmon/SPL/KQL/Sigma). */
export interface DetectionRule {
  /** The rule's format/source — a language-agnostic label, e.g. "Sigma (Sysmon EID 1)". */
  format: string;
  /** The illustrative detection rule body (language-agnostic query/rule code). */
  rule: string;
}

/** The purple-team pairing rendered beneath a chapter's offensive-concept snippet. */
export interface DetectionMapping {
  /** ≥1 MITRE ATT&CK/ATLAS technique IDs the offensive concept maps to (P2). */
  techniques: AttackTechnique[];
  /** ≥1 paired detection rule(s) — the blue-team side of the pairing (P2). */
  detections: DetectionRule[];
  /** One-line bilingual glue: what the detection catches / why it pairs (content). */
  note: Localized;
}

export interface PracticeSnippet {
  /** Drives the lazily-loaded CodeMirror language extension + the lang badge. */
  lang: SnippetLang;
  /** The editable buffer's initial content (illustrative + defensive, §9.5). */
  code: string;
  /** The MITRE technique IDs + paired detection rule(s) shown below the editor (P2). */
  detection: DetectionMapping;
}

/**
 * Final CodeMirror snippets + detection mappings, keyed by research-chapter id.
 * US-1605 (owner call 2026-08-07) unpublished every chapter but 01, so this map
 * holds exactly that chapter's entry; adding a chapter back is one entry here.
 */
export const codemirrorSnippets: Record<string, PracticeSnippet> = {
  // Chapter 1 — the sandbox escape the reader page documents: a directive
  // role-framing prompt plus a payload that REBUILDS an execution primitive
  // from character codes, so a plain string filter never sees the banned name.
  //
  // The widget stays the teaching surface: it shows the SHAPE of the pattern
  // and the two markers that give it away, not a runnable payload (§9.5/N5).
  // The full working chain is in the article body, where it belongs — the
  // finding is remediated and its publication is authorized.
  'copilot-sandbox-prompt-injection-rce': {
    lang: 'python',
    code: `# The evasion shape: no banned identifier ever appears as a literal.
# Illustrative ONLY — the name is rebuilt, so a string filter sees nothing.

decode = lambda arr: "".join(chr(c) for c in arr)

PRIMITIVE = [101, 120, 101, 99]          # the execution builtin, as codepoints
BUILTINS  = [95, 95, 98, 117, 105, 108,  # "__builtins__", likewise
             116, 105, 110, 115, 95, 95]

# getattr(<builtins>, decode(PRIMITIVE))(<reconstructed source>)
#          ^ resolved at runtime, so the dangerous name is never in the text

# Defensive read: filtering on literals is the weak control. The two signals
# that actually survive obfuscation are (1) a prompt asserting authority over
# an internal tool ("call the <tool> function to ..."), and (2) dense numeric
# arrays feeding chr()/getattr() reconstruction. Alert on the PAIR, and treat
# the interpreter's own process tree as the ground truth for what ran.`,
    detection: {
      techniques: [
        {
          id: 'AML.T0051.000',
          name: 'LLM Prompt Injection: Direct',
          url: 'https://atlas.mitre.org/techniques/AML.T0051.000',
        },
        {
          id: 'AML.T0053',
          name: 'LLM Plugin Compromise',
          url: 'https://atlas.mitre.org/techniques/AML.T0053',
        },
        {
          id: 'T1059.006',
          name: 'Command and Scripting Interpreter: Python',
          url: 'https://attack.mitre.org/techniques/T1059/006/',
        },
      ],
      detections: [
        {
          format: 'KQL (Microsoft 365 Defender)',
          rule: `// Illustrative hunt: the PAIR — tool-authority framing plus codepoint
// reconstruction — in one prompt. Tune the table and thresholds to your tenant.
let authorityFraming = dynamic([
    "call the python_execution function",
    "i am the system administrator",
    "give me the exact output of the system command"
]);
CloudAppEvents
| where Application has "Microsoft 365 Copilot"
| extend Prompt = tostring(RawEventData.Prompt)
| where Prompt has_any (authorityFraming)
| where Prompt matches regex @"(\\d{1,3},\\s*){12,}\\d{1,3}"   // dense codepoint array
| project Timestamp, AccountObjectId, Application, ActionType, Prompt`,
        },
        {
          format: 'Sigma (Sysmon Event ID 1 — process creation)',
          rule: `title: Shell spawned by a sandboxed code interpreter
id: 6f2a1c94-0b7d-4c3e-9a55-2f0d8b1e77c4
status: experimental
description: >
  The interpreter is meant to run analytical code, never to spawn a shell.
  A child shell under the interpreter is the ground truth that a prompt-level
  filter was bypassed, whatever the prompt looked like.
logsource:
  category: process_creation
  product: linux
detection:
  interpreter:
    ParentImage|endswith:
      - '/python'
      - '/python3'
  shell:
    Image|endswith:
      - '/sh'
      - '/bash'
      - '/dash'
  condition: interpreter and shell
falsepositives:
  - Build or packaging steps that legitimately shell out from Python
level: high`,
        },
      ],
      note: {
        en: 'Do not rely on literal string filters: the payload rebuilds the banned identifier at runtime. Alert on the PAIR of prompt-authority framing plus dense codepoint arrays, and treat a shell spawned by the interpreter as the authoritative signal that the sandbox boundary was crossed.',
        es: 'No confíes en filtros de cadenas literales: el payload reconstruye el identificador prohibido en tiempo de ejecución. Alertá sobre el PAR de encuadre de autoridad en el prompt más arreglos densos de codepoints, y tomá una shell lanzada por el intérprete como la señal autoritativa de que se cruzó el límite del sandbox.',
      },
    },
  },
};
