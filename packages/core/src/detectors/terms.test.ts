import { describe, expect, it } from "vitest";
import type { TermEntry } from "../types.js";
import { ZWSP, run, spans } from "../fixtures.js";
import { termsDetector } from "./terms.js";

// Terms from the fictional seed policy (SPEC §7.2).
const TERMS: TermEntry[] = [
  { term: "Harbourview Clinic", aliases: ["Harbourview"], dataClass: "CLIENT_NAME" },
  { term: "Meridian Mining", dataClass: "CLIENT_NAME" },
  { term: "Project Fynbos", aliases: ["Fynbos"], dataClass: "PROJECT_CODENAME" },
  { term: "Project Baobab", dataClass: "PROJECT_CODENAME" },
];

describe("terms", () => {
  it("finds exact terms case-insensitively with the right data class", () => {
    const text = "Draft a note to MERIDIAN MINING about project baobab.";
    const findings = run(termsDetector, text, { terms: TERMS });
    expect(spans(text, findings)).toEqual(["MERIDIAN MINING", "project baobab"]);
    expect(findings.map((f) => f.dataClass)).toEqual(["CLIENT_NAME", "PROJECT_CODENAME"]);
    expect(findings.every((f) => f.confidence === "high")).toBe(true);
  });

  it("finds aliases, and prefers the longer full term when both match", () => {
    const text = "Harbourview Clinic called. Harbourview wants an update on Fynbos.";
    expect(spans(text, run(termsDetector, text, { terms: TERMS }))).toEqual([
      "Harbourview Clinic",
      "Harbourview",
      "Fynbos",
    ]);
  });

  it("matches a term split across a line break or extra spaces", () => {
    const text = "Re: Meridian\nMining and Project   Fynbos";
    expect(spans(text, run(termsDetector, text, { terms: TERMS }))).toEqual(["Meridian\nMining", "Project   Fynbos"]);
  });

  it("matches possessives and punctuation next to the term", () => {
    const text = "(Harbourview Clinic's budget)";
    expect(spans(text, run(termsDetector, text, { terms: TERMS }))).toEqual(["Harbourview Clinic"]);
  });

  it("sees through zero-width characters", () => {
    const text = `Fyn${ZWSP}bos status`;
    expect(spans(text, run(termsDetector, text, { terms: TERMS }))).toEqual([`Fyn${ZWSP}bos`]);
  });

  it("masks the term", () => {
    expect(run(termsDetector, "Fynbos", { terms: TERMS })[0]!.masked).toBe("F•••••");
  });

  describe("traps (must NOT fire)", () => {
    it.each([
      ["term inside another word", "The Fynbosch estate and Harbourviews hotel"],
      ["term glued to another word", "MeridianMining is a different company"],
      ["partial multi-word term", "Meridian is a line on a map"],
      ["no terms configured", "Harbourview Clinic"],
    ])("%s", (name, text) => {
      const ctx = name === "no terms configured" ? {} : { terms: TERMS };
      expect(run(termsDetector, text, ctx)).toEqual([]);
    });
  });
});
