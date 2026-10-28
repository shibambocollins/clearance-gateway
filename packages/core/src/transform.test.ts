import { describe, expect, it } from "vitest";
import type { FindingDecision } from "./decide.js";
import type { Action } from "./policy/schema.js";
import { transform } from "./transform.js";
import type { DataClassId } from "./types.js";

/** Builds decisions for the given substrings of `text` (first occurrence at or after the previous one). */
function decisions(text: string, items: [string, DataClassId, Action][]): FindingDecision[] {
  let from = 0;
  return items.map(([value, dataClass, action]) => {
    const start = text.indexOf(value, from);
    from = start + value.length;
    return {
      finding: { detectorId: "t", dataClass, start, end: start + value.length, confidence: "high", masked: "•" },
      action,
      ruleId: "R-T-01",
    };
  });
}

describe("transform", () => {
  it("redacts with a typed marker", () => {
    const text = "ID 8001015009087 please";
    const r = transform(text, decisions(text, [["8001015009087", "SA_ID", "redact"]]));
    expect(r.text).toBe("ID [REDACTED:SA_ID] please");
    expect(r.tokens).toEqual({});
  });

  it("tokenises with numbered placeholders per class, in reading order", () => {
    const text = "Meridian Mining and Harbourview Clinic on Project Fynbos";
    const r = transform(
      text,
      decisions(text, [
        ["Meridian Mining", "CLIENT_NAME", "tokenise"],
        ["Harbourview Clinic", "CLIENT_NAME", "tokenise"],
        ["Project Fynbos", "PROJECT_CODENAME", "tokenise"],
      ]),
    );
    expect(r.text).toBe("[CLIENT_NAME_1] and [CLIENT_NAME_2] on [PROJECT_CODENAME_1]");
    expect(r.tokens).toEqual({
      "[CLIENT_NAME_1]": "Meridian Mining",
      "[CLIENT_NAME_2]": "Harbourview Clinic",
      "[PROJECT_CODENAME_1]": "Project Fynbos",
    });
  });

  it("gives identical values the same placeholder, ignoring case and spacing", () => {
    const text = "Meridian Mining said MERIDIAN  MINING will pay";
    const r = transform(
      text,
      decisions(text, [
        ["Meridian Mining", "CLIENT_NAME", "tokenise"],
        ["MERIDIAN  MINING", "CLIENT_NAME", "tokenise"],
      ]),
    );
    expect(r.text).toBe("[CLIENT_NAME_1] said [CLIENT_NAME_1] will pay");
    expect(Object.keys(r.tokens)).toEqual(["[CLIENT_NAME_1]"]);
  });

  it("treats differently formatted copies of the same number as one value", () => {
    const text = "ID 800101 5009 087 (again: 8001015009087)";
    const r = transform(
      text,
      decisions(text, [
        ["800101 5009 087", "SA_ID", "tokenise"],
        ["8001015009087", "SA_ID", "tokenise"],
      ]),
    );
    expect(r.text).toBe("ID [SA_ID_1] (again: [SA_ID_1])");
  });

  it("leaves allowed findings untouched and keeps offsets right when mixing actions", () => {
    const text = "a@example.com, 8001015009087, Meridian Mining.";
    const r = transform(
      text,
      decisions(text, [
        ["a@example.com", "EMAIL", "allow"],
        ["8001015009087", "SA_ID", "redact"],
        ["Meridian Mining", "CLIENT_NAME", "tokenise"],
      ]),
    );
    expect(r.text).toBe("a@example.com, [REDACTED:SA_ID], [CLIENT_NAME_1].");
    expect(r.replacements.map((x) => x.action)).toEqual(["redact", "tokenise"]);
  });

  it("returns the text unchanged when nothing applies", () => {
    expect(transform("hello", []).text).toBe("hello");
  });
});
