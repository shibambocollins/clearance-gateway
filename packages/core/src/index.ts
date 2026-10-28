// Clearance Gateway Engine. Pure TypeScript with no I/O, shared by the API, Bench and Lens.

export const CORE_VERSION = "0.2.0";

export interface CoreInfo {
  name: "Clearance Gateway Engine";
  version: string;
}

export function coreInfo(): CoreInfo {
  return { name: "Clearance Gateway Engine", version: CORE_VERSION };
}

export type { Confidence, DataClassId, DetectContext, Finding, TermEntry } from "./types.js";
export { canonicalise, toOriginalSpan, type Canonical, type TextView } from "./canonicalise.js";
export { luhnCheckDigit, luhnValid } from "./luhn.js";
export { DETECTORS, detect, resolveOverlaps, type Detector } from "./detectors/index.js";
export { isValidSaId } from "./detectors/zaId.js";
export { hasKnownCardPrefix } from "./detectors/card.js";
