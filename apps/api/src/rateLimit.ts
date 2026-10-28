// Rate limit (SPEC §15): per salted client hash per day, plus a global daily cap, counted in
// usage_counters. Over the limit, /api/chat still answers, but with the mock provider.
import { createHash } from "node:crypto";
import type { Request } from "express";
import { getConfig } from "./config.js";
import { getDb } from "./db/client.js";

const GLOBAL_KEY = "__global__";

export interface Quota {
  /** null = within limits; otherwise why replies come from the mock provider. */
  mockReason: string | null;
}

/** Client IP as seen by Vercel's edge (x-real-ip / first x-forwarded-for), else the socket. */
function clientIp(req: Request): string {
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp) return realIp;
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

/** Salted hash: the raw IP is never stored. */
export function clientHash(req: Request): string {
  return createHash("sha256").update(`${getConfig().clientHashSalt}:${clientIp(req)}`).digest("hex").slice(0, 32);
}

export async function consumeQuota(req: Request): Promise<Quota> {
  const db = getDb();
  if (!db) return { mockReason: null }; // local development without a database
  const config = getConfig();
  const day = new Date().toISOString().slice(0, 10);

  const [client, global] = await Promise.all([
    db.rpc("increment_usage", { p_day: day, p_client_hash: clientHash(req) }),
    db.rpc("increment_usage", { p_day: day, p_client_hash: GLOBAL_KEY }),
  ]);
  // If usage can't be counted, protect the real providers' quotas: use the mock.
  if (client.error || global.error) return { mockReason: "Usage could not be counted right now" };
  if ((client.data as number) > config.rateLimitPerClientPerDay) {
    return { mockReason: `Daily demo limit reached (${config.rateLimitPerClientPerDay} requests per visitor)` };
  }
  if ((global.data as number) > config.globalDailyCap) {
    return { mockReason: "The demo's daily limit across all visitors has been reached" };
  }
  return { mockReason: null };
}
