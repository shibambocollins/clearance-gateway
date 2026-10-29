// Seeded policy for the fictional "Acme Demo Logistics" (SPEC §7.2). Hand-written compiled form of
// SEED_POLICY_TEXT; also the golden expected output for the compiler check (SPEC §14.6).
//
// How the clauses map to rules, given that the strictest matching action wins
// (block > tokenise > redact > allow):
// - Exceptions ("except for HR using the approved enterprise provider") are encoded by narrowing
//   the general rule's roles/tiers, so the exception's more permissive action can apply.
// - Clause 7 is the router's fail-closed behaviour (routing.onNoEligibleProvider, rule R-ROUTE-01).
// - Clause 8 is `coaching: true`: every blocked or modified request is explained.
import type { CompiledPolicy } from "./schema.js";

export const SEED_POLICY_TEXT = `Acme Demo Logistics (fictional) – AI Use Policy v1
1. Staff may use approved AI assistants for drafting, summarising and coding help.
2. Never send South African ID numbers, bank card numbers or bank account details to any AI provider, except as allowed in clause 5.
3. Passwords, API keys, tokens and private keys must never be shared with any AI tool.
4. Client names and internal project codenames may only be sent to the approved enterprise AI provider, and must be pseudonymised. Clients: Harbourview Clinic, Meridian Mining. Projects: Project Fynbos, Project Baobab.
5. HR staff may include employee ID numbers only when using the approved enterprise provider, and they must be pseudonymised.
6. Remove email addresses and phone numbers before sending, except for HR using the approved enterprise provider.
7. If no approved provider is available for confidential data, the request must not be sent.
8. Every blocked or modified request must explain the reason to the employee.`;

const NOT_HR = ["general", "finance", "engineering"] as const;

export const SEED_POLICY: CompiledPolicy = {
  schemaVersion: 1,
  name: "Acme Demo Logistics (fictional) – AI Use Policy v1",
  mode: "enforce",
  dataClasses: [
    { id: "SA_ID", level: "confidential", defaultAction: "redact" },
    { id: "CARD_NUMBER", level: "confidential", defaultAction: "redact" },
    { id: "BANK_ACCOUNT", level: "confidential", defaultAction: "redact" },
    { id: "EMAIL", level: "internal", defaultAction: "redact" },
    { id: "PHONE", level: "internal", defaultAction: "redact" },
    { id: "CREDENTIAL", level: "restricted", defaultAction: "block" },
    { id: "CLIENT_NAME", level: "confidential", defaultAction: "block" },
    { id: "PROJECT_CODENAME", level: "confidential", defaultAction: "block" },
  ],
  rules: [
    {
      id: "R-PII-01",
      description: "ID numbers may not be sent to AI providers.",
      sourceClause:
        "2. Never send South African ID numbers, bank card numbers or bank account details to any AI provider, except as allowed in clause 5.",
      match: { dataClasses: ["SA_ID"] },
      action: "redact",
    },
    {
      id: "R-FIN-01",
      description: "Card numbers and bank account details may not be sent to AI providers.",
      sourceClause:
        "2. Never send South African ID numbers, bank card numbers or bank account details to any AI provider, except as allowed in clause 5.",
      match: { dataClasses: ["CARD_NUMBER", "BANK_ACCOUNT"] },
      action: "redact",
    },
    {
      id: "R-CRED-01",
      description: "Passwords, API keys, tokens and private keys must never be shared with any AI tool.",
      sourceClause: "3. Passwords, API keys, tokens and private keys must never be shared with any AI tool.",
      match: { dataClasses: ["CREDENTIAL"] },
      action: "block",
    },
    {
      id: "R-TERM-01",
      description: "Client names and project codenames are pseudonymised for the approved enterprise AI provider.",
      sourceClause:
        "4. Client names and internal project codenames may only be sent to the approved enterprise AI provider, and must be pseudonymised.",
      match: { dataClasses: ["CLIENT_NAME", "PROJECT_CODENAME"], providerTiers: [1] },
      action: "tokenise",
    },
    {
      id: "R-TERM-02",
      description: "Client names and project codenames may only be sent to the approved enterprise AI provider.",
      sourceClause:
        "4. Client names and internal project codenames may only be sent to the approved enterprise AI provider, and must be pseudonymised.",
      match: { dataClasses: ["CLIENT_NAME", "PROJECT_CODENAME"], providerTiers: [2, 3] },
      action: "block",
    },
    {
      id: "R-HR-01",
      description: "HR may include employee ID numbers only with the approved enterprise AI provider, pseudonymised.",
      sourceClause:
        "5. HR staff may include employee ID numbers only when using the approved enterprise provider, and they must be pseudonymised.",
      match: { dataClasses: ["SA_ID"], roles: ["hr"], providerTiers: [1] },
      action: "tokenise",
    },
    {
      id: "R-CONTACT-01",
      description: "Email addresses and phone numbers are removed before sending.",
      sourceClause:
        "6. Remove email addresses and phone numbers before sending, except for HR using the approved enterprise provider.",
      match: { dataClasses: ["EMAIL", "PHONE"], roles: [...NOT_HR] },
      action: "redact",
    },
    {
      id: "R-CONTACT-02",
      description: "Email addresses and phone numbers are removed before sending.",
      sourceClause:
        "6. Remove email addresses and phone numbers before sending, except for HR using the approved enterprise provider.",
      match: { dataClasses: ["EMAIL", "PHONE"], roles: ["hr"], providerTiers: [2, 3] },
      action: "redact",
    },
    {
      id: "R-CONTACT-03",
      description: "HR may include email addresses and phone numbers when using the approved enterprise AI provider.",
      sourceClause:
        "6. Remove email addresses and phone numbers before sending, except for HR using the approved enterprise provider.",
      match: { dataClasses: ["EMAIL", "PHONE"], roles: ["hr"], providerTiers: [1] },
      action: "allow",
    },
  ],
  terms: [
    { term: "Harbourview Clinic", dataClass: "CLIENT_NAME" },
    { term: "Meridian Mining", dataClass: "CLIENT_NAME" },
    { term: "Project Fynbos", dataClass: "PROJECT_CODENAME" },
    { term: "Project Baobab", dataClass: "PROJECT_CODENAME" },
  ],
  // Demo configuration only: tiers are not claims about any vendor's real data handling.
  providers: [
    { id: "mock-enterprise", label: "Approved enterprise AI", tier: 1, maxLevel: "confidential", enabled: true },
    { id: "gemini", label: "Google Gemini", tier: 2, maxLevel: "internal", enabled: true },
    { id: "groq", label: "Groq", tier: 3, maxLevel: "public", enabled: true },
  ],
  routing: { order: ["mock-enterprise", "gemini", "groq"], onNoEligibleProvider: "block" },
  coaching: true,
};
