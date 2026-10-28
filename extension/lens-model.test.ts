// Lens overlay logic, fed with real Engine decisions shaped like /api/check responses.
import { beforeAll, describe, expect, it } from "vitest";
import { SAMPLE_PROMPTS, SEED_POLICY, check } from "@clearance-gateway/core";

interface Model {
  kind: string;
  title?: string;
  lines?: string[];
  findings?: { label: string; masked: string; outcome: string; ruleId: string | null }[];
  preview?: string;
}
let Lens: {
  apiBaseFor(url: string): string;
  assistantUrlFor(url: string): string;
  safeRole(role: unknown): string;
  overlayModel(check: unknown): Model;
};

beforeAll(async () => {
  await import("./lens-model.js");
  Lens = (globalThis as unknown as { LensModel: typeof Lens }).LensModel;
});

/** The same shape /api/check returns (apps/api/src/routes/check.ts). */
function apiCheck(id: string, health = {}) {
  const s = SAMPLE_PROMPTS.find((p) => p.id === id)!;
  const r = check(s.text, { policy: SEED_POLICY, role: s.role, health });
  return {
    sample: s,
    response: {
      action: r.decision.action,
      findings: r.decision.perFinding.map((d) => ({ ...d.finding, action: d.action, ruleId: d.ruleId })),
      transformed: r.transformed?.text ?? null,
      explanation: r.explanation,
    },
  };
}

describe("Lens overlay model", () => {
  it("lets a clean prompt through without an overlay", () => {
    expect(Lens.overlayModel(apiCheck("clean").response)).toEqual({ kind: "clear" });
  });

  it("offers 'Send redacted' with the transformed text when values are removed", () => {
    const { sample, response } = apiCheck("id-number");
    const model = Lens.overlayModel(response);
    expect(model.kind).toBe("modify");
    expect(model.preview).toContain("[REDACTED:SA_ID]");
    expect(model.preview).not.toContain(sample.text.match(/\d{13}/)![0]);
    expect(model.findings).toEqual([{ label: "South African ID number", masked: expect.stringContaining("••"), outcome: "removed", ruleId: "R-PII-01" }]);
  });

  it("explains that the site is not approved and never offers 'Send anyway'", () => {
    const model = Lens.overlayModel(apiCheck("client-name").response);
    expect(model.lines![0]).toMatch(/not an approved AI provider/);
    expect(model).not.toHaveProperty("canSendAnyway");
  });

  it("blocks credentials with the coaching explanation and no preview", () => {
    const model = Lens.overlayModel(apiCheck("api-key").response);
    expect(model.kind).toBe("blocked");
    expect(model.preview).toBeUndefined();
    expect(model.lines![0]).toMatch(/Remove it and try again/);
  });

  it("blocks (fail closed) during a tier-1 outage", () => {
    const model = Lens.overlayModel(apiCheck("id-number", { "mock-enterprise": false }).response);
    expect(model.kind).toBe("blocked");
    expect(model.lines![0]).toMatch(/fail closed/);
    expect(model.lines!.some((l) => l.startsWith("Not used:"))).toBe(false);
  });

  it("fails closed when the check itself fails", () => {
    expect(Lens.overlayModel(null)).toMatchObject({ kind: "error", lines: ["Your message was not sent."] });
  });
});

describe("Lens URL and input safety", () => {
  it("only ever calls the production or local API", () => {
    expect(Lens.apiBaseFor("https://clearance-gateway-web.vercel.app/demo-chat")).toBe("https://clearance-gateway-api.vercel.app");
    expect(Lens.apiBaseFor("http://localhost:5173/demo-chat")).toBe("http://localhost:3001");
    expect(Lens.apiBaseFor("http://localhost:5173.evil.example.org/demo-chat")).toBe("https://clearance-gateway-api.vercel.app");
    expect(Lens.apiBaseFor("https://evil.example.org/")).toBe("https://clearance-gateway-api.vercel.app");
  });

  it("only sends known roles", () => {
    expect(Lens.safeRole("hr")).toBe("hr");
    expect(Lens.safeRole("admin")).toBe("general");
    expect(Lens.safeRole(undefined)).toBe("general");
  });
});
