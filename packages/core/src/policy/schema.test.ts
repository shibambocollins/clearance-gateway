import { describe, expect, it } from "vitest";
import { policySchema, type CompiledPolicy } from "./schema.js";
import { SEED_POLICY } from "./seed.js";

const clone = (): CompiledPolicy => structuredClone(SEED_POLICY);

function errorsOf(value: unknown): string[] {
  const result = policySchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("policySchema", () => {
  it("accepts the seed policy", () => {
    expect(errorsOf(SEED_POLICY)).toEqual([]);
  });

  it("requires every data class to have a level and default action", () => {
    const p = clone();
    p.dataClasses = p.dataClasses.filter((d) => d.id !== "CREDENTIAL");
    expect(errorsOf(p)).toContain("Data class CREDENTIAL needs a level and default action");
  });

  it("rejects unknown providers in the routing order", () => {
    const p = clone();
    p.routing.order.push("unknown-ai");
    expect(errorsOf(p)).toContain('Unknown provider "unknown-ai" in routing order');
  });

  it("rejects duplicate rule ids", () => {
    const p = clone();
    p.rules.push({ ...p.rules[0]! });
    expect(errorsOf(p)).toContain("Rule ids must be unique");
  });

  it("rejects actions, levels and roles outside the allowed enums", () => {
    const p = clone() as unknown as { rules: { action: string; match: { roles?: string[] } }[] };
    p.rules[0]!.action = "warn";
    p.rules[1]!.match.roles = ["admin"];
    expect(errorsOf(p).length).toBeGreaterThanOrEqual(2);
  });

  it("rejects unexpected keys (an LLM can't smuggle in extra behaviour)", () => {
    expect(errorsOf({ ...clone(), allowAllFor: ["ceo"] }).length).toBeGreaterThan(0);
  });

  it("rejects the only allowed no-provider behaviour being changed", () => {
    const p = clone() as unknown as { routing: { onNoEligibleProvider: string } };
    p.routing.onNoEligibleProvider = "allow";
    expect(errorsOf(p).length).toBeGreaterThan(0);
  });
});
