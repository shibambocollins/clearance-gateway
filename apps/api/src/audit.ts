// Audit events: metadata only. There is deliberately no field that could hold prompt or reply
// text (CLAUDE.md rule 3).
import type { Action, DataClassId, RoleId } from "@clearance-gateway/core";
import { getDb } from "./db/client.js";

export interface AuditEvent {
  channel: "web" | "extension" | "api" | "eval";
  role: RoleId;
  policyVersion: number | null;
  dataClasses: DataClassId[];
  finalAction: Action;
  ruleIds: string[];
  provider: string | null;
  outcome: "sent" | "blocked" | "error";
  latencyMs: number;
}

const AUDIT_TIMEOUT_MS = 2_000;

export async function recordAudit(event: AuditEvent): Promise<void> {
  const db = getDb();
  if (!db) return;
  const insert = db.from("audit_events").insert({
    channel: event.channel,
    role: event.role,
    policy_version: event.policyVersion,
    data_classes: [...new Set(event.dataClasses)],
    final_action: event.finalAction,
    rule_ids: event.ruleIds,
    provider: event.provider,
    outcome: event.outcome,
    latency_ms: Math.round(event.latencyMs),
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), AUDIT_TIMEOUT_MS));
  const result = await Promise.race([insert, timeout]);
  if (!result || result.error) console.error("Audit insert failed or timed out");
}
