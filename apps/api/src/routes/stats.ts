// GET /api/stats (public): aggregates for the dashboard. GET /api/audit (admin): recent events.
// Both read audit_events, which holds metadata only.
import { Router } from "express";
import { requireAdmin } from "../adminAuth.js";
import { getDb } from "../db/client.js";

const WINDOW_DAYS = 7;
const MAX_ROWS = 5000;
const CACHE_MS = 10_000;

interface AuditRow {
  at: string;
  channel: string | null;
  role: string | null;
  data_classes: string[] | null;
  final_action: string | null;
  provider: string | null;
  outcome: string | null;
  latency_ms: number | null;
}

const tally = (rows: AuditRow[], key: (r: AuditRow) => (string | null)[] | string | null) => {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const value = key(r);
    for (const k of Array.isArray(value) ? value : [value]) if (k) counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
};

let cache: { body: unknown; at: number } | null = null;

export const statsRouter = Router();

statsRouter.get("/api/stats", async (_req, res) => {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    res.json(cache.body);
    return;
  }
  const db = getDb();
  if (!db) {
    res.json({ available: false, windowDays: WINDOW_DAYS });
    return;
  }
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("audit_events")
    .select("at, channel, role, data_classes, final_action, provider, outcome, latency_ms")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) {
    res.json({ available: false, windowDays: WINDOW_DAYS });
    return;
  }
  const rows = (data ?? []) as AuditRow[];
  const sentLatencies = rows.filter((r) => r.outcome === "sent" && r.latency_ms !== null).map((r) => r.latency_ms!).sort((a, b) => a - b);
  const body = {
    available: true,
    windowDays: WINDOW_DAYS,
    total: rows.length,
    withSensitiveData: rows.filter((r) => (r.data_classes?.length ?? 0) > 0).length,
    byOutcome: tally(rows, (r) => r.outcome),
    byAction: tally(rows, (r) => r.final_action),
    byDataClass: tally(rows, (r) => r.data_classes),
    byProvider: tally(rows.filter((r) => r.outcome === "sent"), (r) => r.provider),
    byChannel: tally(rows, (r) => r.channel),
    byRole: tally(rows, (r) => r.role),
    medianLatencyMs: sentLatencies.length ? sentLatencies[Math.floor(sentLatencies.length / 2)] : null,
  };
  cache = { body, at: Date.now() };
  res.json(body);
});

statsRouter.get("/api/audit", requireAdmin, async (_req, res) => {
  const db = getDb();
  if (!db) {
    res.json({ events: [] });
    return;
  }
  const { data, error } = await db
    .from("audit_events")
    .select("id, at, channel, role, policy_version, data_classes, final_action, rule_ids, provider, outcome, latency_ms")
    .order("id", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not read audit events");
  res.json({ events: data });
});
