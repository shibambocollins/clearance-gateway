// Decision-level diff between two compiled policies: what would change for each role × data
// class × provider tier, and whether the change is LOOSER (less protection) or stricter.
// Used by the admin review screen and the compiler check (looser than golden = critical).
import { decideAction } from "../decide.js";
import { DATA_CLASS_IDS, type DataClassId } from "../types.js";
import { ROLE_IDS, actionRank, levelRank, type Action, type CompiledPolicy, type Level, type RoleId, type Tier } from "./schema.js";

export interface CellChange {
  dataClass: DataClassId;
  role: RoleId;
  tier: Tier;
  from: Action;
  to: Action;
  direction: "looser" | "stricter";
}

export interface LevelChange {
  dataClass: DataClassId;
  from: Level;
  to: Level;
  direction: "looser" | "stricter";
}

export interface PolicyDiff {
  cells: CellChange[];
  levels: LevelChange[];
  terms: { added: string[]; removed: string[] };
  looserCount: number;
  stricterCount: number;
}

const TIERS: Tier[] = [1, 2, 3];
const termKey = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/** Terms (and aliases) as a lowercase set. */
function termSet(policy: CompiledPolicy): Set<string> {
  return new Set(policy.terms.flatMap((t) => [t.term, ...(t.aliases ?? [])]).map(termKey));
}

export function policyDiff(base: CompiledPolicy, next: CompiledPolicy): PolicyDiff {
  const cells: CellChange[] = [];
  for (const dataClass of DATA_CLASS_IDS)
    for (const role of ROLE_IDS)
      for (const tier of TIERS) {
        const from = decideAction(base, dataClass, role, tier).action;
        const to = decideAction(next, dataClass, role, tier).action;
        if (from !== to) {
          cells.push({ dataClass, role, tier, from, to, direction: actionRank(to) < actionRank(from) ? "looser" : "stricter" });
        }
      }

  const levels: LevelChange[] = [];
  for (const dataClass of DATA_CLASS_IDS) {
    const from = base.dataClasses.find((d) => d.id === dataClass)?.level;
    const to = next.dataClasses.find((d) => d.id === dataClass)?.level;
    if (from && to && from !== to) {
      levels.push({ dataClass, from, to, direction: levelRank(to) < levelRank(from) ? "looser" : "stricter" });
    }
  }

  const baseTerms = termSet(base);
  const nextTerms = termSet(next);
  const terms = {
    added: [...nextTerms].filter((t) => !baseTerms.has(t)),
    removed: [...baseTerms].filter((t) => !nextTerms.has(t)),
  };

  // Removing a protected term or lowering a level is a loosening too.
  const looserCount =
    cells.filter((c) => c.direction === "looser").length +
    levels.filter((l) => l.direction === "looser").length +
    terms.removed.length;
  const stricterCount =
    cells.filter((c) => c.direction === "stricter").length + levels.filter((l) => l.direction === "stricter").length;
  return { cells, levels, terms, looserCount, stricterCount };
}
