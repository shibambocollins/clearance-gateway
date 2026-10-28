// Reads configuration from the environment. Read on each call so tests can change env safely.

const LOCAL_WEB_ORIGIN = "http://localhost:5173";

export interface Config {
  offlineMode: boolean;
  corsOrigins: string[];
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const extraOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin.length > 0);

  return {
    offlineMode: env.OFFLINE_MODE === "true",
    corsOrigins: [LOCAL_WEB_ORIGIN, ...extraOrigins],
    supabaseUrl: env.SUPABASE_URL || undefined,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  };
}
