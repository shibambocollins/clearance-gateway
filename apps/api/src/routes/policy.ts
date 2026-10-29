// Policy lifecycle (SPEC §2, §10): compile → draft → review (decision diff, simulator) → activate.
// Compilation never activates anything.
import { Router } from "express";
import { z } from "zod";
import {
  ROLE_IDS,
  SAMPLE_PROMPTS,
  SEED_POLICY,
  check,
  policyDiff,
  policySchema,
  type CompiledPolicy,
  type RoleId,
} from "@clearance-gateway/core";
import { requireAdmin } from "../adminAuth.js";
import { getConfig } from "../config.js";
import { allowCompile } from "../rateLimit.js";
import { CompilerError, compilePolicy } from "../compiler/compile.js";
import { getDb } from "../db/client.js";
import { clearPolicyCache, getActivePolicy } from "../policy/active.js";

export const policyRouter = Router();

policyRouter.get("/api/policy/active", async (_req, res) => {
  const active = await getActivePolicy();
  res.json({ version: active.version, id: active.id, source: active.source, rawText: active.rawText, compiled: active.policy });
});

policyRouter.get("/api/policy/versions", requireAdmin, async (_req, res) => {
  const db = getDb();
  if (!db) {
    res.json({ versions: [] });
    return;
  }
  const { data, error } = await db
    .from("policy_versions")
    .select("id, version, status, compiled_by, created_at, activated_at, raw_text, compiled")
    .order("version", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not read policy versions");
  res.json({ versions: data });
});

const compileSchema = z.object({ rawText: z.string().trim().min(20).max(8000) });

policyRouter.post("/api/policy/compile", requireAdmin, async (req, res) => {
  const parsed = compileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", fields: ["rawText"] });
    return;
  }
  if (!(await allowCompile(req))) {
    res.status(429).json({ error: "compile_limit_reached" });
    return;
  }
  const active = await getActivePolicy();
  try {
    const { compiled, compiledBy, attempts } = await compilePolicy(parsed.data.rawText, active.policy);
    let saved: { id: string; version: number } | null = null;
    const db = getDb();
    if (db) {
      const { data: latest } = await db.from("policy_versions").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await db
        .from("policy_versions")
        .insert({ version: (latest?.version ?? 0) + 1, raw_text: parsed.data.rawText, compiled, status: "draft", compiled_by: compiledBy })
        .select("id, version")
        .single();
      if (error) throw new Error("Could not save the draft");
      saved = data;
    }
    res.json({
      id: saved?.id ?? null,
      version: saved?.version ?? null,
      status: "draft",
      compiledBy,
      attempts,
      compiled,
      diff: policyDiff(active.policy, compiled),
      activeVersion: active.version,
    });
  } catch (err) {
    if (err instanceof CompilerError) {
      res.status(err.code === "unavailable" ? 503 : 422).json({ error: `compiler_${err.code}`, attempts: err.attempts });
      return;
    }
    throw err;
  }
});

policyRouter.post("/api/policy/:id/activate", requireAdmin, async (req, res) => {
  const db = getDb();
  if (!db) {
    res.status(503).json({ error: "database_required" });
    return;
  }
  const id = String(req.params.id);
  const { data: row, error } = await db.from("policy_versions").select("id, compiled").eq("id", id).maybeSingle();
  if (error || !row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  // Re-validate before it can affect enforcement.
  const candidate = policySchema.safeParse(row.compiled);
  if (!candidate.success) {
    res.status(422).json({ error: "invalid_policy" });
    return;
  }
  // Policy floor: the demo admin code is public, so nobody may activate rules that protect LESS
  // than the baseline (seed) policy. Tightening is always allowed (D-061).
  if (getConfig().policyFloor) {
    const floor = policyDiff(SEED_POLICY, candidate.data);
    if (floor.looserCount > 0) {
      res.status(409).json({ error: "looser_than_floor", looserCount: floor.looserCount });
      return;
    }
  }
  const { data: version, error: rpcError } = await db.rpc("activate_policy", { p_id: id });
  if (rpcError) throw new Error("Activation failed");
  clearPolicyCache();
  res.json({ activePolicyVersion: version });
});

const simulateSchema = z
  .object({
    policyId: z.string().uuid().optional(),
    policy: z.unknown().optional(),
    prompts: z.array(z.string().min(1).max(2000)).max(20).optional(),
    role: z.enum(ROLE_IDS).default("general"),
  })
  .refine((b) => b.policyId || b.policy, { message: "policyId or policy is required" });

/** Active vs candidate decisions for the sample prompts or pasted prompts. Prompts are not echoed. */
policyRouter.post("/api/policy/simulate", requireAdmin, async (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", fields: parsed.error.issues.map((i) => i.path.join(".") || "body") });
    return;
  }
  const body = parsed.data;
  let candidate: CompiledPolicy;
  let candidateVersion: number | null = null;
  if (body.policyId) {
    const db = getDb();
    const { data } = db ? await db.from("policy_versions").select("version, compiled").eq("id", body.policyId).maybeSingle() : { data: null };
    const valid = data ? policySchema.safeParse(data.compiled) : null;
    if (!valid?.success) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    candidate = valid.data;
    candidateVersion = data!.version;
  } else {
    const valid = policySchema.safeParse(body.policy);
    if (!valid.success) {
      res.status(422).json({ error: "invalid_policy" });
      return;
    }
    candidate = valid.data;
  }

  const active = await getActivePolicy();
  const prompts: { label: string; text: string; role: RoleId }[] = body.prompts
    ? body.prompts.map((text, i) => ({ label: `Prompt ${i + 1}`, text, role: body.role }))
    : SAMPLE_PROMPTS.map((s) => ({ label: s.label, text: s.text, role: s.role }));

  const summary = (policy: CompiledPolicy, text: string, role: RoleId) => {
    const { decision } = check(text, { policy, role });
    return {
      action: decision.action,
      provider: decision.provider?.label ?? null,
      level: decision.level,
      ruleIds: decision.ruleIds,
      findings: decision.perFinding.map((d) => ({ dataClass: d.finding.dataClass, masked: d.finding.masked, action: d.action })),
    };
  };

  const rows = prompts.map((p) => {
    const before = summary(active.policy, p.text, p.role);
    const after = summary(candidate, p.text, p.role);
    const changed =
      before.action !== after.action ||
      before.provider !== after.provider ||
      JSON.stringify(before.findings) !== JSON.stringify(after.findings);
    return { label: p.label, role: p.role, active: before, candidate: after, changed };
  });
  res.json({ activeVersion: active.version, candidateVersion, rows, changedCount: rows.filter((r) => r.changed).length });
});
