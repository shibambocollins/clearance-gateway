// The six one-click sample prompts (SPEC §12). Synthetic data only: the people and companies are
// fictional, emails use example.com, and the ID numbers are generated to pass validation.
import { luhnCheckDigit } from "./luhn.js";
import type { RoleId } from "./policy/schema.js";

const withCheckDigit = (payload: string) => payload + luhnCheckDigit(payload);

// AWS's documented example key ID, assembled from parts so no secret-shaped literal sits in the
// repo (docs/decisions.md D-021).
const EXAMPLE_AWS_KEY_ID = ["AKIA", "IOSFODNN7", "EXAMPLE"].join("");

export interface SamplePrompt {
  id: "clean" | "id-number" | "api-key" | "client-name" | "hr-case" | "outage-case";
  label: string;
  role: RoleId;
  text: string;
  /** What the demo is meant to show (for the UI and docs). */
  shows: string;
}

export const SAMPLE_PROMPTS: SamplePrompt[] = [
  {
    id: "clean",
    label: "Clean",
    role: "general",
    text: "Draft a short, friendly email inviting the logistics team to Friday's planning session at 10:00 in the boardroom.",
    shows: "Nothing sensitive: sent as is.",
  },
  {
    id: "id-number",
    label: "ID number",
    role: "general",
    text: `Summarise this complaint: the customer with ID number ${withCheckDigit("800101500908")} says her delivery arrived three days late.`,
    shows: "The ID number is removed before sending (R-PII-01).",
  },
  {
    id: "api-key",
    label: "API key",
    role: "engineering",
    text: `My deploy script fails with an auth error. Config: aws_access_key_id = ${EXAMPLE_AWS_KEY_ID}, region af-south-1. What's wrong?`,
    shows: "Credentials are never sent: the request is blocked with coaching (R-CRED-01).",
  },
  {
    id: "client-name",
    label: "Client name",
    role: "general",
    text: "Write a short status update for Meridian Mining about the Project Fynbos delivery schedule.",
    shows: "Client and project names are pseudonymised for the approved enterprise AI only (R-TERM-01).",
  },
  {
    id: "hr-case",
    label: "HR case",
    role: "hr",
    text: `Draft a letter to employee Thandi Mokoena (ID ${withCheckDigit("920220480008")}, thandi.mokoena@example.com) confirming her leave dates.`,
    shows: "HR with the enterprise provider: the ID is pseudonymised (R-HR-01) and the email is allowed (R-CONTACT-03).",
  },
  {
    id: "outage-case",
    label: "Outage case",
    role: "finance",
    text: "Prepare a payment reminder for Harbourview Clinic: invoice INV-2291 is overdue, pay into FNB account 62123456789.",
    shows: "Confidential data: with the tier-1 provider down, the request is blocked (fail closed, R-ROUTE-01).",
  },
];
