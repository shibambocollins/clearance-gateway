// Admin endpoints for the demo (x-admin-code). Outages are the ONLY way to simulate a provider
// failure on public endpoints; no client-supplied header can do it (SPEC §8).
import { Router } from "express";
import { z } from "zod";
import { SEED_POLICY, SEED_POLICY_TEXT } from "@clearance-gateway/core";
import { requireAdmin } from "../adminAuth.js";
import { getDb } from "../db/client.js";
import { clearPolicyCache, getActivePolicy } from "../policy/active.js";
import { clearSimulatedOutages, getProviderStatuses, setSimulatedOutage } from "../providers/health.js";

const outageSchema = z.object({ providerId: z.string().min(1), down: z.boolean() });

export const adminRouter = Router();
adminRouter.use("/api/admin", requireAdmin);

adminRouter.post("/api/admin/outage", async (req, res) => {
  const parsed = outageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", fields: parsed.error.issues.map((i) => i.path.join(".")) });
    return;
  }
  const { policy } = await getActivePolicy();
  if (!policy.providers.some((p) => p.id === parsed.data.providerId)) {
    res.status(404).json({ error: "unknown_provider" });
    return;
  }
  await setSimulatedOutage(parsed.data.providerId, parsed.data.down);
  res.json({ providers: await getProviderStatuses(policy) });
});

/** Restores the seed policy as the active version and clears all outages. */
adminRouter.post("/api/admin/reset", async (_req, res) => {
  await clearSimulatedOutages();
  const db = getDb();
  if (db) {
    const { data: seedRow, error } = await db
      .from("policy_versions")
      .select("id")
      .eq("compiled_by", "seed")
      .order("version", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Could not read policy versions");
    // Archive the current active version first: the unique index allows one active row.
    await db.from("policy_versions").update({ status: "archived" }).eq("status", "active");
    if (seedRow) {
      await db
        .from("policy_versions")
        .update({ status: "active", activated_at: new Date().toISOString() })
        .eq("id", seedRow.id);
    } else {
      const { data: latest } = await db.from("policy_versions").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
      await db.from("policy_versions").insert({
        version: (latest?.version ?? 0) + 1,
        raw_text: SEED_POLICY_TEXT,
        compiled: SEED_POLICY,
        status: "active",
        compiled_by: "seed",
        activated_at: new Date().toISOString(),
      });
    }
  }
  clearPolicyCache();
  const active = await getActivePolicy();
  res.json({ activePolicyVersion: active.version, providers: await getProviderStatuses(active.policy) });
});
