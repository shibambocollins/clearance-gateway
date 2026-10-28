// The active compiled policy. Loaded from Supabase and re-validated with the schema; if the
// database is unreachable or holds no valid active policy, the seed policy held in memory is used
// and responses say so (SPEC §11).
import { SEED_POLICY, policySchema, type CompiledPolicy } from "@clearance-gateway/core";
import { getDb } from "../db/client.js";

const CACHE_MS = 30_000;
const DB_TIMEOUT_MS = 3_000;

export type PolicySource = "database" | "seed (database not configured)" | "seed (database unreachable)" | "seed (no active policy)";

export interface ActivePolicy {
  policy: CompiledPolicy;
  version: number | null;
  source: PolicySource;
  /** True when the database should have answered but didn't: the seed policy is a fallback. */
  degraded: boolean;
}

let cached: { value: ActivePolicy; at: number } | null = null;

export function clearPolicyCache(): void {
  cached = null;
}

export async function getActivePolicy(): Promise<ActivePolicy> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = await loadActivePolicy();
  cached = { value, at: Date.now() };
  return value;
}

async function loadActivePolicy(): Promise<ActivePolicy> {
  const db = getDb();
  if (!db) return { policy: SEED_POLICY, version: null, source: "seed (database not configured)", degraded: false };

  const query = db.from("policy_versions").select("version, compiled").eq("status", "active").maybeSingle();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), DB_TIMEOUT_MS));
  const result = await Promise.race([query, timeout]);
  if (!result || result.error) {
    return { policy: SEED_POLICY, version: null, source: "seed (database unreachable)", degraded: true };
  }
  if (!result.data) return { policy: SEED_POLICY, version: null, source: "seed (no active policy)", degraded: true };

  const parsed = policySchema.safeParse(result.data.compiled);
  if (!parsed.success) {
    console.error(`Active policy v${result.data.version} failed validation; using the seed policy.`);
    return { policy: SEED_POLICY, version: null, source: "seed (no active policy)", degraded: true };
  }
  return { policy: parsed.data, version: result.data.version, source: "database", degraded: false };
}
