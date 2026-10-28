// Prompt templates. A template is a sentence frame plus slot types; each one renders several
// samples with fresh synthetic values. The dev/test split is by TEMPLATE (see generate.ts).
import type { DataClassId, RoleId } from "@clearance-gateway/core";
import type { Rng } from "./rng.js";
import * as v from "./values.js";

export type Category = "clean" | "sensitive" | "evasion" | "trap";
export type Part = string | { value: string; dataClass: DataClassId };

export interface Template {
  id: string;
  category: Category;
  samples: number;
  role?: RoleId;
  evasion?: v.EvasionType;
  render(rng: Rng): Part[];
}

const s = (value: string, dataClass: DataClassId): Part => ({ value, dataClass });
const day = (rng: Rng) => rng.pick(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
const city = (rng: Rng) => rng.pick(["Durban", "Gqeberha", "Cape Town", "Johannesburg", "Polokwane"]);
const date = (rng: Rng) => `2026-11-${String(rng.int(1, 28)).padStart(2, "0")}`;

const CLEAN: Template[] = [
  { id: "clean-invite", category: "clean", samples: 6, render: (r) => [`Draft a short email inviting the ${r.pick(["dispatch", "fleet", "finance", "warehouse"])} team to the ${day(r)} planning session at ${r.int(8, 16)}:00 in room ${r.int(1, 6)}B.`] },
  { id: "clean-notes", category: "clean", samples: 6, render: (r) => [`Summarise these meeting notes in ${r.int(3, 7)} bullet points: we moved the route review to ${day(r)}, fuel spend is up ${r.int(2, 19)}.${r.int(0, 9)}% on Q${r.int(1, 4)}, and two trucks need tyres.`] },
  { id: "clean-sql", category: "clean", samples: 6, render: (r) => [`Write a SQL query that counts deliveries per depot for ${r.pick(["October", "November"])} 2026, grouped by route number, ordered by count.`] },
  { id: "clean-explain", category: "clean", samples: 6, render: (r) => [`Explain the difference between ${r.pick(["cross-docking and warehousing", "FTL and LTL freight", "FIFO and FEFO stock rotation"])} for a new logistics coordinator.`] },
  { id: "clean-rewrite", category: "clean", samples: 6, render: (r) => [`Rewrite this to sound friendlier: 'Your order INV-${r.digits(5)} will ship on ${date(r)}. Reference ticket #${r.int(10000, 99999)}.'`] },
  { id: "clean-checklist", category: "clean", samples: 6, render: (r) => [`Give me a checklist for onboarding a new driver at the ${city(r)} depot, based on version ${r.int(2, 5)}.${r.int(0, 9)}.${r.int(0, 20)} of the handbook.`] },
  { id: "clean-translate", category: "clean", samples: 6, render: (r) => [`Translate into isiZulu: 'The truck leaves at ${r.int(5, 9)}:30 and returns by ${r.int(14, 19)}:00 on ${day(r)}.'`] },
  { id: "clean-kpis", category: "clean", samples: 6, render: (r) => [`Create a table of ${r.int(4, 8)} warehouse KPIs with targets such as ${r.int(90, 99)}% on-time dispatch and ${r.int(1, 4)}% damage rate.`] },
  { id: "clean-code", category: "clean", samples: 6, render: (r) => [`Why does this return NaN? function total(items) { return items.reduce((a, b) => a + b.${r.pick(["qty", "weight", "price"])}, 0) }`] },
  { id: "clean-schedule", category: "clean", samples: 6, render: (r) => [`Plan a ${r.int(2, 5)}-day stock count at the ${city(r)} warehouse starting ${date(r)}, with ${r.int(3, 12)} staff per shift and ${r.int(1200, 9800)} pallets.`] },
];

const SENSITIVE: Template[] = [
  { id: "sens-id-complaint", category: "sensitive", samples: 6, render: (r) => [`Summarise this complaint: customer ${v.name(r)}, ID number `, s(v.saId(r), "SA_ID"), `, says the parcel never arrived.`] },
  { id: "sens-card-receipt", category: "sensitive", samples: 6, render: (r) => [`The client paid with card `, s(v.groupsOf4(v.card(r)), "CARD_NUMBER"), `; draft a receipt confirmation.`] },
  { id: "sens-bank-payment", category: "sensitive", samples: 6, render: (r) => [`Prepare a payment instruction: ${r.pick(v.BANKS)} account number `, s(v.bankAccount(r), "BANK_ACCOUNT"), `, reference ACME-${r.digits(4)}.`] },
  { id: "sens-email-followup", category: "sensitive", samples: 6, render: (r) => [`Write a follow-up to `, s(v.email(r), "EMAIL"), ` about the late delivery to ${city(r)}.`] },
  { id: "sens-phone-driver", category: "sensitive", samples: 6, render: (r) => [`Ask the driver to call the customer on `, s(v.phone(r), "PHONE"), ` before arrival.`] },
  { id: "sens-aws-key", category: "sensitive", samples: 6, render: (r) => [`Why does my upload script fail? aws_access_key_id=`, s(v.awsKeyId(r), "CREDENTIAL"), ` region=af-south-1`] },
  { id: "sens-github-token", category: "sensitive", samples: 6, render: (r) => [`My CI job printed this token, how do I rotate it: `, s(v.githubToken(r), "CREDENTIAL")] },
  { id: "sens-db-password", category: "sensitive", samples: 6, render: (r) => [`Debug this config:\nDB_HOST=db.internal\nDB_PASSWORD=`, s(v.password(r), "CREDENTIAL"), `\nDB_PORT=5432`] },
  { id: "sens-api-keys", category: "sensitive", samples: 6, render: (r) => [`Is it safe to put this key in the frontend? `, s(r.pick([v.stripeKey, v.googleKey, v.jwt])(r), "CREDENTIAL")] },
  { id: "sens-client-update", category: "sensitive", samples: 6, render: (r) => [`Write a status update for `, s(r.pick(v.CLIENTS), "CLIENT_NAME"), ` about the ${r.pick(["November", "December"])} delivery schedule.`] },
  { id: "sens-project-risks", category: "sensitive", samples: 6, render: (r) => [`List the top risks for `, s(r.pick(v.PROJECTS), "PROJECT_CODENAME"), ` before go-live.`] },
  { id: "sens-dispute", category: "sensitive", samples: 6, render: (r) => [`Customer ${v.name(r)} (`, s(v.email(r), "EMAIL"), `, `, s(v.phone(r), "PHONE"), `) disputes invoice INV-${r.digits(5)}.`] },
  { id: "sens-hr-leave", category: "sensitive", samples: 6, role: "hr", render: (r) => [`Draft a leave confirmation for employee ${v.name(r)}, ID `, s(v.saId(r), "SA_ID"), `, email `, s(v.email(r), "EMAIL"), `.`] },
  { id: "sens-finance-refund", category: "sensitive", samples: 6, role: "finance", render: (r) => [`Refund `, s(r.pick(v.CLIENTS), "CLIENT_NAME"), ` to their ${r.pick(v.BANKS)} account `, s(v.bankAccount(r), "BANK_ACCOUNT"), ` and confirm by email.`] },
  { id: "sens-slack-bot", category: "sensitive", samples: 6, role: "engineering", render: (r) => [`Our bot stopped posting, the token is `, s(v.slackToken(r), "CREDENTIAL"), `. What scopes does it need?`] },
  { id: "sens-card-phone", category: "sensitive", samples: 6, render: (r) => [`Card on file `, s(v.card(r), "CARD_NUMBER"), `, contact number `, s(v.phone(r), "PHONE"), `. Draft a payment reminder.`] },
];

const TRAPS: Template[] = [
  { id: "trap-order-13", category: "trap", samples: 5, render: (r) => [`Order ${v.saIdBadChecksum(r)} shipped today; draft a confirmation.`] },
  { id: "trap-batch-baddate", category: "trap", samples: 5, render: (r) => [`Batch code ${v.saIdBadDate(r)} failed inspection. Write a short incident note.`] },
  { id: "trap-tracking-luhnfail", category: "trap", samples: 5, render: (r) => [`Tracking number ${v.groupsOf4(v.cardBadLuhn(r))} is delayed. Apologise to the customer.`] },
  { id: "trap-shipment-unknownprefix", category: "trap", samples: 5, render: (r) => [`Shipment reference ${v.luhnValidUnknownPrefix(r)} arrived damaged. Draft a claim.`] },
  { id: "trap-call-ref", category: "trap", samples: 5, render: (r) => [`Call reference 00${r.digits(8)} was escalated. Summarise next steps.`] },
  { id: "trap-po-number", category: "trap", samples: 5, render: (r) => [`PO number ${r.int(1, 9)}${r.digits(r.int(6, 9))} was approved by procurement. Draft a thank-you note.`] },
  { id: "trap-token-prose", category: "trap", samples: 5, render: (r) => [r.pick(["The token budget for this model is about 8 thousand per request.", "Our password policy requires 12 characters and a symbol.", "Explain how secret rotation works for our API key process.", "The parking token machine at the depot is broken again."])] },
  { id: "trap-colon-prose", category: "trap", samples: 5, render: (r) => [r.pick(["Token: refreshed every hour by the scheduler.", "Password: see the onboarding guide on the intranet.", "Secret: the surprise farewell lunch is on Friday.", "API key: request one from the platform team."])] },
  { id: "trap-terms-inside-words", category: "trap", samples: 5, render: (r) => [r.pick(["We visited the Fynbosch estate and the baobabs at the botanical garden.", "Harbourview Clinical Trials is a different organisation.", "Meridian Road is closed; reroute the Mining Street deliveries.", "Project Baobabs was the old name of the gardening club."])] },
  { id: "trap-aws-prose", category: "trap", samples: 5, render: () => ["AWS access key IDs start with AKIA and are 20 characters long; how do we store them safely?"] },
  { id: "trap-email-like", category: "trap", samples: 5, render: (r) => [`Email the admin@localhost mailbox or ping @${r.pick(v.FIRST_NAMES).toLowerCase()} on chat.`] },
  { id: "trap-isbn", category: "trap", samples: 5, render: (r) => [`ISBN 978${r.digits(10)} is the warehouse safety handbook. Summarise chapter ${r.int(1, 9)}.`] },
  { id: "trap-stripe-prose", category: "trap", samples: 5, render: () => [`Use ${["sk", "_live_"].join("")} keys only in production and never in test scripts.`] },
  { id: "trap-short-codes", category: "trap", samples: 5, render: (r) => [`The depot extension is ${r.digits(4)} and the gate code is ${r.int(100000, 999999)}; add both to the visitor note.`] },
];

// Evasion: one template per (data class, evasion type), each with its own frame.
const EVASION_SOURCES: { key: string; dataClass: DataClassId; value: (r: Rng) => string; frame: [string, string]; types: v.EvasionType[] }[] = [
  { key: "id", dataClass: "SA_ID", value: v.saId, frame: ["Check the record for ID ", " and summarise the claim."], types: ["spaced", "dashed", "zero-width", "fullwidth", "line-break", "digits-as-words"] },
  { key: "card", dataClass: "CARD_NUMBER", value: v.card, frame: ["Customer paid with ", "; draft the receipt."], types: ["spaced", "dashed", "zero-width", "fullwidth", "line-break"] },
  { key: "phone", dataClass: "PHONE", value: v.phoneDigits, frame: ["Driver contact: ", ". Ask them to confirm the slot."], types: ["spaced", "zero-width", "fullwidth", "line-break"] },
  { key: "bank", dataClass: "BANK_ACCOUNT", value: v.bankAccount, frame: ["Pay the supplier into Nedbank account ", " by Friday."], types: ["spaced", "zero-width", "fullwidth"] },
  { key: "email", dataClass: "EMAIL", value: v.email, frame: ["Forward the invoice to ", " today."], types: ["zero-width", "fullwidth", "at-dot"] },
  { key: "aws", dataClass: "CREDENTIAL", value: v.awsKeyId, frame: ["Why is this access key rejected? ", ""], types: ["zero-width", "fullwidth", "line-break"] },
  { key: "client", dataClass: "CLIENT_NAME", value: (r) => r.pick(v.CLIENTS), frame: ["Draft a renewal offer for ", " with a 5% discount."], types: ["zero-width", "line-break", "fullwidth"] },
];

const EVASION: Template[] = EVASION_SOURCES.flatMap((src) =>
  src.types.map((type) => ({
    id: `evasion-${src.key}-${type}`,
    category: "evasion" as const,
    samples: 3,
    evasion: type,
    render: (r: Rng) => [src.frame[0], s(v.EVASIONS[type](src.value(r)), src.dataClass), src.frame[1]],
  })),
);

export const TEMPLATES: Template[] = [...CLEAN, ...SENSITIVE, ...EVASION, ...TRAPS];
