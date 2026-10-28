import { describe, expect, it } from "vitest";
import { canonicalise, toOriginalSpan } from "./canonicalise.js";
import { ZWSP, fullwidth } from "./fixtures.js";

/** Original text covered by a view span. */
function originalOf(text: string, view: "text" | "digits", needle: string): string {
  const c = canonicalise(text);
  const v = c[view];
  const at = v.text.indexOf(needle);
  expect(at, `"${needle}" not found in ${view} view: ${JSON.stringify(v.text)}`).toBeGreaterThanOrEqual(0);
  const span = toOriginalSpan(v, at, at + needle.length);
  return text.slice(span.start, span.end);
}

describe("canonicalise: text view", () => {
  it("folds fullwidth digits with NFKC", () => {
    expect(canonicalise(fullwidth("ID 8001015009087")).text.text).toBe("ID 8001015009087");
  });

  it("removes zero-width characters (U+200B–U+200D, U+2060, U+FEFF)", () => {
    const text = `80${ZWSP}01‌01‍50⁠09﻿087`;
    expect(canonicalise(text).text.text).toBe("8001015009087");
  });

  it("maps canonical spans back to the original text, including removed characters", () => {
    const text = `Call 08${ZWSP}2 555 0123 now`;
    expect(originalOf(text, "text", "082")).toBe(`08${ZWSP}2`);
  });

  it("maps fullwidth characters back to the original fullwidth span", () => {
    const text = `x ${fullwidth("123")} y`;
    expect(originalOf(text, "text", "123")).toBe(fullwidth("123"));
  });

  it("keeps surrogate pairs intact in the map", () => {
    const text = "😀 a@example.com";
    expect(originalOf(text, "text", "a@example.com")).toBe("a@example.com");
  });
});

describe("canonicalise: digits view", () => {
  it.each([
    ["spaced digits", "8 0 0 1 0 1 5 0 0 9 0 8 7"],
    ["dashed digits", "800101-5009-087"],
    ["dotted and slashed digits", "800.101/5009.087"],
    ["line break inside a number", "800101\n5009087"],
    ["CRLF inside a number", "800101\r\n5009087"],
    ["unicode dashes", "800101–5009—087"],
    ["zero-width and spaces mixed", `8001${ZWSP}01 5009 087`],
    ["fullwidth with spaces", fullwidth("800101 5009 087")],
  ])("collapses %s", (_name, text) => {
    expect(canonicalise(text).digits.text).toBe("8001015009087");
  });

  it("maps a collapsed number back to the full original span, separators included", () => {
    const text = "My ID is 800101 5009 087, thanks";
    expect(originalOf(text, "digits", "8001015009087")).toBe("800101 5009 087");
  });

  it("does not join digits across long separator runs or non-separators", () => {
    expect(canonicalise("12    34").digits.text).toBe("12    34");
    expect(canonicalise("12, 34").digits.text).toBe("12, 34");
    expect(canonicalise("12 and 34").digits.text).toBe("12 and 34");
  });

  it("leaves separators that are not between digits", () => {
    expect(canonicalise("a - b. 12 -x").digits.text).toBe("a - b. 12 -x");
  });
});
