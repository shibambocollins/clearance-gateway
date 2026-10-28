// Policy compiler and lifecycle endpoints, with the LLM stubbed (no database: drafts aren't saved).
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SEED_POLICY, SEED_POLICY_TEXT } from "@clearance-gateway/core";
import { extractJson, validateCompiled } from "./compiler/compile.js";

const ADMIN = { "x-admin-code": "code" };
let server: Server;
let baseUrl: string;
let geminiReplies: string[] = [];
let geminiBodies: string[] = [];

// What a well-behaved model would return: the seed policy minus the configuration keys.
const { providers: _p, routing: _r, schemaVersion: _s, mode: _m, ...llmShape } = SEED_POLICY;

beforeAll(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.OFFLINE_MODE = "false";
  process.env.DEMO_ADMIN_CODE = "code";
  process.env.GEMINI_API_KEY = "k";
  process.env.GEMINI_MODEL = "m";
  delete process.env.GROQ_API_KEY;

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("googleapis.com")) {
      geminiBodies.push(String(init?.body));
      const text = geminiReplies.shift() ?? "{}";
      return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    }
    return realFetch(input, init);
  });
  const { default: app } = await import("./app.js");
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  vi.restoreAllMocks();
});

const post = (path: string, body: unknown, headers: Record<string, string> = ADMIN) =>
  fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("compiler helpers", () => {
  it("extracts JSON from fenced or chatty replies", () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow();
  });

  it("copies providers and routing from the active policy; the LLM cannot set them", () => {
    const sneaky = { ...llmShape, providers: [{ id: "evil", label: "x", tier: 1, maxLevel: "restricted", enabled: true }] };
    const { policy } = validateCompiled(sneaky, SEED_POLICY);
    expect(policy?.providers).toEqual(SEED_POLICY.providers);
  });
});

describe("POST /api/policy/compile", () => {
  it("requires the admin code", async () => {
    expect((await post("/api/policy/compile", { rawText: SEED_POLICY_TEXT }, {})).status).toBe(401);
  });

  it("returns a draft and a decision diff; treats the policy text as delimited data", async () => {
    geminiReplies = [JSON.stringify(llmShape)];
    geminiBodies = [];
    const res = await post("/api/policy/compile", { rawText: SEED_POLICY_TEXT });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "draft", compiledBy: "gemini:m", attempts: [{ provider: "gemini", outcome: "valid" }] });
    expect(body.diff).toMatchObject({ looserCount: 0, stricterCount: 0 });
    expect(geminiBodies[0]).toContain("<policy>\\n" + SEED_POLICY_TEXT.split("\n")[0]);
  });

  it("retries once with validation errors, then reports failure without activating anything", async () => {
    geminiReplies = ['{"name":"x"}', "not json at all"];
    geminiBodies = [];
    const res = await post("/api/policy/compile", { rawText: SEED_POLICY_TEXT });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.attempts.map((a: { outcome: string }) => a.outcome)).toEqual(["schema_errors", "invalid_json"]);
    expect(geminiBodies[1]).toContain("failed validation");
  });

  it("reports a looser draft in the diff", async () => {
    const looser = structuredClone(llmShape);
    looser.rules.find((r) => r.id === "R-CRED-01")!.action = "redact";
    geminiReplies = [JSON.stringify(looser)];
    const body = await (await post("/api/policy/compile", { rawText: SEED_POLICY_TEXT })).json();
    expect(body.diff.looserCount).toBe(12);
  });
});

describe("POST /api/policy/simulate", () => {
  it("compares active and candidate decisions on the six samples without echoing prompts", async () => {
    const candidate = structuredClone(SEED_POLICY);
    candidate.rules.find((r) => r.id === "R-PII-01")!.action = "block";
    const res = await post("/api/policy/simulate", { policy: candidate });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(6);
    const idRow = body.rows.find((r: { label: string }) => r.label === "ID number");
    expect(idRow).toMatchObject({ changed: true, active: { action: "redact" }, candidate: { action: "block" } });
    expect(body.changedCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body)).not.toContain("Summarise this complaint");
  });

  it("simulates pasted prompts for a chosen role", async () => {
    const res = await post("/api/policy/simulate", { policy: SEED_POLICY, prompts: ["Reply to ops@example.com"], role: "hr" });
    const body = await res.json();
    expect(body.rows[0]).toMatchObject({ role: "hr", changed: false, active: { action: "allow" } });
  });
});

describe("activation", () => {
  it("needs the database", async () => {
    expect((await post("/api/policy/00000000-0000-0000-0000-000000000000/activate", {})).status).toBe(503);
  });

  it("GET /api/policy/active is public and returns the raw text and compiled policy", async () => {
    const body = await (await fetch(`${baseUrl}/api/policy/active`)).json();
    expect(body.rawText).toBe(SEED_POLICY_TEXT);
    expect(body.compiled.rules.length).toBe(SEED_POLICY.rules.length);
  });
});
