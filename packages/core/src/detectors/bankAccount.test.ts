import { describe, expect, it } from "vitest";
import { ZWSP, fullwidth, run, spans } from "../fixtures.js";
import { bankAccountDetector } from "./bankAccount.js";

describe("bank_account", () => {
  it.each([
    ["FNB account number 62123456789", "62123456789"],
    ["Acc: 1234567 at Nedbank", "1234567"],
    ["Pay into acct 40987654321 please", "40987654321"],
    ["1029384756 (Capitec savings)", "1029384756"],
    ["Standard Bank, branch code 051001, account 0123456789", "0123456789"],
    ["Absa a/c 4081234567", "4081234567"],
  ])("finds the account in %j", (text, expected) => {
    const findings = run(bankAccountDetector, text);
    expect(spans(text, findings)).toContain(expected);
    expect(findings.every((f) => f.dataClass === "BANK_ACCOUNT" && f.confidence === "medium")).toBe(true);
  });

  it("masks all but the last 3 digits", () => {
    const [finding] = run(bankAccountDetector, "account 62123456789");
    expect(finding!.masked).toBe("••••••••789");
  });

  describe("traps (must NOT fire)", () => {
    it.each([
      ["no banking context", "Order 1234567 shipped on Tuesday"],
      ["context word inside another word", "We accepted order 1234567 yesterday"],
      ["context too far away", `Account manager: Thandi. ${"x".repeat(45)} Ticket 7654321`],
      ["too short (6 digits, e.g. a branch code alone)", "FNB branch code 250655"],
      ["too long (12 digits)", "account 123456789012"],
    ])("%s", (_name, text) => {
      expect(run(bankAccountDetector, text)).toEqual([]);
    });
  });

  describe("evasion", () => {
    it.each([
      ["spaced groups", "6212 3456 789"],
      ["dashed groups", "6212-3456-789"],
      ["zero-width", `6212${ZWSP}3456${ZWSP}789`],
      ["fullwidth", fullwidth("62123456789")],
      ["line break", "62123\n456789"],
    ])("%s", (_name, variant) => {
      const text = `FNB account ${variant}`;
      expect(spans(text, run(bankAccountDetector, text))).toEqual([variant]);
    });
  });
});
