import { describe, expect, it } from "vitest";
import { generateDataset } from "./generate.js";
import { regexOnlyDetect } from "./baseline.js";
import { detectionMetrics } from "./metrics.js";
import { TEMPLATES } from "./templates.js";

const dataset = generateDataset();

describe("Bench dataset", () => {
  it("has roughly 300 cases across all four categories and both splits", () => {
    expect(dataset.length).toBeGreaterThanOrEqual(280);
    expect(dataset.length).toBeLessThanOrEqual(340);
    for (const split of ["dev", "test"] as const)
      for (const category of ["clean", "sensitive", "evasion", "trap"] as const)
        expect(dataset.some((c) => c.split === split && c.category === category), `${split}/${category}`).toBe(true);
  });

  it("is template-disjoint: no template appears in both dev and test", () => {
    const dev = new Set(dataset.filter((c) => c.split === "dev").map((c) => c.template));
    const test = new Set(dataset.filter((c) => c.split === "test").map((c) => c.template));
    expect([...dev].filter((t) => test.has(t))).toEqual([]);
  });

  it("is deterministic for a seed and different for another seed", () => {
    expect(generateDataset()).toEqual(dataset);
    expect(generateDataset(1).map((c) => c.text)).not.toEqual(dataset.map((c) => c.text));
  });

  it("has unique template ids and case ids", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(new Set(dataset.map((c) => c.id)).size).toBe(dataset.length);
  });

  it("labels point at non-empty spans inside the text; clean and trap cases have no labels", () => {
    for (const c of dataset) {
      for (const l of c.labels) expect(c.text.slice(l.start, l.end).trim().length, c.id).toBeGreaterThan(0);
      if (c.category === "clean" || c.category === "trap") expect(c.labels, c.id).toEqual([]);
      else expect(c.labels.length, c.id).toBeGreaterThan(0);
    }
  });

  it("uses reserved domains for every email", () => {
    for (const c of dataset)
      for (const m of c.text.matchAll(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) expect(m[1], c.id).toMatch(/(^|\.)example\.(com|org)$/);
  });
});

describe("metrics", () => {
  it("score the regex-only baseline as worse than perfect on traps (sanity check)", () => {
    const m = detectionMetrics(dataset, (c) => regexOnlyDetect(c.text));
    expect(m.trapFalsePositives.rate).toBeGreaterThan(0);
  });
});
