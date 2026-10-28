/** True if the digit string passes the Luhn (mod 10) checksum. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  return luhnSum(digits) % 10 === 0;
}

/** The check digit that makes `payload + digit` Luhn-valid. Used by tests and the Bench generator. */
export function luhnCheckDigit(payload: string): string {
  const sum = luhnSum(payload + "0");
  return String((10 - (sum % 10)) % 10);
}

function luhnSum(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum;
}
