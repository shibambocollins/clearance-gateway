// Provider health = simulated outages (database, shared by all instances)
//                 + runtime failures (in memory, per instance: 2 consecutive failures → 60 s down)
//                 + configuration (a real provider without a key can never be eligible).
import type { CompiledPolicy, ProviderHealth } from "@clearance-gateway/core";
import { getDb } from "../db/client.js";
import { isConfigured } from "./adapters.js";

const FAILURES_BEFORE_DOWN = 2;
const DOWN_MS = 60_000;
const OUTAGE_CACHE_MS = 2_000;
export const OUTAGE_TTL_MS = 10 * 60_000;
const DB_TIMEOUT_MS = 3_000;

const runtime = new Map<string, { failures: number; downUntil: number }>();

export function recordFailure(providerId: string): void {
  const state = runtime.get(providerId) ?? { failures: 0, downUntil: 0 };
  state.failures++;
  if (state.failures >= FAILURES_BEFORE_DOWN) state.downUntil = Date.now() + DOWN_MS;
  runtime.set(providerId, state);
}

export function recordSuccess(providerId: string): void {
  runtime.delete(providerId);
}

function runtimeDown(providerId: string): boolean {
  return (runtime.get(providerId)?.downUntil ?? 0) > Date.now();
}

// Simulated outages. Kept in memory as well, so local runs without a database still work.
const localOutages = new Set<string>();
let outageCache: { ids: Set<string>; at: number } | null = null;

export async function getSimulatedOutages(): Promise<Set<string>> {
  const db = getDb();
  if (!db) return new Set(localOutages);
  if (outageCache && Date.now() - outageCache.at < OUTAGE_CACHE_MS) return outageCache.ids;
  // Outages expire, so a judge who forgets to restore a provider doesn't break the demo for the next one.
  const since = new Date(Date.now() - OUTAGE_TTL_MS).toISOString();
  const query = db.from("simulated_outages").select("provider_id").eq("down", true).gte("updated_at", since);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), DB_TIMEOUT_MS));
  const result = await Promise.race([query, timeout]);
  // If the database can't be read, keep the last known state rather than silently clearing outages.
  if (!result || result.error) return outageCache?.ids ?? new Set(localOutages);
  const ids = new Set((result.data ?? []).map((r: { provider_id: string }) => r.provider_id));
  outageCache = { ids, at: Date.now() };
  return ids;
}

export async function setSimulatedOutage(providerId: string, down: boolean): Promise<void> {
  if (down) localOutages.add(providerId);
  else localOutages.delete(providerId);
  outageCache = null;
  const db = getDb();
  if (!db) return;
  const { error } = await db
    .from("simulated_outages")
    .upsert({ provider_id: providerId, down, updated_at: new Date().toISOString() });
  if (error) throw new Error("Could not save the outage setting");
}

export async function clearSimulatedOutages(): Promise<void> {
  localOutages.clear();
  outageCache = null;
  runtime.clear();
  const db = getDb();
  if (!db) return;
  const { error } = await db.from("simulated_outages").delete().neq("provider_id", "");
  if (error) throw new Error("Could not clear outages");
}

export interface ProviderStatus {
  id: string;
  label: string;
  tier: number;
  maxLevel: string;
  enabled: boolean;
  configured: boolean;
  simulatedOutage: boolean;
  runtimeDown: boolean;
  healthy: boolean;
}

export async function getProviderStatuses(policy: CompiledPolicy): Promise<ProviderStatus[]> {
  const outages = await getSimulatedOutages();
  return policy.providers.map((p) => {
    const configured = isConfigured(p.id);
    const simulatedOutage = outages.has(p.id);
    const down = runtimeDown(p.id);
    return {
      id: p.id,
      label: p.label,
      tier: p.tier,
      maxLevel: p.maxLevel,
      enabled: p.enabled,
      configured,
      simulatedOutage,
      runtimeDown: down,
      healthy: configured && !simulatedOutage && !down,
    };
  });
}

export async function getProviderHealth(policy: CompiledPolicy): Promise<ProviderHealth> {
  const statuses = await getProviderStatuses(policy);
  return Object.fromEntries(statuses.map((s) => [s.id, s.healthy]));
}
