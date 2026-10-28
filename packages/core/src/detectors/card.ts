// Payment card numbers: Luhn-valid and a known brand prefix/length (Visa, Mastercard, Amex).
import { luhnValid } from "../luhn.js";
import { maskMiddle } from "../mask.js";
import type { Finding } from "../types.js";
import { numericViews, scan, type Detector } from "./scan.js";

const CARD_DIGITS = /(?<!\d)\d{13,19}(?!\d)/g;

export function hasKnownCardPrefix(digits: string): boolean {
  const len = digits.length;
  const p2 = Number(digits.slice(0, 2));
  const p4 = Number(digits.slice(0, 4));
  if (digits.startsWith("4")) return len === 13 || len === 16 || len === 19; // Visa
  if (p2 >= 51 && p2 <= 55) return len === 16; // Mastercard
  if (p4 >= 2221 && p4 <= 2720) return len === 16; // Mastercard 2-series
  if (p2 === 34 || p2 === 37) return len === 15; // Amex
  return false;
}

export const cardDetector: Detector = {
  id: "card",
  detect(input) {
    const findings: Finding[] = [];
    for (const view of numericViews(input)) {
      for (const m of scan(view, CARD_DIGITS)) {
        if (!hasKnownCardPrefix(m.value) || !luhnValid(m.value)) continue;
        findings.push({
          detectorId: "card",
          dataClass: "CARD_NUMBER",
          start: m.start,
          end: m.end,
          confidence: "high",
          masked: maskMiddle(m.value, 4, 3),
        });
      }
    }
    return findings;
  },
};
