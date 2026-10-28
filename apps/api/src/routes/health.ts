import { Router } from "express";
import { CORE_VERSION } from "@clearance-gateway/core";
import { getConfig } from "../config.js";
import { getDb } from "../db/client.js";

const DB_CHECK_TIMEOUT_MS = 3000;

type DbStatus = "ok" | "unreachable" | "not_configured";

async function checkDb(): Promise<{ db: DbStatus; activePolicyVersion: number | null }> {
  const db = getDb();
  if (!db) return { db: "not_configured", activePolicyVersion: null };

  const query = db.from("policy_versions").select("version").eq("status", "active").maybeSingle();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), DB_CHECK_TIMEOUT_MS));
  const result = await Promise.race([query, timeout]);

  if (!result || result.error) return { db: "unreachable", activePolicyVersion: null };
  return { db: "ok", activePolicyVersion: result.data?.version ?? null };
}

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const { db, activePolicyVersion } = await checkDb();
  res.json({
    status: "ok",
    service: "Clearance Gateway API",
    coreVersion: CORE_VERSION,
    offlineMode: getConfig().offlineMode,
    db,
    activePolicyVersion,
    time: new Date().toISOString(),
  });
});
