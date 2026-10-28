// GET /api/providers: tiers and health for the UI. Tiers are demo configuration, not claims about
// any vendor's real data handling.
import { Router } from "express";
import { getConfig } from "../config.js";
import { getActivePolicy } from "../policy/active.js";
import { OUTAGE_TTL_MS, getProviderStatuses } from "../providers/health.js";

export const providersRouter = Router();

providersRouter.get("/api/providers", async (_req, res) => {
  const { policy } = await getActivePolicy();
  res.json({
    offlineMode: getConfig().offlineMode,
    routingOrder: policy.routing.order,
    providers: await getProviderStatuses(policy),
    outageTtlMinutes: OUTAGE_TTL_MS / 60_000,
    note: "Provider tiers are demo configuration, not claims about any vendor's real data handling.",
  });
});
