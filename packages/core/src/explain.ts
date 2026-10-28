// Explanations (SPEC §9): plain-English lines telling the employee what happened and why.
import type { FindingDecision } from "./decide.js";
import type { GuardResult } from "./outputGuard.js";
import type { CompiledPolicy, RoleId } from "./policy/schema.js";
import { ROUTE_RULE_ID, type Candidate, type Decision } from "./route.js";
import type { DataClassId } from "./types.js";

const CLASS_LABELS: Record<DataClassId, [singular: string, plural: string]> = {
  SA_ID: ["South African ID number", "South African ID numbers"],
  CARD_NUMBER: ["card number", "card numbers"],
  BANK_ACCOUNT: ["bank account number", "bank account numbers"],
  EMAIL: ["email address", "email addresses"],
  PHONE: ["phone number", "phone numbers"],
  CREDENTIAL: ["password, key or token", "passwords, keys or tokens"],
  CLIENT_NAME: ["client name", "client names"],
  PROJECT_CODENAME: ["project codename", "project codenames"],
};

const ROLE_LABELS: Record<RoleId, string> = {
  general: "general staff",
  hr: "HR staff",
  finance: "finance staff",
  engineering: "engineering staff",
};

export interface ExplainOptions {
  role: RoleId;
  /** Set after the reply came back: whether tokens were restored in it. */
  tokensRestored?: boolean;
}

/** "1 South African ID number", "2 client names and 1 project codename". */
function describeCounts(decisions: FindingDecision[]): string {
  const counts = new Map<DataClassId, number>();
  for (const d of decisions) counts.set(d.finding.dataClass, (counts.get(d.finding.dataClass) ?? 0) + 1);
  const parts = [...counts].map(([dc, n]) => `${n} ${CLASS_LABELS[dc][n === 1 ? 0 : 1]}`);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function ruleText(policy: CompiledPolicy, ruleId: string | null): string {
  if (ruleId === null) return "Default for this type of data.";
  const rule = policy.rules.find((r) => r.id === ruleId);
  return `Rule ${ruleId}: ${rule?.description ?? "see the active policy."}`;
}

/** Groups decisions by (action, ruleId), keeping first-appearance order. */
function groupByRule(decisions: FindingDecision[]): FindingDecision[][] {
  const groups = new Map<string, FindingDecision[]>();
  for (const d of decisions) {
    const key = `${d.action}|${d.ruleId}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.values()];
}

function skippedText(candidate: Candidate, decision: Decision): string {
  switch (candidate.status) {
    case "disabled":
      return `${candidate.label} (disabled)`;
    case "unhealthy":
      return `${candidate.label} (unavailable)`;
    case "level_too_high":
      return `${candidate.label} (not cleared for ${decision.level} data)`;
    case "blocked_by_rule":
      return `${candidate.label} (not allowed by ${candidate.ruleIds?.join(", ")})`;
    default:
      return candidate.label;
  }
}

/** Lines describing what the output guard changed in the reply (empty when nothing changed). */
export function explainGuard(guard: GuardResult): string[] {
  const lines: string[] = [];
  if (guard.leaks.canary + guard.leaks.systemPrompt > 0) {
    lines.push("Removed text from the reply that looked like internal instructions or planted test strings (output guard).");
  }
  if (guard.redacted.length > 0) {
    const counts = describeCounts(guard.redacted.map((finding) => ({ finding, action: "redact", ruleId: null })));
    lines.push(`Removed ${counts} from the reply that were not in your prompt (output guard).`);
  }
  if (guard.unrestored > 0) {
    lines.push(
      `${guard.unrestored} placeholder${guard.unrestored === 1 ? "" : "s"} in the reply could not be restored.`,
    );
  }
  return lines;
}

export function explain(decision: Decision, policy: CompiledPolicy, options: ExplainOptions): string[] {
  const lines: string[] = [];
  const skipped = decision.candidates.filter((c) => c.status !== "eligible");

  if (decision.action === "block") {
    if (decision.blockReason === "BLOCKED_BY_RULE") {
      for (const group of groupByRule(decision.perFinding.filter((d) => d.action === "block"))) {
        const n = group.length;
        const fix = policy.coaching ? ` Remove ${n === 1 ? "it" : "them"} and try again.` : "";
        lines.push(`Blocked: your prompt contains ${describeCounts(group)}. ${ruleText(policy, group[0]!.ruleId)}${fix}`);
      }
    } else {
      lines.push(
        `Blocked: no approved provider is available for ${decision.level} data right now (fail closed, rule ${ROUTE_RULE_ID}).`,
      );
      if (skipped.length > 0) lines.push(`Not used: ${skipped.map((c) => skippedText(c, decision)).join("; ")}.`);
    }
    return lines;
  }

  const provider = decision.provider!;
  const acted = decision.perFinding.filter((d) => d.action !== "allow" || d.ruleId !== null);
  if (decision.perFinding.length === 0) lines.push("No sensitive data found.");

  for (const group of groupByRule(acted)) {
    const { action, ruleId } = group[0]!;
    const what = describeCounts(group);
    if (action === "redact") {
      lines.push(`Removed ${what}. ${ruleText(policy, ruleId)}`);
    } else if (action === "tokenise") {
      const restored =
        options.tokensRestored === undefined
          ? "The originals will be restored in the reply."
          : options.tokensRestored
            ? "The originals were restored in the reply."
            : "Some placeholders could not be restored in the reply.";
      lines.push(`Pseudonymised ${what} before sending to ${provider.label} (rule ${ruleId ?? "default"}). ${restored}`);
    } else if (action === "allow") {
      lines.push(`Allowed ${what} for ${ROLE_LABELS[options.role]} with ${provider.label} (rule ${ruleId}).`);
    }
  }

  const via = skipped.length > 0 ? `; skipped ${skipped.map((c) => skippedText(c, decision)).join("; ")}` : "";
  lines.push(`Sent to ${provider.label} (tier ${provider.tier})${via}.`);
  return lines;
}
