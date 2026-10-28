// Masked previews for findings. A preview must never contain the full value (CLAUDE.md rule 3).

const DOT = "•";

/** Keeps `keepStart` leading and `keepEnd` trailing characters, masks the rest. */
export function maskMiddle(value: string, keepStart: number, keepEnd: number): string {
  if (keepStart + keepEnd >= value.length) return DOT.repeat(value.length);
  return value.slice(0, keepStart) + DOT.repeat(value.length - keepStart - keepEnd) + value.slice(value.length - keepEnd);
}

/** Only the digits of a value, so separators and zero-width characters don't leak into previews. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function maskEmail(value: string): string {
  const at = value.lastIndexOf("@");
  return `${value.slice(0, 1)}${DOT.repeat(3)}${value.slice(at)}`;
}

/** Shows only a non-secret prefix (e.g. "AKIA") and a fixed-length mask that hides the length. */
export function maskSecret(prefix = ""): string {
  return prefix + DOT.repeat(8);
}

export function maskTerm(value: string): string {
  return value.slice(0, 1) + DOT.repeat(Math.max(3, value.length - 1));
}
