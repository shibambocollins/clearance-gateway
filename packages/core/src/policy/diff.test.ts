import { describe, expect, it } from "vitest";
import { policyDiff } from "./diff.js";
import { SEED_POLICY } from "./seed.js";

const clone = () => structuredClone(SEED_POLICY);

describe("policyDiff", () => {
  it("finds no changes between identical policies", () => {
    expect(policyDiff(SEED_POLICY, clone())).toMatchObject({ cells: [], levels: [], looserCount: 0, stricterCount: 0 });
  });

  it("flags a weaker rule as looser, cell by cell", () => {
    const next = clone();
    next.rules.find((r) => r.id === "R-CRED-01")!.action = "redact";
    const diff = policyDiff(SEED_POLICY, next);
    expect(diff.cells).toHaveLength(12); // 4 roles × 3 tiers for CREDENTIAL
    expect(diff.cells.every((c) => c.dataClass === "CREDENTIAL" && c.from === "block" && c.to === "redact" && c.direction === "looser")).toBe(true);
    expect(diff.looserCount).toBe(12);
  });

  it("flags a stricter rule as stricter", () => {
    const next = clone();
    next.rules.find((r) => r.id === "R-CONTACT-03")!.action = "redact";
    const diff = policyDiff(SEED_POLICY, next);
    expect(diff.cells.map((c) => [c.dataClass, c.role, c.tier, c.direction])).toEqual([
      ["EMAIL", "hr", 1, "stricter"],
      ["PHONE", "hr", 1, "stricter"],
    ]);
    expect(diff.looserCount).toBe(0);
  });

  it("counts a lowered level and a removed term as loosening; an added term is not", () => {
    const next = clone();
    next.dataClasses.find((d) => d.id === "SA_ID")!.level = "internal";
    next.terms = next.terms.filter((t) => t.term !== "Meridian Mining");
    next.terms.push({ term: "Karoo Freight", dataClass: "CLIENT_NAME" });
    const diff = policyDiff(SEED_POLICY, next);
    expect(diff.levels).toEqual([{ dataClass: "SA_ID", from: "confidential", to: "internal", direction: "looser" }]);
    expect(diff.terms).toEqual({ added: ["karoo freight"], removed: ["meridian mining"] });
    expect(diff.looserCount).toBe(2);
  });
});
