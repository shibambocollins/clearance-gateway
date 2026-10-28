import { maskEmail } from "../mask.js";
import { scan, type Detector } from "./scan.js";

// Runs on the canonical view, so fullwidth "＠" and zero-width characters are already normalised.
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9-])/g;

export const emailDetector: Detector = {
  id: "email",
  detect(input) {
    return scan(input.text, EMAIL).map((m) => ({
      detectorId: "email",
      dataClass: "EMAIL" as const,
      start: m.start,
      end: m.end,
      confidence: "high" as const,
      masked: maskEmail(m.value),
    }));
  },
};
