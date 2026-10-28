import { canonicalise } from "../canonicalise.js";
import type { Confidence, DetectContext, Finding } from "../types.js";
import { bankAccountDetector } from "./bankAccount.js";
import { cardDetector } from "./card.js";
import { credAssignDetector } from "./credAssign.js";
import { credKnownDetector } from "./credKnown.js";
import { emailDetector } from "./email.js";
import { phoneZaDetector } from "./phoneZa.js";
import type { Detector } from "./scan.js";
import { termsDetector } from "./terms.js";
import { zaIdDetector } from "./zaId.js";

/** All detectors. Order is the final tie-break when two findings have equal confidence and length. */
export const DETECTORS: readonly Detector[] = [
  credKnownDetector,
  zaIdDetector, // before card: a 13-digit SA ID starting with 4 can also pass as a Visa number
  cardDetector,
  emailDetector,
  phoneZaDetector,
  credAssignDetector,
  termsDetector,
  bankAccountDetector,
];

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/**
 * Overlapping findings keep the higher-confidence one; on ties the longer span (SPEC §6),
 * then detector order. Duplicates from the two numeric views collapse here as well.
 */
export function resolveOverlaps(findings: Finding[], detectors: readonly Detector[] = DETECTORS): Finding[] {
  const order = new Map(detectors.map((d, i) => [d.id, i]));
  const ranked = [...findings].sort(
    (a, b) =>
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      b.end - b.start - (a.end - a.start) ||
      (order.get(a.detectorId) ?? 99) - (order.get(b.detectorId) ?? 99) ||
      a.start - b.start,
  );
  const kept: Finding[] = [];
  for (const finding of ranked) {
    if (kept.every((k) => finding.end <= k.start || finding.start >= k.end)) kept.push(finding);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Runs every detector on `text` and returns non-overlapping findings in original-text order. */
export function detect(text: string, ctx: DetectContext = {}): Finding[] {
  const input = canonicalise(text);
  return resolveOverlaps(DETECTORS.flatMap((d) => d.detect(input, ctx)));
}

export type { Detector };
