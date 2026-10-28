// Synthetic test data builders (tests only; excluded from the build). Never real personal data.
// Fake secrets are assembled at runtime so no secret-shaped literal sits in the repo for gitleaks.
import { canonicalise } from "./canonicalise.js";
import { resolveOverlaps, type Detector } from "./detectors/index.js";
import { luhnCheckDigit } from "./luhn.js";
import type { DetectContext, Finding } from "./types.js";

export const ZWSP = "​";

/** Runs one detector the way detect() does (both views, overlaps resolved). */
export function run(detector: Detector, text: string, ctx: DetectContext = {}): Finding[] {
  return resolveOverlaps(detector.detect(canonicalise(text), ctx));
}

/** The original substrings a list of findings covers. */
export function spans(text: string, findings: Finding[]): string[] {
  return findings.map((f) => text.slice(f.start, f.end));
}

/** Evasion variants of a digit string (SPEC §5 and §14.1). */
export function evasionVariants(digits: string): [string, string][] {
  return [
    ["spaced digits", digits.split("").join(" ")],
    ["grouped with spaces", digits.replace(/(\d{4})(?=\d)/g, "$1 ")],
    ["dashed groups", digits.replace(/(\d{4})(?=\d)/g, "$1-")],
    ["zero-width between digits", digits.split("").join(ZWSP)],
    ["fullwidth digits", fullwidth(digits)],
    ["line break inside", `${digits.slice(0, 6)}\n${digits.slice(6)}`],
  ];
}

/** A valid synthetic SA ID: YYMMDD SSSS C A + Luhn check digit. */
export function saId(yymmdd = "800101", seq = "5009", citizen = "0", a = "8"): string {
  const payload = yymmdd + seq + citizen + a;
  return payload + luhnCheckDigit(payload);
}

/** A Luhn-valid synthetic card number with the given prefix and total length. */
export function cardNumber(prefix: string, length: number): string {
  let payload = prefix;
  for (let i = 0; payload.length < length - 1; i++) payload += String((i * 7 + 3) % 10);
  return payload + luhnCheckDigit(payload);
}

/** Same digits with the last one changed, so the Luhn check fails. */
export function breakChecksum(digits: string): string {
  const last = Number(digits[digits.length - 1]);
  return digits.slice(0, -1) + String((last + 1) % 10);
}

/** Converts ASCII digits to fullwidth digits (U+FF10–U+FF19). */
export function fullwidth(value: string): string {
  return value.replace(/[0-9]/g, (d) => String.fromCharCode(0xff10 + Number(d)));
}

/** Deterministic pseudo-random characters from an alphabet. */
export function fakeChars(alphabet: string, length: number, seed = 1): string {
  let out = "";
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out += alphabet[state % alphabet.length];
  }
  return out;
}

export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const BASE32_UPPER = UPPER + "234567";
export const ALNUM = UPPER + "abcdefghijklmnopqrstuvwxyz0123456789";
export const BASE64URL = ALNUM + "_-";
