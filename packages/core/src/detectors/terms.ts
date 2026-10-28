// Dictionary terms from the active policy (client names, project codenames): case-insensitive,
// whole words only, aliases included. Fuzzy matching is a COULD item and not built here.
import { maskTerm } from "../mask.js";
import type { Finding } from "../types.js";
import { scan, type Detector } from "./scan.js";

function termRegex(name: string): RegExp {
  const pattern = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu");
}

export const termsDetector: Detector = {
  id: "terms",
  detect(input, ctx) {
    const findings: Finding[] = [];
    for (const entry of ctx.terms ?? []) {
      for (const name of [entry.term, ...(entry.aliases ?? [])]) {
        if (name.trim().length === 0) continue;
        for (const m of scan(input.text, termRegex(name))) {
          findings.push({
            detectorId: "terms",
            dataClass: entry.dataClass,
            start: m.start,
            end: m.end,
            confidence: "high",
            masked: maskTerm(m.value),
          });
        }
      }
    }
    return findings;
  },
};
