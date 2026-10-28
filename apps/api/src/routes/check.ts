// POST /api/check: findings (masked), decision and the transformed preview. No LLM call.
// Used for live highlighting in the web app and by the Lens extension.
import { Router } from "express";
import { z } from "zod";
import { ROLE_IDS, check } from "@clearance-gateway/core";
import { getActivePolicy } from "../policy/active.js";

const MAX_TEXT_CHARS = 12_000;

const bodySchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_CHARS),
  role: z.enum(ROLE_IDS).default("general"),
});

export const checkRouter = Router();

checkRouter.post("/api/check", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    // Report which fields are wrong, never their values.
    res.status(400).json({ error: "invalid_request", fields: parsed.error.issues.map((i) => i.path.join(".")) });
    return;
  }
  const { text, role } = parsed.data;
  const active = await getActivePolicy();
  const { findings, decision, transformed, explanation } = check(text, { policy: active.policy, role });

  res.json({
    policy: { version: active.version, source: active.source, degraded: active.degraded },
    role,
    level: decision.level,
    action: decision.action,
    blockReason: decision.blockReason,
    provider: decision.provider
      ? { id: decision.provider.id, label: decision.provider.label, tier: decision.provider.tier }
      : null,
    ruleIds: decision.ruleIds,
    findings: decision.perFinding.map(({ finding, action, ruleId }) => ({
      dataClass: finding.dataClass,
      detectorId: finding.detectorId,
      confidence: finding.confidence,
      start: finding.start,
      end: finding.end,
      masked: finding.masked,
      action,
      ruleId,
    })),
    detectedCount: findings.length,
    // The token map stays server-side; the client only sees placeholders.
    transformed: transformed?.text ?? null,
    explanation,
    candidates: decision.candidates,
  });
});
