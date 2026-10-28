// POST /api/chat: the full pipeline. check (detect → route → transform) → provider call →
// output guard → restore tokens → explain → audit (metadata only).
// If the chosen provider fails, it is marked unhealthy for this request and the request is routed
// AGAIN through the same policy, so a failure can never push data to a provider the policy forbids.
import { Router } from "express";
import { z } from "zod";
import {
  ROLE_IDS,
  check,
  explain,
  explainGuard,
  guardOutput,
  type CheckResult,
  type ProviderHealth,
} from "@clearance-gateway/core";
import { recordAudit } from "../audit.js";
import { getConfig } from "../config.js";
import { getActivePolicy } from "../policy/active.js";
import { ProviderError, SYSTEM_PROMPT_FRAGMENTS, resolveAdapter } from "../providers/adapters.js";
import { getProviderHealth, recordFailure, recordSuccess } from "../providers/health.js";
import { consumeQuota } from "../rateLimit.js";

const PROVIDER_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 45_000;

const bodySchema = z.object({
  text: z.string().min(1).max(12_000),
  role: z.enum(ROLE_IDS).default("general"),
  channel: z.enum(["web", "extension", "api"]).default("api"),
});

export const chatRouter = Router();

chatRouter.post("/api/chat", async (req, res) => {
  const started = Date.now();
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", fields: parsed.error.issues.map((i) => i.path.join(".")) });
    return;
  }
  const { text, role, channel } = parsed.data;
  const offlineMode = getConfig().offlineMode;

  const [active, quota] = await Promise.all([getActivePolicy(), consumeQuota(req)]);
  const { policy } = active;
  let health: ProviderHealth = await getProviderHealth(policy);

  const failed: string[] = [];
  let result: CheckResult = check(text, { policy, role, health });
  let reply: string | null = null;
  let usedMock = false;

  // Each attempt excludes the providers that failed before it; route() still applies the policy.
  while (result.decision.provider && result.transformed) {
    const provider = result.decision.provider;
    const remaining = REQUEST_TIMEOUT_MS - (Date.now() - started);
    if (remaining <= 0) break;
    try {
      const { adapter, mock } = resolveAdapter(provider.id, provider.label, quota.mockReason !== null);
      reply = await adapter.call(result.transformed.text, AbortSignal.timeout(Math.min(PROVIDER_TIMEOUT_MS, remaining)));
      usedMock = mock;
      recordSuccess(provider.id);
      break;
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error";
      console.error(`Provider ${provider.id} failed: ${kind}${err instanceof ProviderError && err.status ? ` ${err.status}` : ""}`);
      recordFailure(provider.id);
      failed.push(provider.label);
      health = { ...health, [provider.id]: false };
      result = check(text, { policy, role, health });
    }
  }

  const { decision, transformed } = result;
  let explanation = explain(decision, policy, { role });
  let outcome: "sent" | "blocked" | "error" = decision.action === "block" ? "blocked" : "sent";

  if (reply !== null && transformed) {
    const guard = guardOutput(reply, {
      policy,
      prompt: text,
      tokens: transformed.tokens,
      systemPromptFragments: SYSTEM_PROMPT_FRAGMENTS,
    });
    reply = guard.text;
    explanation = [
      ...explain(decision, policy, { role, tokensRestored: guard.unrestored === 0 }),
      ...explainGuard(guard),
    ];
  } else if (decision.action !== "block") {
    // Every eligible provider failed or the request ran out of time: nothing was answered.
    outcome = "error";
    explanation = ["No approved provider answered in time. Nothing was shown, and you can try again."];
  }

  if (failed.length > 0) explanation.unshift(`${failed.join(" and ")} did not respond, so the request was routed again under the same policy.`);
  if (quota.mockReason && reply !== null) explanation.push(`${quota.mockReason}: this reply came from the mock provider.`);

  const latencyMs = Date.now() - started;
  await recordAudit({
    channel,
    role,
    policyVersion: active.version,
    dataClasses: result.findings.map((f) => f.dataClass),
    finalAction: decision.action,
    ruleIds: decision.ruleIds,
    provider: outcome === "sent" ? (decision.provider?.id ?? null) : null,
    outcome,
    latencyMs,
  });

  res.json({
    reply,
    explanation,
    outcome,
    sent: outcome === "sent" ? (transformed?.text ?? null) : null,
    decision: {
      action: decision.action,
      level: decision.level,
      blockReason: decision.blockReason,
      ruleIds: decision.ruleIds,
      findings: decision.perFinding.map(({ finding, action, ruleId }) => ({
        dataClass: finding.dataClass,
        masked: finding.masked,
        start: finding.start,
        end: finding.end,
        action,
        ruleId,
      })),
      candidates: decision.candidates,
    },
    provider:
      outcome === "sent" && decision.provider
        ? { id: decision.provider.id, label: decision.provider.label, tier: decision.provider.tier, mock: usedMock }
        : null,
    latencyMs,
    offlineMode,
    mockReason: quota.mockReason,
    policy: { version: active.version, source: active.source, degraded: active.degraded },
  });
});
