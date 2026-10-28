import { describe, expect, it } from "vitest";
import { evasionVariants, run, spans } from "../fixtures.js";
import { phoneZaDetector } from "./phoneZa.js";

describe("phone_za", () => {
  it.each([
    ["0825550123", "high"],
    ["+27825550123", "high"],
    ["+27 82 555 0123", "high"],
    ["082 555 0123", "high"],
    ["(082) 555-0123", "high"],
    ["0615550123", "high"],
    ["0115550123", "medium"],
    ["021 555 0123", "medium"],
  ])("finds %s with %s confidence", (number, confidence) => {
    const text = `Call me on ${number} after 5.`;
    const findings = run(phoneZaDetector, text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ dataClass: "PHONE", confidence });
    // Brackets are part of the number as written; the span starts at the first digit or "+".
    expect(text.slice(findings[0]!.start, findings[0]!.end)).toBe(number.replace(/^\(/, ""));
  });

  it("finds two numbers separated by a slash", () => {
    const text = "0825550123 / 0835550199";
    expect(spans(text, run(phoneZaDetector, text))).toEqual(["0825550123", "0835550199"]);
  });

  it("masks the middle digits", () => {
    expect(run(phoneZaDetector, "0825550123")[0]!.masked).toBe("082•••••23");
  });

  describe("traps (must NOT fire)", () => {
    it.each([
      ["second digit 0 (not an area or mobile code)", "Invoice 0012345678"],
      ["second digit 9", "Ref 0912345678"],
      ["too short (9 digits)", "082555012"],
      ["too long (11 digits)", "08255501234"],
      ["no leading 0 or +27", "Ticket 8255501234"],
      ["inside a longer digit run", "Order 120825550123"],
    ])("%s", (_name, text) => {
      expect(run(phoneZaDetector, text)).toEqual([]);
    });
  });

  describe("evasion", () => {
    it.each(evasionVariants("0825550123"))("%s", (_name, variant) => {
      const text = `phone ${variant} thanks`;
      expect(spans(text, run(phoneZaDetector, text))).toEqual([variant]);
    });
  });
});
