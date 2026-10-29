// The active compiled policy. Loaded from Supabase and re-validated with the schema; if the
// database is unreachable or holds no valid active policy, the seed policy held in memory is used
// and responses say so (SPEC §11).
import { SEED_POLICY, SEED_POLICY_TEXT, policySchema, type CompiledPolicy } from "@clearance-gateway/core";
import { getDb } from "../db/client.js";

// Short, so an activation reaches every serverless instance within a few seconds.
const CACHE_MS = 5_000;
const DB_TIMEOUT_MS = 3_000;

export type PolicySource = "database" | "seed (database not configured)" | "seed (database unreachable)" | "seed (no active policy)";

export interface ActivePolicy {
  policy: CompiledPolicy;
  rawText: string;
  version: number | null;
  id: string | null;
  /** When the active version was activated (ISO), or null for the in-memory seed. */
  updatedAt: string | null;
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

const seed = (source: PolicySource, degraded: boolean): ActivePolicy => ({
  policy: SEED_POLICY,
  rawText: SEED_POLICY_TEXT,
  version: null,
  id: null,
  updatedAt: null,
  source,
  degraded,
});

async function loadActivePolicy(): Promise<ActivePolicy> {
  const db = getDb();
  if (!db) return seed("seed (database not configured)", false);

  const query = db.from("policy_versions").select("id, version, compiled, raw_text, activated_at, created_at").eq("status", "active").maybeSingle();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), DB_TIMEOUT_MS));
  const result = await Promise.race([query, timeout]);
  if (!result || result.error) return seed("seed (database unreachable)", true);
  if (!result.data) return seed("seed (no active policy)", true);

  const parsed = policySchema.safeParse(result.data.compiled);
  if (!parsed.success) {
    console.error(`Active policy v${result.data.version} failed validation; using the seed policy.`);
    return seed("seed (no active policy)", true);
  }
  return {
    policy: parsed.data,
    rawText: result.data.raw_text,
    version: result.data.version,
    id: result.data.id,
    updatedAt: result.data.activated_at ?? result.data.created_at,
    source: "database",
    degraded: false,
  };
}
