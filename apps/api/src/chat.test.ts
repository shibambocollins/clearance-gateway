// /api/chat end to end in offline mode (mock providers, no database), plus the admin outage toggle.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SAMPLE_PROMPTS, type SamplePrompt } from "@clearance-gateway/core";

const ADMIN_CODE = "test-admin-code";
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.OFFLINE_MODE = "true";
  process.env.DEMO_ADMIN_CODE = ADMIN_CODE;
  const { default: app } = await import("./app.js");
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

async function chat(id: SamplePrompt["id"]) {
  const s = SAMPLE_PROMPTS.find((p) => p.id === id)!;
  const res = await postJson("/api/chat", { text: s.text, role: s.role, channel: "web" });
  expect(res.status).toBe(200);
  return { sample: s, body: await res.json() };
}

const outage = (providerId: string, down: boolean, code = ADMIN_CODE) =>
  postJson("/api/admin/outage", { providerId, down }, { "x-admin-code": code });

describe("POST /api/chat (offline mode)", () => {
  it("answers a clean prompt through tier 1 and says it's offline", async () => {
    const { body } = await chat("clean");
    expect(body).toMatchObject({ outcome: "sent", offlineMode: true, provider: { id: "mock-enterprise", mock: true } });
    expect(body.reply).toContain("Mock reply from");
  });

  it("redacts the ID number before sending; the reply never contains it", async () => {
    const { sample, body } = await chat("id-number");
    const id = sample.text.match(/\d{13}/)![0];
    expect(body.sent).toContain("[REDACTED:SA_ID]");
    expect(body.sent).not.toContain(id);
    expect(body.reply).not.toContain(id);
    expect(body.explanation[0]).toMatch(/^Removed 1 South African ID number\. Rule R-PII-01/);
  });

  it("pseudonymises client and project names, then restores them in the reply", async () => {
    const { body } = await chat("client-name");
    expect(body.sent).toContain("[CLIENT_NAME_1]");
    expect(body.sent).not.toContain("Meridian Mining");
    expect(body.reply).toContain("Meridian Mining");
    expect(body.reply).toContain("Project Fynbos");
    expect(body.reply).not.toMatch(/\[CLIENT_NAME_1\]/);
    expect(body.explanation.join(" ")).toContain("The originals were restored in the reply.");
  });

  it("blocks the API key with coaching and calls no provider", async () => {
    const { body } = await chat("api-key");
    expect(body).toMatchObject({ outcome: "blocked", reply: null, sent: null, provider: null });
    expect(body.decision.blockReason).toBe("BLOCKED_BY_RULE");
    expect(body.explanation[0]).toMatch(/Remove it and try again\.$/);
  });

  it("returns masked findings only, never the token map", async () => {
    const { sample, body } = await chat("hr-case");
    const id = sample.text.match(/\d{13}/)![0];
    expect(JSON.stringify(body.decision.findings)).not.toContain(id);
    expect(body).not.toHaveProperty("tokens");
  });

  it("rejects bad input without echoing it", async () => {
    const res = await postJson("/api/chat", { text: "", channel: "SECRET_CHANNEL" });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("SECRET_CHANNEL");
  });
});

describe("admin outage toggle (fail closed)", () => {
  it("requires the admin code", async () => {
    expect((await outage("mock-enterprise", true, "wrong")).status).toBe(401);
    expect((await postJson("/api/admin/reset", {})).status).toBe(401);
  });

  it("with tier 1 down, confidential prompts are blocked and clean prompts fail over", async () => {
    expect((await outage("mock-enterprise", true)).status).toBe(200);

    for (const id of ["id-number", "client-name", "hr-case", "outage-case"] as const) {
      const { body } = await chat(id);
      expect(body, id).toMatchObject({ outcome: "blocked", reply: null, provider: null });
      expect(body.decision.blockReason).toBe("NO_ELIGIBLE_PROVIDER");
      expect(body.explanation[0]).toContain("fail closed, rule R-ROUTE-01");
    }

    const clean = await chat("clean");
    expect(clean.body.provider).toMatchObject({ id: "gemini", mock: true });
    expect(clean.body.reply).toContain("a mock standing in for Google Gemini");

    // /api/check and /api/providers reflect the outage too.
    const preview = await (await postJson("/api/check", { text: SAMPLE_PROMPTS[1]!.text })).json();
    expect(preview.action).toBe("block");
    const providers = await (await fetch(`${baseUrl}/api/providers`)).json();
    expect(providers.providers[0]).toMatchObject({ id: "mock-enterprise", simulatedOutage: true, healthy: false });
  });

  it("reset clears outages", async () => {
    const res = await postJson("/api/admin/reset", {}, { "x-admin-code": ADMIN_CODE });
    expect(res.status).toBe(200);
    expect((await chat("id-number")).body.outcome).toBe("sent");
  });

  it("rejects unknown providers", async () => {
    expect((await outage("not-a-provider", true)).status).toBe(404);
  });
});
