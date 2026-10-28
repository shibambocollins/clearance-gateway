// Ground truth from the seed policy TEXT (SPEC §7.2), written independently of seed.ts so the
// policy-matrix metric checks the compiled rules against the clauses.
import type { Action, DataClassId, RoleId, Tier } from "@clearance-gateway/core";

export function expectedSeedAction(dc: DataClassId, role: RoleId, tier: Tier): Action {
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
