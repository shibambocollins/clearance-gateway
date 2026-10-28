// Transform (SPEC §8): redact → [REDACTED:SA_ID], tokenise → [SA_ID_1]. Identical values share a
// placeholder. The token map lives only in request scope: callers must never persist or log it.
import { canonicalise } from "./canonicalise.js";
import type { FindingDecision } from "./decide.js";
import type { DataClassId } from "./types.js";

export interface Replacement {
  start: number;
  end: number;
  dataClass: DataClassId;
  action: "redact" | "tokenise";
  placeholder: string;
}

export interface TransformResult {
  text: string;
  replacements: Replacement[];
  /** placeholder → original value, for restoring tokens in the reply. Request scope only. */
  tokens: Record<string, string>;
}

/** Same value regardless of case, spacing, separators, zero-width or fullwidth characters. */
function valueKey(dataClass: DataClassId, value: string): string {
  return `${dataClass}:${canonicalise(value).text.text.toLowerCase().replace(/[\s\-./()]+/g, "")}`;
}

export function transform(text: string, decisions: FindingDecision[]): TransformResult {
  const active = decisions
    .filter((d) => d.action === "redact" || d.action === "tokenise")
    .sort((a, b) => a.finding.start - b.finding.start);

  // Assign placeholders left to right so numbering follows reading order.
  const counters = new Map<DataClassId, number>();
  const byValue = new Map<string, string>();
  const tokens: Record<string, string> = {};
  const replacements: Replacement[] = active.map(({ finding, action }) => {
    const { start, end, dataClass } = finding;
    let placeholder = `[REDACTED:${dataClass}]`;
    if (action === "tokenise") {
      const original = text.slice(start, end);
      const key = valueKey(dataClass, original);
      const existing = byValue.get(key);
      if (existing) {
        placeholder = existing;
      } else {
        const n = (counters.get(dataClass) ?? 0) + 1;
        counters.set(dataClass, n);
        placeholder = `[${dataClass}_${n}]`;
        byValue.set(key, placeholder);
        tokens[placeholder] = original;
      }
    }
    return { start, end, dataClass, action: action as Replacement["action"], placeholder };
  });

  // Apply from the end backwards so earlier offsets stay valid.
  let out = text;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i]!;
    out = out.slice(0, r.start) + r.placeholder + out.slice(r.end);
  }
  return { text: out, replacements, tokens };
}
