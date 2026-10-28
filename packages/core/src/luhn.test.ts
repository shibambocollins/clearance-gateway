import { describe, expect, it } from "vitest";
import { luhnCheckDigit, luhnValid } from "./luhn.js";

describe("luhn", () => {
  it("validates the standard Luhn example", () => {
    expect(luhnValid("79927398713")).toBe(true);
    expect(luhnValid("79927398710")).toBe(false);
  });

  it("computes the check digit", () => {
    expect(luhnCheckDigit("7992739871")).toBe("3");
  });

  it("rejects non-digits", () => {
    expect(luhnValid("7992 7398 713")).toBe(false);
    expect(luhnValid("")).toBe(false);
  });
});
