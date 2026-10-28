// Span-level scoring: a predicted span counts as a true positive if it overlaps a labelled span
// of the same class (each label matched at most once). Everything else is a FP or FN.
import { DATA_CLASS_IDS, type DataClassId } from "@clearance-gateway/core";
import type { Span } from "./baseline.js";
import type { Case } from "./generate.js";
import type { EvasionType } from "./values.js";

export interface ClassScore {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface DetectionMetrics {
  perClass: Record<DataClassId, ClassScore>;
  overall: ClassScore;
  evasion: { caught: number; total: number; rate: number | null; byType: Record<string, { caught: number; total: number }> };
  trapFalsePositives: { casesWithFinding: number; cases: number; rate: number | null };
  cleanFalsePositives: { casesWithFinding: number; cases: number; rate: number | null };
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
const round = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

function score(tp: number, fp: number, fn: number): ClassScore {
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  return { tp, fp, fn, precision: round(precision), recall: round(recall), f1: round(f1) };
}

export function matchCase(c: Case, predicted: Span[]): { matchedLabels: boolean[]; unmatchedPredictions: Span[] } {
  const used = new Set<number>();
  const matchedLabels = c.labels.map((label) => {
    const i = predicted.findIndex(
      (p, j) => !used.has(j) && p.dataClass === label.dataClass && p.start < label.end && label.start < p.end,
    );
    if (i >= 0) used.add(i);
    return i >= 0;
  });
  return { matchedLabels, unmatchedPredictions: predicted.filter((_, j) => !used.has(j)) };
}

export function detectionMetrics(cases: Case[], predict: (c: Case) => Span[]): DetectionMetrics {
  const counts = Object.fromEntries(DATA_CLASS_IDS.map((dc) => [dc, { tp: 0, fp: 0, fn: 0 }])) as Record<
    DataClassId,
    { tp: number; fp: number; fn: number }
  >;
  const evasion = { caught: 0, total: 0, byType: {} as Record<string, { caught: number; total: number }> };
  const traps = { casesWithFinding: 0, cases: 0 };
  const clean = { casesWithFinding: 0, cases: 0 };

  for (const c of cases) {
    const predicted = predict(c);
    const { matchedLabels, unmatchedPredictions } = matchCase(c, predicted);
    c.labels.forEach((label, i) => {
      if (matchedLabels[i]) counts[label.dataClass].tp++;
      else counts[label.dataClass].fn++;
    });
    for (const p of unmatchedPredictions) counts[p.dataClass].fp++;

    if (c.category === "evasion") {
      const type = (c.evasion ?? "unknown") as EvasionType;
      evasion.byType[type] ??= { caught: 0, total: 0 };
      for (const hit of matchedLabels) {
        evasion.total++;
        evasion.byType[type].total++;
        if (hit) {
          evasion.caught++;
          evasion.byType[type].caught++;
        }
      }
    }
    if (c.category === "trap") {
      traps.cases++;
      if (predicted.length > 0) traps.casesWithFinding++;
    }
    if (c.category === "clean") {
      clean.cases++;
      if (predicted.length > 0) clean.casesWithFinding++;
    }
  }

  const totals = Object.values(counts).reduce((a, b) => ({ tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn }), { tp: 0, fp: 0, fn: 0 });
  return {
    perClass: Object.fromEntries(DATA_CLASS_IDS.map((dc) => [dc, score(counts[dc].tp, counts[dc].fp, counts[dc].fn)])) as Record<
      DataClassId,
      ClassScore
    >,
    overall: score(totals.tp, totals.fp, totals.fn),
    evasion: { ...evasion, rate: round(ratio(evasion.caught, evasion.total)) },
    trapFalsePositives: { ...traps, rate: round(ratio(traps.casesWithFinding, traps.cases)) },
    cleanFalsePositives: { ...clean, rate: round(ratio(clean.casesWithFinding, clean.cases)) },
  };
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index]! * 1000) / 1000;
}

export { round };
