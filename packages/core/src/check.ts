// The deterministic enforcement pipeline up to the provider call: detect → decide/route →
// transform → explain. No LLM, no I/O. Used by /api/check, /api/chat, the Bench and Lens.
import { detect } from "./detectors/index.js";
import { explain } from "./explain.js";
import type { CompiledPolicy, RoleId } from "./policy/schema.js";
import { route, type Decision, type ProviderHealth } from "./route.js";
import { transform, type TransformResult } from "./transform.js";
import type { Finding } from "./types.js";

export interface CheckOptions {
  policy: CompiledPolicy;
  role: RoleId;
  health?: ProviderHealth;
}

export interface CheckResult {
  findings: Finding[];
  decision: Decision;
  /** What would be sent; null when the request is blocked. */
  transformed: TransformResult | null;
  explanation: string[];
}

export function check(text: string, { policy, role, health }: CheckOptions): CheckResult {
  const findings = detect(text, { terms: policy.terms });
  const decision = route(policy, findings, role, health);
  const transformed = decision.action === "block" ? null : transform(text, decision.perFinding);
  return { findings, decision, transformed, explanation: explain(decision, policy, { role }) };
}
