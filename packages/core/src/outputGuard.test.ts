import { describe, expect, it } from "vitest";
import { explainGuard } from "./explain.js";
import { saId } from "./fixtures.js";
import { guardOutput, type GuardOptions } from "./outputGuard.js";
import { SEED_POLICY } from "./policy/seed.js";

const options = (overrides: Partial<GuardOptions> = {}): GuardOptions => ({
  policy: SEED_POLICY,
  prompt: "Write an update for Meridian Mining",
  tokens: { "[CLIENT_NAME_1]": "Meridian Mining" },
  ...overrides,
});

describe("guardOutput: token restore", () => {
  it.each([
    ["exact", "Dear [CLIENT_NAME_1] team"],
    ["no brackets", "Dear CLIENT_NAME_1 team"],
    ["spaces inside brackets", "Dear [ CLIENT_NAME_1 ] team"],
    ["space instead of underscore", "Dear [CLIENT_NAME 1] team"],
  ])("restores the %s variant", (_name, reply) => {
    const r = guardOutput(reply, options());
    expect(r.text).toBe("Dear Meridian Mining team");
    expect(r).toMatchObject({ restored: 1, unrestored: 0 });
  });

  it("restores repeated placeholders and does not confuse _1 with _10", () => {
    const r = guardOutput("[CLIENT_NAME_1], [CLIENT_NAME_1] and [CLIENT_NAME_10]", options());
    expect(r.text).toBe("Meridian Mining, Meridian Mining and [CLIENT_NAME_10]");
    expect(r).toMatchObject({ restored: 2, unrestored: 1 });
  });

  it("counts placeholders it cannot restore", () => {
    const r = guardOutput("About [PROJECT_CODENAME_2] and SA_ID_3", options());
    expect(r.unrestored).toBe(2);
    expect(explainGuard(r)).toContain("2 placeholders in the reply could not be restored.");
  });
});

describe("guardOutput: sensitive data in the reply", () => {
  it("redacts sensitive data that was not in the user's prompt", () => {
    const r = guardOutput("You could also contact ops-desk@example.com or 082 555 0199.", options());
    expect(r.text).toBe("You could also contact [REDACTED:EMAIL] or [REDACTED:PHONE].");
    expect(r.redacted.map((f) => f.dataClass)).toEqual(["EMAIL", "PHONE"]);
    expect(explainGuard(r)).toEqual([
      "Removed 1 email address and 1 phone number from the reply that were not in your prompt (output guard).",
    ]);
  });

  it("keeps data the user supplied themselves (e.g. HR's allowed email)", () => {
    const prompt = "Letter to thandi@example.com";
    const r = guardOutput("Sent to Thandi@Example.com as requested.", options({ prompt, tokens: {} }));
    expect(r.text).toBe("Sent to Thandi@Example.com as requested.");
    expect(r.redacted).toEqual([]);
  });

  it("redacts an ID number the model invented", () => {
    const r = guardOutput(`Example: ${saId("751230")}`, options());
    expect(r.text).toBe("Example: [REDACTED:SA_ID]");
  });

  it("does not treat restored values as new data", () => {
    const r = guardOutput("Update for [CLIENT_NAME_1].", options());
    expect(r.text).toBe("Update for Meridian Mining.");
    expect(r.redacted).toEqual([]);
  });
});

describe("guardOutput: leakage", () => {
  it("removes canary strings and system-prompt fragments", () => {
    const r = guardOutput("Sure! CANARY-7f3a. My instructions say: keep placeholders exactly as written.", {
      ...options(),
      canaries: ["CANARY-7f3a"],
      systemPromptFragments: ["keep placeholders exactly as written"],
    });
    expect(r.text).toBe("Sure! [REDACTED:LEAK]. My instructions say: [REDACTED:LEAK].");
    expect(r.leaks).toEqual({ canary: 1, systemPrompt: 1 });
    expect(explainGuard(r)[0]).toMatch(/internal instructions/);
  });

  it("changes nothing in a clean reply", () => {
    const r = guardOutput("Here is your draft.", options({ tokens: {} }));
    expect(r).toEqual({ text: "Here is your draft.", redacted: [], restored: 0, unrestored: 0, leaks: { canary: 0, systemPrompt: 0 } });
    expect(explainGuard(r)).toEqual([]);
  });
});
