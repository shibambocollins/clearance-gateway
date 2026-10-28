// South African phone numbers: +27 or 0, then 9 digits whose first digit is 1–8 (an area or
// mobile code). Mobile prefixes 6/7/8 are high confidence; landlines are medium.
import { maskMiddle } from "../mask.js";
import type { Finding } from "../types.js";
import { numericViews, scan, type Detector } from "./scan.js";

const PHONE = /(?<![\d+])(?:\+27|0)([1-8])\d{8}(?!\d)/g;

export const phoneZaDetector: Detector = {
  id: "phone_za",
  detect(input) {
    const findings: Finding[] = [];
    for (const view of numericViews(input)) {
      for (const m of scan(view, PHONE)) {
        const mobile = "678".includes(m.match[1]!);
        findings.push({
          detectorId: "phone_za",
          dataClass: "PHONE",
          start: m.start,
          end: m.end,
          confidence: mobile ? "high" : "medium",
          masked: maskMiddle(m.value, 3, 2),
        });
      }
    }
    return findings;
  },
};
