// Stores the seed policy as version 1 (compiled_by = 'seed') and activates it, if the database
// has no policy versions yet. Run locally: npm run db:seed -w @clearance-gateway/api
import { fileURLToPath } from "node:url";
import { SEED_POLICY, SEED_POLICY_TEXT, policySchema } from "@clearance-gateway/core";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const { getDb } = await import("../src/db/client.js");

const db = getDb();
if (!db) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");

const { count, error: countError } = await db.from("policy_versions").select("id", { count: "exact", head: true });
if (countError) throw new Error(`Could not read policy_versions: ${countError.message}`);
if (count && count > 0) {
  console.log(`policy_versions already has ${count} row(s); nothing to do.`);
  process.exit(0);
}

const compiled = policySchema.parse(SEED_POLICY);
const { error } = await db.from("policy_versions").insert({
  version: 1,
  raw_text: SEED_POLICY_TEXT,
  compiled,
  status: "active",
  compiled_by: "seed",
  activated_at: new Date().toISOString(),
});
if (error) throw new Error(`Insert failed: ${error.message}`);
console.log("Seed policy stored as version 1 and activated.");
