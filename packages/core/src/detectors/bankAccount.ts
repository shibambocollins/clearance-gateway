// Bank account numbers: a 7–11 digit run, reported ONLY when a banking context word is nearby.
// Without context, 7–11 digit numbers (order numbers, references) are far too common to flag.
import { maskMiddle } from "../mask.js";
import type { Finding } from "../types.js";
import { numericViews, scan, type Detector } from "./scan.js";

const ACCOUNT_DIGITS = /(?<!\d)\d{7,11}(?!\d)/g;
const CONTEXT_WINDOW = 40;
const CONTEXT_WORDS =
  /\b(?:account(?:\s+(?:number|no))?|acc|acct|a\/c|branch\s+code|fnb|absa|standard\s+bank|nedbank|capitec)\b/i;

export const bankAccountDetector: Detector = {
  id: "bank_account",
  detect(input) {
    const findings: Finding[] = [];
    for (const view of numericViews(input)) {
      for (const m of scan(view, ACCOUNT_DIGITS)) {
        const before = view.text.slice(Math.max(0, m.viewStart - CONTEXT_WINDOW), m.viewStart);
        const after = view.text.slice(m.viewEnd, m.viewEnd + CONTEXT_WINDOW);
        if (!CONTEXT_WORDS.test(before) && !CONTEXT_WORDS.test(after)) continue;
        findings.push({
          detectorId: "bank_account",
          dataClass: "BANK_ACCOUNT",
          start: m.start,
          end: m.end,
          confidence: "medium",
          masked: maskMiddle(m.value, 0, 3),
        });
      }
    }
    return findings;
  },
};
