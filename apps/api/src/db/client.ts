// Supabase client for the API only. The service-role key never leaves this process.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "../config.js";

let client: SupabaseClient | null | undefined;

/** Returns the shared client, or null when Supabase is not configured. */
export function getDb(): SupabaseClient | null {
  if (client !== undefined) return client;
  const { supabaseUrl, supabaseServiceRoleKey } = getConfig();
  client =
    supabaseUrl && supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return client;
}
