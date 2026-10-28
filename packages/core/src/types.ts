export const DATA_CLASS_IDS = [
  "SA_ID",
  "CARD_NUMBER",
  "BANK_ACCOUNT",
  "EMAIL",
  "PHONE",
  "CREDENTIAL",
  "CLIENT_NAME",
  "PROJECT_CODENAME",
] as const;
export type DataClassId = (typeof DATA_CLASS_IDS)[number];

export type Confidence = "high" | "medium" | "low";

export interface Finding {
  detectorId: string;
  dataClass: DataClassId;
  /** Offsets in the ORIGINAL text (end exclusive). */
  start: number;
  end: number;
  confidence: Confidence;
  /** Safe preview, e.g. "8001••••••087". Never the full value. */
  masked: string;
}

/** A dictionary term from the active policy (SPEC §7.1). */
export interface TermEntry {
  term: string;
  aliases?: string[];
  dataClass: "CLIENT_NAME" | "PROJECT_CODENAME";
}

export interface DetectContext {
  terms?: TermEntry[];
}
