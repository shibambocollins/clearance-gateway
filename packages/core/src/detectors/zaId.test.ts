import { describe, expect, it } from "vitest";
import { breakChecksum, evasionVariants, run, saId, spans } from "../fixtures.js";
import { isValidSaId, zaIdDetector } from "./zaId.js";

const ID = saId("800101", "5009", "0");

describe("za_id", () => {
  it("finds a valid ID in a sentence with high confidence and original offsets", () => {
    const text = `Employee ID number ${ID} needs updating.`;
    const findings = run(zaIdDetector, text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ dataClass: "SA_ID", confidence: "high", detectorId: "za_id" });
    expect(spans(text, findings)).toEqual([ID]);
  });

  it("accepts citizenship digits 0, 1 and 2", () => {
    for (const c of ["0", "1", "2"]) expect(isValidSaId(saId("900215", "0123", c))).toBe(true);
  });

  it("accepts 29 February in a year divisible by 4 (including 00)", () => {
    expect(isValidSaId(saId("000229"))).toBe(true);
    expect(isValidSaId(saId("960229"))).toBe(true);
  });

  it("masks the value: never the full number", () => {
    const [finding] = run(zaIdDetector, ID);
    expect(finding!.masked).toBe(`${ID.slice(0, 4)}••••••${ID.slice(10)}`);
    expect(finding!.masked).not.toContain(ID);
  });

  describe("near-valid IDs (D-058)", () => {
    it("valid date and citizenship digit but a wrong check digit: LOW-confidence finding", () => {
      // A mistyped or deliberately altered ID still reveals a birth date, gender and citizenship.
      const altered = breakChecksum(ID);
      const findings = run(zaIdDetector, `Customer ID ${altered} called`);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ dataClass: "SA_ID", confidence: "low" });
      expect(findings[0]!.masked).not.toContain(altered);
    });

    it("evading by changing the last digit no longer works", () => {
      for (let d = 0; d <= 9; d++) {
        const variant = ID.slice(0, 12) + d;
        expect(run(zaIdDetector, variant).length, variant).toBe(1);
      }
    });
  });

  describe("traps (must NOT fire)", () => {
    it("13-digit number with a wrong check digit AND an impossible date", () => {
      expect(run(zaIdDetector, `Order ${breakChecksum(saId("801301"))} shipped`)).toEqual([]);
    });

    it("13-digit number with a wrong check digit AND citizenship digit 3", () => {
      expect(run(zaIdDetector, breakChecksum(saId("800101", "5009", "3")))).toEqual([]);
    });

    it.each([
      ["month 13", "801301"],
      ["day 00", "800100"],
      ["30 February", "800230"],
      ["29 February in a non-leap year", "810229"],
      ["31 April", "800431"],
    ])("invalid date: %s (even with a valid checksum)", (_name, yymmdd) => {
      expect(run(zaIdDetector, saId(yymmdd))).toEqual([]);
    });

    it("citizenship digit 3", () => {
      expect(run(zaIdDetector, saId("800101", "5009", "3"))).toEqual([]);
    });

    it("13 valid digits inside a longer digit run", () => {
      expect(run(zaIdDetector, `${ID}4`)).toEqual([]);
      expect(run(zaIdDetector, `9${ID}`)).toEqual([]);
    });
  });

  describe("evasion", () => {
    it.each(evasionVariants(ID))("%s", (_name, variant) => {
      const text = `ID: ${variant} (please check)`;
      const findings = run(zaIdDetector, text);
      expect(findings).toHaveLength(1);
      expect(spans(text, findings)).toEqual([variant]);
    });
  });
});
