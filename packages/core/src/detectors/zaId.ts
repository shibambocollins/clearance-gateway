// South African ID number: YYMMDD SSSS C A Z (13 digits).
// C (citizenship) is 0 citizen, 1 permanent resident, 2 refugee; Z is a Luhn check digit.
// Structure verified against Wikipedia "South African identity card" (docs/decisions.md D-017).
// A valid check digit gives a high-confidence finding. A valid date and citizenship digit with a
// WRONG check digit gives a low-confidence finding: a mistyped or deliberately altered ID still
// reveals a birth date, gender and citizenship (D-058).
import { luhnValid } from "../luhn.js";
import { maskMiddle } from "../mask.js";
import type { Finding } from "../types.js";
import { numericViews, scan, type Detector } from "./scan.js";

const THIRTEEN_DIGITS = /(?<!\d)\d{13}(?!\d)/g;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Date and citizenship digit are plausible; the check digit is not considered. */
export function hasSaIdStructure(digits: string): boolean {
  return /^\d{13}$/.test(digits) && isValidYymmdd(digits.slice(0, 6)) && "012".includes(digits[10]!);
}

export function isValidSaId(digits: string): boolean {
  return hasSaIdStructure(digits) && luhnValid(digits);
}

function isValidYymmdd(yymmdd: string): boolean {
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1) return false;
  // The century is unknown, but 1900 is the only non-leap year with yy % 4 === 0 and 2000 is a
  // leap year, so yy % 4 === 0 is a safe leap-year test for "00".."99".
  const maxDay = mm === 2 && yy % 4 !== 0 ? 28 : DAYS_IN_MONTH[mm - 1]!;
  return dd <= maxDay;
}

export const zaIdDetector: Detector = {
  id: "za_id",
  detect(input) {
    const findings: Finding[] = [];
    for (const view of numericViews(input)) {
      for (const m of scan(view, THIRTEEN_DIGITS)) {
        if (!hasSaIdStructure(m.value)) continue;
        findings.push({
          detectorId: "za_id",
          dataClass: "SA_ID",
          start: m.start,
          end: m.end,
          confidence: luhnValid(m.value) ? "high" : "low",
          masked: maskMiddle(m.value, 4, 3),
        });
      }
    }
    return findings;
  },
};
