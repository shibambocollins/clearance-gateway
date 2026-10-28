// Configuration B: "regex-only" (SPEC §14.2). Typical DLP-style patterns WITHOUT validators
// (no Luhn, no date check), WITHOUT canonicalisation and WITHOUT context gating. It is a fair,
// common baseline, not a straw man: the patterns accept the usual separators people type.
import type { DataClassId } from "@clearance-gateway/core";

export interface Span {
  dataClass: DataClassId;
  start: number;
  end: number;
}

const PATTERNS: [DataClassId, RegExp][] = [
  ["SA_ID", /\b\d{13}\b/g],
  ["CARD_NUMBER", /\b(?:\d[ -]?){12,18}\d\b/g],
  ["BANK_ACCOUNT", /\b\d{7,11}\b/g],
  ["EMAIL", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ["PHONE", /(?:\+27|\b0)\s?\d{2}\s?\d{3}\s?\d{4}\b/g],
  ["CREDENTIAL", /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[0-9A-Za-z]{36}|sk_(?:live|test)_[0-9A-Za-z]{10,}|xox[bp]-[0-9A-Za-z-]{10,}|AIza[0-9A-Za-z_-]{35}|eyJ[\w-]+\.[\w-]+\.[\w-]*)/g],
  ["CREDENTIAL", /(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi],
];

const TERMS: [DataClassId, RegExp][] = [
  ["CLIENT_NAME", /harbourview clinic|meridian mining/gi],
  ["PROJECT_CODENAME", /project fynbos|project baobab/gi],
];

export function regexOnlyDetect(text: string): Span[] {
  const spans: Span[] = [];
  for (const [dataClass, regex] of [...PATTERNS, ...TERMS]) {
    for (const m of text.matchAll(regex)) spans.push({ dataClass, start: m.index, end: m.index + m[0].length });
  }
  return spans;
}
