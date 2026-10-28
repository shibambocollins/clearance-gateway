import { describe, expect, it } from "vitest";
import { ALNUM, fakeChars, run, spans } from "../fixtures.js";
import { credAssignDetector } from "./credAssign.js";

// Synthetic values assembled at runtime (see fixtures.ts).
const VALUE = fakeChars(ALNUM, 14) + "!7";

describe("cred_assign", () => {
  it.each([
    ["key=value", `password=${VALUE}`],
    ["spaces around =", `pwd = ${VALUE}`],
    ["env-style prefix", `DB_PASSWORD=${VALUE}`],
    ["YAML colon with a symbol or digit", `password: ${VALUE}`],
    ["double-quoted", `client_secret = "${VALUE}"`],
    ["single-quoted with spaces inside", `secret: '${VALUE} two words'`],
    ["JSON key", `{"api_key": "${VALUE}"}`],
    ["api-key spelling", `x-api-key=${VALUE}`],
    ["access token", `ACCESS_TOKEN=${VALUE}`],
    ["passwd", `passwd=${VALUE}`],
  ])("%s: reports only the value", (_name, text) => {
    const findings = run(credAssignDetector, text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ dataClass: "CREDENTIAL", confidence: "high", masked: "••••••••" });
    const [span] = spans(text, findings);
    expect(span).toContain(VALUE);
    expect(span).not.toMatch(/password|secret|key|token|pwd|[:="']/i);
  });

  describe("traps (must NOT fire)", () => {
    it.each([
      ["the word token in prose", "The token was spent at the arcade."],
      ["token: followed by ordinary words", "Token: refreshed every hour by the server"],
      ["password: plain lowercase word in prose", "Password: see the onboarding guide"],
      ["masked value", "password: ********"],
      ["env template", "api_key=${API_KEY}"],
      ["env lookup", "secret = process.env.SECRET"],
      ["our own redaction marker", "password=[REDACTED:CREDENTIAL]"],
      ["angle-bracket placeholder", "token: <your token here>"],
      ["your-key placeholder", "api_key=YOUR_API_KEY"],
      ["keyword inside a longer word", "tokenizer=bert-base-uncased"],
      ["value too short", "pwd=abc"],
      ["no assignment", "reset your password via the portal"],
    ])("%s", (_name, text) => {
      expect(run(credAssignDetector, text)).toEqual([]);
    });
  });
});
