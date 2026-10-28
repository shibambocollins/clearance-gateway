// Credential assignments such as `password=...`, `DB_PASSWORD: "..."` or `"api_key": "..."`.
// Only the value is reported, so a redacted prompt still reads "password=[REDACTED:CREDENTIAL]".
import { maskSecret } from "../mask.js";
import { toOriginalSpan } from "../canonicalise.js";
import type { Finding } from "../types.js";
import type { Detector } from "./scan.js";

const ASSIGNMENT =
  /\b(?:[A-Za-z0-9]+[_.-])*(?:password|passwd|pwd|secret|token|api[_-]?key)["']?\s*([:=])\s*(?:"([^"\n]{4,})"|'([^'\n]{4,})'|([^\s"'`,;]{4,}))/dgi;

// Values that are clearly not real secrets: masks, templates, env lookups, our own redactions.
const PLACEHOLDER =
  /^(?:\*+|•+|x{3,}|\.{3,}|<.*|\$\{[^}]*\}|\$[A-Z_][A-Z0-9_]*|\{\{.*\}\}|\[.*\]|%[A-Z_]+%|null|none|undefined|redacted|true|false|your[_-]?\w*|process\.env\.\w+|os\.environ\S*|env\(.*\))$/i;

export const credAssignDetector: Detector = {
  id: "cred_assign",
  detect(input) {
    const findings: Finding[] = [];
    const view = input.text;
    for (const match of view.text.matchAll(ASSIGNMENT)) {
      const separator = match[1];
      const quoted = match[2] ?? match[3];
      const value = quoted ?? match[4]!;
      const group = match[2] !== undefined ? 2 : match[3] !== undefined ? 3 : 4;
      if (PLACEHOLDER.test(value)) continue;
      // "Token: refreshed hourly" is prose. With an unquoted value after a colon, require a
      // digit or symbol before treating it as a secret. `=` and quoted values are code-like.
      if (quoted === undefined && separator === ":" && !/[^A-Za-z]/.test(value)) continue;
      const [viewStart, viewEnd] = match.indices![group]!;
      findings.push({
        detectorId: "cred_assign",
        dataClass: "CREDENTIAL",
        ...toOriginalSpan(view, viewStart, viewEnd),
        confidence: "high",
        masked: maskSecret(),
      });
    }
    return findings;
  },
};
