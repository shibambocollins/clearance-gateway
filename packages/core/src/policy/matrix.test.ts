// Policy matrix (SPEC §14.3): every role × data class × provider tier against the action the
// seed policy text calls for. Expected values are derived from the clauses, not from seed.ts.
import { describe, expect, it } from "vitest";
import { decideAction } from "../decide.js";
import { DATA_CLASS_IDS, type DataClassId } from "../types.js";
import { ROLE_IDS, type Action, type RoleId, type Tier } from "./schema.js";
import { SEED_POLICY } from "./seed.js";

function expectedAction(dc: DataClassId, role: RoleId, tier: Tier): Action {
  const hrEnterprise = role === "hr" && tier === 1;
  switch (dc) {
    case "SA_ID": // clauses 2 and 5
      return hrEnterprise ? "tokenise" : "redact";
    case "CARD_NUMBER": // clause 2
    case "BANK_ACCOUNT":
      return "redact";
    case "CREDENTIAL": // clause 3
      return "block";
    case "CLIENT_NAME": // clause 4
    case "PROJECT_CODENAME":
      return tier === 1 ? "tokenise" : "block";
    case "EMAIL": // clause 6
    case "PHONE":
      return hrEnterprise ? "allow" : "redact";
  }
}

const TIERS: Tier[] = [1, 2, 3];
const cases = DATA_CLASS_IDS.flatMap((dc) =>
  ROLE_IDS.flatMap((role) => TIERS.map((tier) => [dc, role, tier, expectedAction(dc, role, tier)] as const)),
);

describe("seed policy matrix", () => {
  it("covers 8 data classes × 4 roles × 3 tiers", () => {
    expect(cases).toHaveLength(96);
  });

  it.each(cases)("%s, role %s, tier %i → %s", (dc, role, tier, expected) => {
    const { action, ruleId } = decideAction(SEED_POLICY, dc, role, tier);
    expect(action).toBe(expected);
    // Every decision in the seed policy comes from an explicit rule, never a silent default.
    expect(ruleId).not.toBeNull();
  });
});
