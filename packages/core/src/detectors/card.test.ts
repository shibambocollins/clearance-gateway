import { describe, expect, it } from "vitest";
import { breakChecksum, cardNumber, evasionVariants, run, spans } from "../fixtures.js";
import { cardDetector, hasKnownCardPrefix } from "./card.js";

const VISA = cardNumber("4", 16);

describe("card", () => {
  it.each([
    ["Visa 16", cardNumber("4", 16)],
    ["Visa 13", cardNumber("4", 13)],
    ["Mastercard 51–55", cardNumber("53", 16)],
    ["Mastercard 2-series", cardNumber("2221", 16)],
    ["Mastercard 2720", cardNumber("2720", 16)],
    ["Amex 34", cardNumber("34", 15)],
    ["Amex 37", cardNumber("37", 15)],
  ])("finds %s", (_name, number) => {
    const text = `Card: ${number}`;
    const findings = run(cardDetector, text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ dataClass: "CARD_NUMBER", confidence: "high" });
    expect(spans(text, findings)).toEqual([number]);
  });

  it("masks all but the first 4 and last 3 digits", () => {
    const [finding] = run(cardDetector, VISA);
    expect(finding!.masked).toBe(`${VISA.slice(0, 4)}•••••••••${VISA.slice(13)}`);
  });

  describe("traps (must NOT fire)", () => {
    it("Luhn-failing 16-digit number", () => {
      expect(run(cardDetector, `Ref ${breakChecksum(VISA)}`)).toEqual([]);
    });

    it("Luhn-valid number with an unknown prefix", () => {
      expect(hasKnownCardPrefix(cardNumber("6011", 16))).toBe(false);
      expect(run(cardDetector, cardNumber("6011", 16))).toEqual([]);
      expect(run(cardDetector, cardNumber("2721", 16))).toEqual([]);
    });

    it("known prefix with the wrong length for the brand", () => {
      expect(run(cardDetector, cardNumber("53", 15))).toEqual([]);
      expect(run(cardDetector, cardNumber("37", 16))).toEqual([]);
    });

    it("card digits inside a longer digit run", () => {
      expect(run(cardDetector, `${VISA}12345`)).toEqual([]);
    });
  });

  describe("evasion", () => {
    it.each(evasionVariants(VISA))("%s", (_name, variant) => {
      const text = `pay with ${variant} today`;
      const findings = run(cardDetector, text);
      expect(findings).toHaveLength(1);
      expect(spans(text, findings)).toEqual([variant]);
    });
  });
});
