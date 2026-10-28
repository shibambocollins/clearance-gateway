import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SAMPLE_PROMPTS } from "@clearance-gateway/core";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // No database: the API must fall back to the seed policy held in memory.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { default: app } = await import("./app.js");
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const post = (body: unknown) =>
  fetch(`${baseUrl}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/check", () => {
  it.each([
    ["clean", "allow", []],
    ["id-number", "redact", ["redact"]],
    ["api-key", "block", ["block"]],
    ["client-name", "tokenise", ["tokenise", "tokenise"]],
    ["hr-case", "tokenise", ["tokenise", "allow"]],
    ["outage-case", "tokenise", ["tokenise", "redact"]],
  ])("sample %s → %s", async (id, action, findingActions) => {
    const sample = SAMPLE_PROMPTS.find((s) => s.id === id)!;
    const res = await post({ text: sample.text, role: sample.role });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe(action);
    expect(body.findings.map((f: { action: string }) => f.action)).toEqual(findingActions);
    expect(body.policy).toEqual({ version: null, source: "seed (database not configured)", degraded: false });
    expect(body.explanation.length).toBeGreaterThan(0);

    // Masked previews and the transformed text never contain the raw sensitive values.
    const raw = JSON.stringify(body.findings);
    for (const f of body.findings as { start: number; end: number; action: string }[]) {
      const value = sample.text.slice(f.start, f.end);
      expect(raw).not.toContain(value);
      if (body.transformed && f.action !== "allow") expect(body.transformed).not.toContain(value);
    }
    // The token map is never returned.
    expect(body).not.toHaveProperty("tokens");
  });

  it("defaults the role to general", async () => {
    const body = await (await post({ text: "hello" })).json();
    expect(body.role).toBe("general");
  });

  it("rejects an unknown role and missing text, naming fields but not echoing values", async () => {
    const res = await post({ text: "", role: "ceo" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.sort()).toEqual(["role", "text"]);
    expect(JSON.stringify(body)).not.toContain("ceo");
  });
});
