// Reads configuration from the environment. Read on each call so tests can change env safely.

const LOCAL_WEB_ORIGIN = "http://localhost:5173";

export interface Config {
  offlineMode: boolean;
  corsOrigins: string[];
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  geminiApiKey: string | undefined;
  geminiModel: string | undefined;
  groqApiKey: string | undefined;
  groqModel: string | undefined;
  demoAdminCode: string | undefined;
  clientHashSalt: string;
  rateLimitPerClientPerDay: number;
  globalDailyCap: number;
  /** Refuse activating a policy looser than the seed baseline (on unless POLICY_FLOOR=off). */
  policyFloor: boolean;
}

const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

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
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || undefined,
    groqApiKey: env.GROQ_API_KEY || undefined,
    groqModel: env.GROQ_MODEL || undefined,
    demoAdminCode: env.DEMO_ADMIN_CODE || undefined,
    clientHashSalt: env.CLIENT_HASH_SALT ?? "",
    rateLimitPerClientPerDay: positiveInt(env.RATE_LIMIT_PER_CLIENT_PER_DAY, 50),
    globalDailyCap: positiveInt(env.GLOBAL_DAILY_CAP, 1000),
    policyFloor: env.POLICY_FLOOR !== "off",
  };
}
