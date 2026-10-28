// Clearance Gateway Engine. Pure TypeScript with no I/O, shared by the API, Bench and Lens.

export const CORE_VERSION = "0.3.0";

export interface CoreInfo {
  name: "Clearance Gateway Engine";
  version: string;
}

export function coreInfo(): CoreInfo {
  return { name: "Clearance Gateway Engine", version: CORE_VERSION };
}

export { DATA_CLASS_IDS, type Confidence, type DataClassId, type DetectContext, type Finding, type TermEntry } from "./types.js";
export { canonicalise, toOriginalSpan, type Canonical, type TextView } from "./canonicalise.js";
export { luhnCheckDigit, luhnValid } from "./luhn.js";
export { DETECTORS, detect, resolveOverlaps, type Detector } from "./detectors/index.js";
export { isValidSaId } from "./detectors/zaId.js";
export { hasKnownCardPrefix } from "./detectors/card.js";
export {
  ACTIONS,
  LEVELS,
  ROLE_IDS,
  actionRank,
  levelRank,
  policySchema,
  type Action,
  type CompiledPolicy,
  type Level,
  type PolicyRule,
  type ProviderConfig,
  type RoleId,
  type Tier,
} from "./policy/schema.js";
export { SEED_POLICY, SEED_POLICY_TEXT } from "./policy/seed.js";
export { decideAction, decideFindings, requestLevel, strictestAction, type FindingDecision } from "./decide.js";
export {
  ROUTE_RULE_ID,
  route,
  type BlockReason,
  type Candidate,
  type CandidateStatus,
  type Decision,
  type ProviderHealth,
} from "./route.js";
export { transform, type Replacement, type TransformResult } from "./transform.js";
export { explain, type ExplainOptions } from "./explain.js";
export { check, type CheckOptions, type CheckResult } from "./check.js";
export { SAMPLE_PROMPTS, type SamplePrompt } from "./samples.js";
