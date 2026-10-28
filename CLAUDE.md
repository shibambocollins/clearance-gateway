# CLAUDE.md: Clearance Gateway (Credify System Thinking Challenge 2026)

**Name:** always "Clearance Gateway", never just "Clearance" (other AI-agent tools use that name). Repo: `shibambocollins/clearance-gateway`. Do not publish any npm package named `clearance*`.
**Tagline:** "Data only goes where it's cleared to go."

**Component names** (use them consistently in code, UI and docs):

| Component | What it does | Location |
|---|---|---|
| Compiler | Turns policy text into rules | `apps/api/src/compiler` |
| Engine | Canonicalise, detect, decide, transform | `packages/core` |
| Router | Clearance-based routing, fail closed | `packages/core/route.ts` |
| Bench | Evaluation harness | `eval/` |
| Lens | Browser extension | `extension/` |

## What this is
A solo hackathon prototype for the Credify System Thinking Challenge 2026, challenge area 01 (AI & Cybersecurity):
"How can companies use AI without creating new security risks?"

- Submission (public GitHub repo, project documentation, pitch deck) closes **Thu 29 Oct 2026, 09:00 SAST**.
- **Feature freeze at 04:00.** After that: docs, README, deck and recording only.
- Judging criteria: systems thinking and problem framing, root-cause analysis, practical intervention, feasibility and evidence, and communication plus individual contribution. Reasoning and measured evidence beat feature count.

## The product
A policy-enforcement gateway between employees (or apps) and AI providers.

1. An admin writes the company AI policy in plain English **once**.
2. An LLM compiles it into structured rules. The admin reviews and activates them, and every save creates a new version.
3. Every prompt is then enforced **deterministically**, with no LLM in the enforcement path:
   detect sensitive data → decide per role → transform (redact / tokenise / block) → route only to providers whose trust tier allows that data (fail closed) → scan the response → restore tokens → explain to the user what happened and why.
4. An evaluation harness measures detection, false positives, evasion, policy correctness and failover safety.
5. Stretch: a minimal browser extension applies the same checks on a demo chat page for a **fictional** "unsanctioned" AI site.

Full specification: `docs/SPEC.md`. Read the relevant section before starting each phase.

## Non-negotiable rules
1. **Enforcement is deterministic.** An LLM may compile the policy (admin-approved) and may give an optional, tighten-only second opinion. An LLM must never be the component that allows a prompt through.
2. **Fail closed.** If no approved provider can take the data, block and explain. If the second opinion errors, fall back to "ask the user to confirm", never "allow".
3. **Never log or store raw prompt or response text.** Audit records contain metadata only. Finding previews are masked.
4. **Synthetic data only.** No real personal data in code, tests, fixtures or screenshots. Use reserved domains such as example.com for emails.
5. **No secrets in the repo.** Commit only `.env.example`. The Supabase service-role key lives only in the API's environment. The web app and the extension never talk to Supabase directly.
6. **The demo "unsanctioned AI" page must be a clearly fictional brand.** Never imitate a real AI product's name, logo or layout.
7. **Never claim 100% detection.** The UI, README and docs report measured numbers from the harness.
8. **Provider trust tiers are demo configuration**, not claims about any vendor's real data handling. Say so in the UI and docs.

## Stack
- Node 22 LTS (confirm Vercel's supported versions) with TypeScript (strict), npm workspaces.
- `apps/api`: Express, deployed to Vercel as a zero-config Express app (`export default app`).
- `apps/web`: React + Vite + TypeScript, deployed as a separate Vercel project.
- `packages/core`: detectors, canonicaliser, policy engine. Pure TypeScript with **no I/O**, shared by the API, eval harness and extension.
- Supabase (Postgres) for policy versions, audit events and usage counters.
- zod for validation, Vitest for tests, Recharts for charts.
- LLM providers: Gemini and Groq via plain `fetch` adapters, plus a deterministic mock provider. Model names come from env vars. **Check current provider docs for endpoints and models; don't guess.**

## Repo layout
```
packages/core/    canonicalise, detectors, policy schema, decide, transform, route, outputGuard
apps/api/         Express app: routes, providers, compiler, db, rate limit
apps/web/         admin console, employee chat, simulator, dashboard, evaluation page, fictional demo chat page
extension/        Manifest V3 extension (stretch)
eval/             generator, datasets, runner, results
supabase/         schema.sql, seed
docs/             SPEC.md, decisions.md, system-map.md, limitations.md, evaluation.md
```

## How to work
- Work phase by phase (SPEC §16). Pass each phase's acceptance checks before moving on.
- Make small commits with clear messages, and run `npm test` before committing.
- Ask Collins before adding a dependency not listed in SPEC §3, and before any large refactor.
- Prefer boring, readable code. No speculative abstractions, and no frameworks beyond the stack above.
- Log every non-trivial technical choice in `docs/decisions.md`: the decision, the alternatives, why, and who proposed it ("Claude Code" or "Collins"). This feeds the AI-use disclosure.
- **Do not write the problem analysis** (system map, stakeholders, root causes, intervention comparison, impact) as if it were Collins's reasoning. Scaffold headings and write technical sections only. Credify requires participants to show their own reasoning.
- If a phase overruns its time box, stop and tell Collins what to cut (SPEC §17). Don't silently keep going.
- Leave TODO comments only for items listed in SPEC §20 (open items to verify).

## Commands
- `npm install` (from the repo root; installs all workspaces)
- `npm run dev`: builds core, then runs core `tsc --watch`, the API on :3001 (`tsx watch`) and the web app on :5173. Reads the root `.env`.
- `npm test`: Vitest across all workspaces (core is aliased to source, so no build needed)
- `npm run typecheck`: builds core, then runs `tsc --noEmit` in every workspace
- `npm run eval`: Bench (placeholder until Phase 5)
- `npm run build`: core → API (typecheck) → web (Vite)
- Deploy: Vercel projects `clearance-gateway-api` (root `apps/api`) and `clearance-gateway-web` (root `apps/web`), Git-connected, so pushes to `main` deploy to production.
