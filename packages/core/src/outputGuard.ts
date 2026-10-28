// Output guard (SPEC §9): scan the provider's reply before the user sees it.
// 1. Remove canary strings and system-prompt fragments (prompt-injection leakage).
// 2. Redact sensitive data above "public" that was NOT in the user's own prompt.
// 3. Restore placeholders tolerantly ([SA_ID_1], SA_ID_1, [ SA_ID_1 ]) and count any left over.
import { detect } from "./detectors/index.js";
import { levelRank, type CompiledPolicy } from "./policy/schema.js";
import { valueKey } from "./transform.js";
import { DATA_CLASS_IDS, type Finding } from "./types.js";

export interface GuardOptions {
  policy: CompiledPolicy;
  /** The user's ORIGINAL prompt: data the user supplied themselves is not redacted from the reply. */
  prompt: string;
  /** placeholder → original value, from transform(). */
  tokens: Record<string, string>;
  /** Fragments of the system prompt that must never be echoed back. */
  systemPromptFragments?: string[];
  /** Canary strings planted for the evaluation suite. */
  canaries?: string[];
}

export interface GuardResult {
  text: string;
  /** Findings removed from the reply (masked previews only). */
  redacted: Finding[];
  restored: number;
  unrestored: number;
  leaks: { canary: number; systemPrompt: number };
}

const CLASS_ALTERNATION = DATA_CLASS_IDS.join("|");
const ANY_PLACEHOLDER = new RegExp(`\\[\\s*(?:${CLASS_ALTERNATION})[ _]\\d+\\s*\\]|(?<![A-Za-z0-9_])(?:${CLASS_ALTERNATION})_\\d+(?!\\d)`, "g");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeAll(text: string, needles: string[]): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const needle of needles) {
    if (needle.trim().length === 0) continue;
    const re = new RegExp(escapeRegExp(needle), "gi");
    out = out.replace(re, () => {
      count++;
      return "[REDACTED:LEAK]";
    });
  }
  return { text: out, count };
}

export function guardOutput(reply: string, options: GuardOptions): GuardResult {
  const { policy, prompt, tokens } = options;

  const canary = removeAll(reply, options.canaries ?? []);
  const system = removeAll(canary.text, options.systemPromptFragments ?? []);
  let text = system.text;

  // Values the user supplied may come back (e.g. HR's own allowed email); anything new above public may not.
  const promptValues = new Set(
    detect(prompt, { terms: policy.terms }).map((f) => valueKey(f.dataClass, prompt.slice(f.start, f.end))),
  );
  const redacted = detect(text, { terms: policy.terms }).filter((f) => {
    const level = policy.dataClasses.find((d) => d.id === f.dataClass)?.level ?? "restricted";
    return levelRank(level) > levelRank("public") && !promptValues.has(valueKey(f.dataClass, text.slice(f.start, f.end)));
  });
  for (const f of [...redacted].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, f.start) + `[REDACTED:${f.dataClass}]` + text.slice(f.end);
  }

  // Restore tokens. Placeholder "[CLIENT_NAME_1]" also matches "CLIENT_NAME_1" and "[ CLIENT_NAME 1 ]".
  let restored = 0;
  for (const [placeholder, original] of Object.entries(tokens)) {
    const match = /^\[([A-Z_]+)_(\d+)\]$/.exec(placeholder);
    if (!match) continue;
    const [, cls, n] = match;
    const re = new RegExp(`\\[\\s*${cls}[ _]${n}\\s*\\]|(?<![A-Za-z0-9_])${cls}_${n}(?!\\d)`, "g");
    text = text.replace(re, () => {
      restored++;
      return original;
    });
  }
  const unrestored = (text.match(ANY_PLACEHOLDER) ?? []).length;

  return { text, redacted, restored, unrestored, leaks: { canary: canary.count, systemPrompt: system.count } };
}
