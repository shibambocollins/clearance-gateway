// Real-mode failover with stubbed provider HTTP: when a provider fails, the request is routed
// again under the same policy. A failure must never push data to a lower tier than allowed.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let server: Server;
let baseUrl: string;
const providerCalls: string[] = [];

beforeAll(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.OFFLINE_MODE = "false";
  process.env.DEMO_ADMIN_CODE = "code";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "test-model";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_MODEL = "test-model";

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("googleapis.com")) {
      providerCalls.push("gemini");
      return new Response("{}", { status: 503 });
    }
    if (url.includes("api.groq.com")) {
      providerCalls.push("groq");
      return Response.json({ choices: [{ message: { content: "Reply from the tier-3 model." } }] });
    }
    return realFetch(input, init);
  });

  const { default: app } = await import("./app.js");
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await fetch(`${baseUrl}/api/admin/outage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-code": "code" },
    body: JSON.stringify({ providerId: "mock-enterprise", down: true }),
  });
});

afterAll(() => {
  server.close();
  vi.restoreAllMocks();
});

const chat = async (text: string) =>
  (
    await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, role: "general" }),
    })
  ).json();

describe("provider failure → re-route under the same policy", () => {
  it("a public prompt moves on to the next eligible provider", async () => {
    providerCalls.length = 0;
    const body = await chat("Suggest three agenda items for a team retro.");
    expect(providerCalls).toEqual(["gemini", "groq"]);
    expect(body).toMatchObject({ outcome: "sent", reply: "Reply from the tier-3 model.", provider: { id: "groq", mock: false } });
    expect(body.explanation[0]).toBe(
      "Google Gemini did not respond, so the request was routed again under the same policy.",
    );
  });

  it("an internal prompt is BLOCKED instead of falling through to the public-only tier", async () => {
    providerCalls.length = 0;
    const body = await chat("Draft a reply to ops@example.com about the delay.");
    expect(providerCalls).toEqual(["gemini"]);
    expect(body).toMatchObject({ outcome: "blocked", reply: null, provider: null });
    expect(body.decision.blockReason).toBe("NO_ELIGIBLE_PROVIDER");
  });

  it("after two consecutive failures, the provider is skipped without being called", async () => {
    providerCalls.length = 0;
    const body = await chat("Suggest a name for our team newsletter.");
    expect(providerCalls).toEqual(["groq"]);
    expect(body.provider.id).toBe("groq");
  });
});
