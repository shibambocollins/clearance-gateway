// Router (SPEC §8): the first provider in policy order that is enabled, healthy and allowed for
// this data. If none is eligible the request is blocked (fail closed). There is no "try the next
// provider anyway" path.
import { decideFindings, requestLevel, strictestAction, type FindingDecision } from "./decide.js";
import { levelRank, type Action, type CompiledPolicy, type Level, type ProviderConfig, type RoleId } from "./policy/schema.js";
import type { Finding } from "./types.js";

export const ROUTE_RULE_ID = "R-ROUTE-01";

/** Runtime health per provider id. Missing means healthy; false means unhealthy (or a simulated outage). */
export type ProviderHealth = Record<string, boolean>;

export type CandidateStatus = "eligible" | "disabled" | "unhealthy" | "blocked_by_rule" | "level_too_high";

export interface Candidate {
  providerId: string;
  label: string;
  tier: number;
  status: CandidateStatus;
  /** For blocked_by_rule: the rules that blocked a finding for this provider. */
  ruleIds?: string[];
}

export type BlockReason = "BLOCKED_BY_RULE" | "NO_ELIGIBLE_PROVIDER";

export interface Decision {
  /** Final action: block, or the strictest transformation applied before sending. */
  action: Action;
  provider: ProviderConfig | null;
  level: Level;
  perFinding: FindingDecision[];
  ruleIds: string[];
  blockReason: BlockReason | null;
  /** Providers considered, in routing order, up to and including the chosen one. */
  candidates: Candidate[];
}

const unique = (ids: (string | null)[]) => [...new Set(ids.filter((id): id is string => id !== null))];

export function route(policy: CompiledPolicy, findings: Finding[], role: RoleId, health: ProviderHealth = {}): Decision {
  const level = requestLevel(policy, findings);
  const candidates: Candidate[] = [];
  const ordered = policy.routing.order
    .map((id) => policy.providers.find((p) => p.id === id))
    .filter((p): p is ProviderConfig => p !== undefined);

  for (const provider of ordered) {
    const base = { providerId: provider.id, label: provider.label, tier: provider.tier };
    if (!provider.enabled) {
      candidates.push({ ...base, status: "disabled" });
      continue;
    }
    if (health[provider.id] === false) {
      candidates.push({ ...base, status: "unhealthy" });
      continue;
    }
    const perFinding = decideFindings(policy, findings, role, provider.tier);
    const blocking = perFinding.filter((d) => d.action === "block");
    if (blocking.length > 0) {
      candidates.push({ ...base, status: "blocked_by_rule", ruleIds: unique(blocking.map((d) => d.ruleId)) });
      continue;
    }
    if (levelRank(level) > levelRank(provider.maxLevel)) {
      candidates.push({ ...base, status: "level_too_high" });
      continue;
    }
    candidates.push({ ...base, status: "eligible" });
    return {
      action: strictestAction(perFinding.map((d) => d.action)),
      provider,
      level,
      perFinding,
      ruleIds: unique(perFinding.map((d) => d.ruleId)),
      blockReason: null,
      candidates,
    };
  }

  // Fail closed. Report the decisions for the first enabled provider, so the user sees which
  // rules apply. If the content is blocked by rule for EVERY enabled provider (whatever their
  // health), the content is the reason; otherwise availability is the reason.
  const enabled = ordered.filter((p) => p.enabled);
  const reference = enabled[0];
  const perFinding = reference
    ? decideFindings(policy, findings, role, reference.tier)
    : findings.map((finding) => ({ finding, action: "block" as const, ruleId: null }));
  const blockedEverywhere =
    enabled.length > 0 &&
    enabled.every((p) => decideFindings(policy, findings, role, p.tier).some((d) => d.action === "block"));

  return {
    action: "block",
    provider: null,
    level,
    perFinding,
    ruleIds: blockedEverywhere
      ? unique(perFinding.filter((d) => d.action === "block").map((d) => d.ruleId))
      : [ROUTE_RULE_ID],
    blockReason: blockedEverywhere ? "BLOCKED_BY_RULE" : "NO_ELIGIBLE_PROVIDER",
    candidates,
  };
}
