import { Router } from "express";
import { CORE_VERSION } from "@clearance-gateway/core";
import { getConfig } from "../config.js";
import { getActivePolicy, type PolicySource } from "../policy/active.js";

type DbStatus = "ok" | "unreachable" | "not_configured";

const DB_STATUS: Record<PolicySource, DbStatus> = {
  database: "ok",
  "seed (no active policy)": "ok",
  "seed (database unreachable)": "unreachable",
  "seed (database not configured)": "not_configured",
};

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const active = await getActivePolicy();
  res.json({
    status: "ok",
    service: "Clearance Gateway API",
    coreVersion: CORE_VERSION,
    offlineMode: getConfig().offlineMode,
    db: DB_STATUS[active.source],
    activePolicyVersion: active.version,
    policyUpdatedAt: active.updatedAt,
    policySource: active.source,
    time: new Date().toISOString(),
  });
});
