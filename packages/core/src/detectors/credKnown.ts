// Known secret formats. Patterns follow the gitleaks default rules (config/gitleaks.toml,
// checked 2026-10-28; docs/decisions.md D-018). Runs on the canonical view, so zero-width
// characters inserted into a key do not hide it.
import { maskSecret } from "../mask.js";
import { scan, type Detector } from "./scan.js";

interface KnownFormat {
  name: string;
  regex: RegExp;
  /** Non-secret prefix shown in the masked preview. */
  preview: (value: string) => string;
}

const firstChars = (n: number) => (value: string) => value.slice(0, n);

const FORMATS: KnownFormat[] = [
  {
    name: "aws-access-key-id",
    regex: /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g,
    preview: firstChars(4),
  },
  { name: "github-token", regex: /\b(?:ghp|gho|ghu|ghs)_[0-9a-zA-Z]{36}\b/g, preview: firstChars(4) },
  { name: "github-fine-grained-pat", regex: /\bgithub_pat_\w{82}\b/g, preview: firstChars(11) },
  { name: "google-api-key", regex: /\bAIza[\w-]{35}(?![\w-])/g, preview: firstChars(4) },
  {
    name: "stripe-key",
    regex: /\b(?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99}\b/g,
    preview: (value) => value.slice(0, value.indexOf("_", 3) + 1),
  },
  { name: "slack-bot-token", regex: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g, preview: firstChars(5) },
  { name: "slack-user-token", regex: /\bxox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}/g, preview: firstChars(5) },
  {
    // The whole block is the finding, so the key body is redacted too. If the END line is
    // missing (a truncated paste), everything after the header is treated as key material.
    name: "private-key",
    regex: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----|$)/gi,
    preview: () => "-----BEGIN PRIVATE KEY-----",
  },
  {
    name: "jwt",
    regex: /\bey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9_-]{17,}\.(?:[a-zA-Z0-9_-]{10,}={0,2})?/g,
    preview: firstChars(3),
  },
];

export const credKnownDetector: Detector = {
  id: "cred_known",
  detect(input) {
    return FORMATS.flatMap((format) =>
      scan(input.text, format.regex).map((m) => ({
        detectorId: "cred_known",
        dataClass: "CREDENTIAL" as const,
        start: m.start,
        end: m.end,
        confidence: "high" as const,
        masked: maskSecret(format.preview(m.value)),
      })),
    );
  },
};
