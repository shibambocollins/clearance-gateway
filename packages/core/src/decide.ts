// Decide (SPEC §8): the action for each finding, for a given role and provider tier.
import { actionRank, levelRank, type Action, type CompiledPolicy, type Level, type RoleId, type Tier } from "./policy/schema.js";
import type { DataClassId, Finding } from "./types.js";

export interface FindingDecision {
  finding: Finding;
  action: Action;
  /** The rule that produced the action, or null when the data class default applied. */
  ruleId: string | null;
}

/** Strictest action among the rules matching (dataClass, role, tier); the class default if none match. */
export function decideAction(
  policy: CompiledPolicy,
  dataClass: DataClassId,
  role: RoleId,
  tier: Tier,
): { action: Action; ruleId: string | null } {
  let best: { action: Action; ruleId: string | null } | null = null;
  for (const rule of policy.rules) {
    const { dataClasses, roles, providerTiers } = rule.match;
    if (!dataClasses.includes(dataClass)) continue;
    if (roles && !roles.includes(role)) continue;
    if (providerTiers && !providerTiers.includes(tier)) continue;
    if (!best || actionRank(rule.action) > actionRank(best.action)) best = { action: rule.action, ruleId: rule.id };
  }
  if (best) return best;
  // The schema guarantees every class has a default; "block" is the fail-closed fallback regardless.
  const fallback = policy.dataClasses.find((d) => d.id === dataClass)?.defaultAction ?? "block";
  return { action: fallback, ruleId: null };
}

export function decideFindings(policy: CompiledPolicy, findings: Finding[], role: RoleId, tier: Tier): FindingDecision[] {
  return findings.map((finding) => ({ finding, ...decideAction(policy, finding.dataClass, role, tier) }));
}

/**
 * Sensitivity of a request: the highest level among findings in the ORIGINAL prompt. Deliberately
 * conservative: routing does not assume redaction or tokenisation caught everything.
 */
export function requestLevel(policy: CompiledPolicy, findings: Finding[]): Level {
  let level: Level = "public";
  for (const f of findings) {
    const classLevel = policy.dataClasses.find((d) => d.id === f.dataClass)?.level ?? "restricted";
    if (levelRank(classLevel) > levelRank(level)) level = classLevel;
  }
  return level;
}

export function strictestAction(actions: Action[]): Action {
  return actions.reduce<Action>((a, b) => (actionRank(b) > actionRank(a) ? b : a), "allow");
}
