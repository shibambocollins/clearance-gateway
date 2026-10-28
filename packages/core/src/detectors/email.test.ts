import { describe, expect, it } from "vitest";
import { ZWSP, run, spans } from "../fixtures.js";
import { emailDetector } from "./email.js";

describe("email", () => {
  it.each(["thandi.mokoena@example.com", "ops+alerts@mail.example.org", "J_Smith-2@sub.example.co.za"])(
    "finds %s",
    (email) => {
      const text = `Please email ${email}.`;
      const findings = run(emailDetector, text);
      expect(findings[0]).toMatchObject({ dataClass: "EMAIL", confidence: "high" });
      expect(spans(text, findings)).toEqual([email]);
    },
  );

  it("masks the local part", () => {
    expect(run(emailDetector, "thandi@example.com")[0]!.masked).toBe("t•••@example.com");
  });

  describe("traps (must NOT fire)", () => {
    it.each([
      ["no top-level domain", "user@localhost"],
      ["social handle", "ping @thandi on chat"],
      ["bare domain", "see example.com for details"],
      ["numeric TLD", "admin@10.0.0.1"],
    ])("%s", (_name, text) => {
      expect(run(emailDetector, text)).toEqual([]);
    });
  });

  describe("evasion", () => {
    it("fullwidth @", () => {
      const text = "mail thandi＠example.com";
      expect(spans(text, run(emailDetector, text))).toEqual(["thandi＠example.com"]);
    });

    it("zero-width characters inside the address", () => {
      const text = `mail tha${ZWSP}ndi@exam${ZWSP}ple.com`;
      expect(spans(text, run(emailDetector, text))).toEqual([`tha${ZWSP}ndi@exam${ZWSP}ple.com`]);
    });
  });
});
