import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CORE_VERSION } from "@clearance-gateway/core";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.CORS_ORIGINS = "https://web.example.com";
  const { default: app } = await import("./app.js");
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe("GET /health", () => {
  it("returns liveness JSON with the core version and no database configured", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      coreVersion: CORE_VERSION,
      offlineMode: false,
      db: "not_configured",
      activePolicyVersion: null,
      policySource: "seed (database not configured)",
    });
  });

  it("allows CORS for configured origins only", async () => {
    const allowed = await fetch(`${baseUrl}/health`, { headers: { Origin: "https://web.example.com" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://web.example.com");

    const denied = await fetch(`${baseUrl}/health`, { headers: { Origin: "https://evil.example.org" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    const lens = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
    const extension = await fetch(`${baseUrl}/health`, { headers: { Origin: lens } });
    expect(extension.headers.get("access-control-allow-origin")).toBe(lens);
    const fake = await fetch(`${baseUrl}/health`, { headers: { Origin: "chrome-extension://evil.example.org" } });
    expect(fake.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("errors", () => {
  it("rejects bodies over 16 KB without echoing them", async () => {
    const big = JSON.stringify({ text: "x".repeat(17 * 1024) });
    const res = await fetch(`${baseUrl}/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: big,
    });
    expect(res.status).toBe(413);
    const text = await res.text();
    expect(text).not.toContain("xxxx");
  });

  it("rejects malformed JSON without echoing it", async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json SECRET123",
    });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("SECRET123");
  });
});

describe("security headers", () => {
  it("API responses are never cached or framed", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
