import { describe, expect, it } from "vitest";
import { detect } from "./detectors/index.js";
import { ALNUM, fakeChars, saId } from "./fixtures.js";
import type { CompiledPolicy, RoleId } from "./policy/schema.js";
import { SEED_POLICY } from "./policy/seed.js";
import { ROUTE_RULE_ID, route, type ProviderHealth } from "./route.js";

const ID = saId();
const run = (text: string, role: RoleId = "general", health: ProviderHealth = {}, policy: CompiledPolicy = SEED_POLICY) =>
  route(policy, detect(text, { terms: policy.terms }), role, health);

describe("route", () => {
  it("sends a clean prompt to the first provider in policy order", () => {
    const d = run("Summarise our meeting notes");
    expect(d).toMatchObject({ action: "allow", level: "public", blockReason: null });
    expect(d.provider?.id).toBe("mock-enterprise");
  });

  it("fails over a clean prompt when tier 1 is down", () => {
    const d = run("Summarise our meeting notes", "general", { "mock-enterprise": false });
    expect(d.provider?.id).toBe("gemini");
    expect(d.candidates.map((c) => c.status)).toEqual(["unhealthy", "eligible"]);
  });

  it("uses the request level from the ORIGINAL prompt, even when the data will be redacted", () => {
    const d = run(`Customer ${ID} called`);
    expect(d.level).toBe("confidential");
    expect(d.action).toBe("redact");
    expect(d.provider?.tier).toBe(1);
  });

  it("FAILS CLOSED: confidential data with tier 1 down is blocked, never sent to a lower tier", () => {
    const d = run(`Customer ${ID} called`, "general", { "mock-enterprise": false });
    expect(d).toMatchObject({ action: "block", provider: null, blockReason: "NO_ELIGIBLE_PROVIDER" });
    expect(d.ruleIds).toEqual([ROUTE_RULE_ID]);
    expect(d.candidates.map((c) => c.status)).toEqual(["unhealthy", "level_too_high", "level_too_high"]);
  });

  it("fails closed when every provider is down", () => {
    const health = { "mock-enterprise": false, gemini: false, groq: false };
    expect(run("hello", "general", health)).toMatchObject({ action: "block", blockReason: "NO_ELIGIBLE_PROVIDER" });
  });

  it("internal data (email) fails over to tier 2 but not to tier 3", () => {
    const text = "Reply to ops@example.com";
    expect(run(text, "general", { "mock-enterprise": false }).provider?.id).toBe("gemini");
    expect(run(text, "general", { "mock-enterprise": false, gemini: false })).toMatchObject({
      action: "block",
      blockReason: "NO_ELIGIBLE_PROVIDER",
    });
  });

  it("blocks by rule when content is blocked for every enabled provider, even with all healthy", () => {
    const d = run(`password=${fakeChars(ALNUM, 12)}!x`);
    expect(d).toMatchObject({ action: "block", blockReason: "BLOCKED_BY_RULE", ruleIds: ["R-CRED-01"] });
  });

  it("skips disabled providers", () => {
    const policy = structuredClone(SEED_POLICY);
    policy.providers[0]!.enabled = false;
    const d = run("hello", "general", {}, policy);
    expect(d.provider?.id).toBe("gemini");
    expect(d.candidates[0]!.status).toBe("disabled");
  });

  it("client names are blocked by rule for tiers 2 and 3, so with tier 1 disabled they are blocked by rule", () => {
    const policy = structuredClone(SEED_POLICY);
    policy.providers[0]!.enabled = false;
    const d = run("Update for Meridian Mining", "general", {}, policy);
    expect(d).toMatchObject({ action: "block", blockReason: "BLOCKED_BY_RULE", ruleIds: ["R-TERM-02"] });
  });

  it("takes the strictest per-finding action as the final action", () => {
    const d = run(`Meridian Mining, customer ${ID}`);
    expect(d.perFinding.map((p) => p.action)).toEqual(["tokenise", "redact"]);
    expect(d.action).toBe("tokenise");
  });

  it("follows the policy's routing order", () => {
    const policy = structuredClone(SEED_POLICY);
    policy.routing.order = ["groq", "gemini", "mock-enterprise"];
    expect(run("hello", "general", {}, policy).provider?.id).toBe("groq");
    expect(run("Reply to ops@example.com", "general", {}, policy).provider?.id).toBe("gemini");
  });
});
