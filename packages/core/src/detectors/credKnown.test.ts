import { describe, expect, it } from "vitest";
import { ALNUM, BASE32_UPPER, BASE64URL, ZWSP, fakeChars, run, spans } from "../fixtures.js";
import { credKnownDetector } from "./credKnown.js";

// Synthetic secrets assembled at runtime (see fixtures.ts). None of these are real.
const DIGITS = "0123456789";
const pemType = "RSA PRIVATE KEY";
const pem = [
  `-----BEGIN ${pemType}-----`,
  fakeChars(BASE64URL, 64, 7),
  fakeChars(BASE64URL, 64, 8),
  `-----END ${pemType}-----`,
].join("\n");

const SAMPLES: [string, string, string][] = [
  ["AWS access key ID", "AKIA" + fakeChars(BASE32_UPPER, 16), "AKIA••••••••"],
  ["AWS temporary key ID", "ASIA" + fakeChars(BASE32_UPPER, 16, 2), "ASIA••••••••"],
  ["GitHub PAT", "ghp" + "_" + fakeChars(ALNUM, 36), "ghp_••••••••"],
  ["GitHub OAuth token", "gho" + "_" + fakeChars(ALNUM, 36, 3), "gho_••••••••"],
  ["GitHub app token", "ghs" + "_" + fakeChars(ALNUM, 36, 4), "ghs_••••••••"],
  ["GitHub fine-grained PAT", "github" + "_pat_" + fakeChars(ALNUM + "_", 82), "github_pat_••••••••"],
  ["Google API key", "AIza" + fakeChars(BASE64URL, 35), "AIza••••••••"],
  ["Stripe live key", "sk" + "_live_" + fakeChars(ALNUM, 24), "sk_live_••••••••"],
  ["Stripe test key", "sk" + "_test_" + fakeChars(ALNUM, 24, 5), "sk_test_••••••••"],
  [
    "Slack bot token",
    "xoxb" + "-" + fakeChars(DIGITS, 12) + "-" + fakeChars(DIGITS, 12, 2) + "-" + fakeChars(ALNUM, 24),
    "xoxb-••••••••",
  ],
  [
    "Slack user token",
    "xoxp" + "-" + [1, 2, 3].map((s) => fakeChars(DIGITS, 12, s)).join("-") + "-" + fakeChars(ALNUM, 32),
    "xoxp-••••••••",
  ],
  ["PEM private key block", pem, "-----BEGIN PRIVATE KEY-----••••••••"],
  [
    "JWT",
    "eyJ" + fakeChars(ALNUM, 20) + ".eyJ" + fakeChars(BASE64URL, 30, 2) + "." + fakeChars(BASE64URL, 43, 3),
    "eyJ••••••••",
  ],
];

describe("cred_known", () => {
  it.each(SAMPLES)("finds a %s", (_name, secret, masked) => {
    const text = `config:\n  value: ${secret}\nend`;
    const findings = run(credKnownDetector, text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ dataClass: "CREDENTIAL", confidence: "high", masked });
    expect(spans(text, findings)).toEqual([secret]);
  });

  it("redacts the rest of the text after a PEM header with no END line (truncated paste)", () => {
    const body = fakeChars(BASE64URL, 80, 9);
    const text = `here: -----BEGIN ${pemType}-----\n${body}`;
    expect(spans(text, run(credKnownDetector, text))).toEqual([text.slice(6)]);
  });

  it("previews never contain the secret", () => {
    for (const [, secret] of SAMPLES) {
      for (const f of run(credKnownDetector, secret)) expect(f.masked.length).toBeLessThan(secret.length);
    }
  });

  describe("traps (must NOT fire)", () => {
    it.each([
      ["prefix mentioned in prose", "AWS key IDs start with AKIA and are 20 characters long"],
      ["too-short GitHub token", "ghp" + "_" + fakeChars(ALNUM, 20)],
      ["AWS-like ID with lowercase", "AKIA" + fakeChars(BASE32_UPPER, 15).toLowerCase() + "x"],
      ["Stripe prefix without a key", "use sk" + "_live_ keys only in production"],
      ["PEM public key", "-----BEGIN PUBLIC KEY-----\n" + fakeChars(BASE64URL, 64) + "\n-----END PUBLIC KEY-----"],
      ["the word eyJ in prose", "a token starts with eyJ usually"],
    ])("%s", (_name, text) => {
      expect(run(credKnownDetector, text)).toEqual([]);
    });
  });

  describe("evasion", () => {
    it("zero-width characters inside an AWS key ID", () => {
      const key = "AKIA" + fakeChars(BASE32_UPPER, 16, 11);
      const evaded = key.slice(0, 8) + ZWSP + key.slice(8);
      const text = `key=${evaded}`;
      expect(spans(text, run(credKnownDetector, text))).toEqual([evaded]);
    });
  });
});
