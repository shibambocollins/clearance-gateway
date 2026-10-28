// The six sample prompts end to end through check() (SPEC §16 Phase 2 acceptance), with and
// without a tier-1 outage, plus the explanation wording from SPEC §9.
import { describe, expect, it } from "vitest";
import { check } from "./check.js";
import { SEED_POLICY } from "./policy/seed.js";
import { SAMPLE_PROMPTS, type SamplePrompt } from "./samples.js";

const sample = (id: SamplePrompt["id"]) => SAMPLE_PROMPTS.find((s) => s.id === id)!;
const run = (id: SamplePrompt["id"], outage = false) => {
  const s = sample(id);
  return check(s.text, { policy: SEED_POLICY, role: s.role, health: outage ? { "mock-enterprise": false } : {} });
};

describe("check: six sample prompts", () => {
  it("has six samples with distinct ids", () => {
    expect(new Set(SAMPLE_PROMPTS.map((s) => s.id)).size).toBe(6);
  });

  it.each([
    ["clean", "allow", "mock-enterprise", [], []],
    ["id-number", "redact", "mock-enterprise", ["SA_ID"], ["R-PII-01"]],
    ["api-key", "block", null, ["CREDENTIAL"], ["R-CRED-01"]],
    ["client-name", "tokenise", "mock-enterprise", ["CLIENT_NAME", "PROJECT_CODENAME"], ["R-TERM-01"]],
    ["hr-case", "tokenise", "mock-enterprise", ["SA_ID", "EMAIL"], ["R-HR-01", "R-CONTACT-03"]],
    ["outage-case", "tokenise", "mock-enterprise", ["CLIENT_NAME", "BANK_ACCOUNT"], ["R-TERM-01", "R-FIN-01"]],
  ] as const)("%s → %s via %s", (id, action, provider, classes, rules) => {
    const r = run(id);
    expect(r.decision.action).toBe(action);
    expect(r.decision.provider?.id ?? null).toBe(provider);
    expect(r.findings.map((f) => f.dataClass)).toEqual(classes);
    expect(r.decision.ruleIds).toEqual(rules);
  });

  it.each(["id-number", "client-name", "hr-case", "outage-case"] as const)(
    "%s is blocked (fail closed) when tier 1 is down",
    (id) => {
      const r = run(id, true);
      expect(r.decision).toMatchObject({ action: "block", blockReason: "NO_ELIGIBLE_PROVIDER", provider: null });
      expect(r.transformed).toBeNull();
    },
  );

  it("a clean prompt still goes through during a tier-1 outage", () => {
    expect(run("clean", true).decision.provider?.id).toBe("gemini");
  });

  it("never puts a sensitive value into the text that would be sent", () => {
    for (const s of SAMPLE_PROMPTS) {
      const r = check(s.text, { policy: SEED_POLICY, role: s.role });
      if (!r.transformed) continue;
      for (const d of r.decision.perFinding) {
        const value = s.text.slice(d.finding.start, d.finding.end);
        if (d.action === "allow") continue;
        expect(r.transformed.text, `${s.id}: ${d.finding.dataClass}`).not.toContain(value);
      }
    }
  });

  it("previews (masked) never equal the raw value", () => {
    for (const s of SAMPLE_PROMPTS) {
      for (const f of check(s.text, { policy: SEED_POLICY, role: s.role }).findings) {
        expect(f.masked).not.toBe(s.text.slice(f.start, f.end));
      }
    }
  });
});

describe("explanations (SPEC §9 wording)", () => {
  it("redaction", () => {
    expect(run("id-number").explanation).toEqual([
      "Removed 1 South African ID number. Rule R-PII-01: ID numbers may not be sent to AI providers.",
      "Sent to Approved enterprise AI (demo) (tier 1).",
    ]);
  });

  it("pseudonymisation", () => {
    expect(run("client-name").explanation[0]).toBe(
      "Pseudonymised 1 client name and 1 project codename before sending to Approved enterprise AI (demo) (rule R-TERM-01). The originals will be restored in the reply.",
    );
  });

  it("fail-closed block", () => {
    expect(run("id-number", true).explanation[0]).toBe(
      "Blocked: no approved provider is available for confidential data right now (fail closed, rule R-ROUTE-01).",
    );
  });

  it("block by rule with coaching", () => {
    expect(run("api-key").explanation).toEqual([
      "Blocked: your prompt contains 1 password, key or token. Rule R-CRED-01: Passwords, API keys, tokens and private keys must never be shared with any AI tool. Remove it and try again.",
    ]);
  });

  it("HR exception is explained, not silent", () => {
    expect(run("hr-case").explanation).toContain(
      "Allowed 1 email address for HR staff with Approved enterprise AI (demo) (rule R-CONTACT-03).",
    );
  });

  it("failover is visible to the user", () => {
    expect(run("clean", true).explanation.at(-1)).toBe(
      "Sent to Google Gemini (demo) (tier 2); skipped Approved enterprise AI (demo) (unavailable).",
    );
  });
});
