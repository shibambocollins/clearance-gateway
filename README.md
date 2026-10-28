# Clearance Gateway

**Data only goes where it's cleared to go.**

A policy-enforcement gateway between employees and AI providers. An admin writes the company AI policy in plain English **once**. An LLM drafts it into rules that the admin reviews and activates. From then on every prompt is enforced **deterministically**:

1. detect sensitive data
2. decide per role
3. redact, pseudonymise or block
4. route only to providers cleared for that data, failing closed
5. check the reply
6. explain to the employee what happened and why

Built for the **Credify System Thinking Challenge 2026**, challenge area 01 (AI & Cybersecurity): *How can companies use AI without creating new security risks?*

## Live demo

| | |
|---|---|
| App | https://clearance-gateway-web.vercel.app |
| API health | https://clearance-gateway-api.vercel.app/health |
| Demo admin code | `credify-8d724294` (demo mechanism only, see limitations) |

## 2-minute judge path

1. Open the **app**. You land on the employee **Assistant**.
2. Click the **ID number** sample.
   - The ID number is highlighted, and **What will be sent** shows `[REDACTED:SA_ID]`.
   - Click **Send**. Under **Why**: *"Removed 1 South African ID number. Rule R-PII-01: ID numbers may not be sent to AI providers."*
3. Open **Demo controls** at the bottom, enter the admin code, and click **Simulate outage** next to *Approved enterprise AI (demo)*.
4. Click **Send** again. *"Blocked: no approved provider is available for confidential data right now (fail closed, rule R-ROUTE-01)."* The data is not sent to a lower-tier provider.
   - Optional: click the **Clean** sample and send it. It fails over to a real model (Google Gemini), because public data is cleared for tier 2.
5. Open **Evaluation** for the measured results against two baselines.
6. Click **Reset demo** (outages also switch off by themselves after 10 minutes).

More to try:
- **API key** sample: blocked, with coaching.
- **Client name** sample: pseudonymised before sending, restored in the reply.
- **HR case** sample, with the role set to HR: shows the policy's role exceptions.
- **Policy** page: compile the policy text and review the decision diff.
- **Dashboard**: what the gateway did, built from audit metadata.

## Measured results (synthetic data)

From [`eval/results/results.md`](eval/results/results.md): 195 synthetic test prompts, template-disjoint from the dev set, seed `20261029`. **Detection is not 100%.**

| | No gateway | Regex-only | Clearance Gateway |
|---|---|---|---|
| Precision | n/a | 55.6% | 100.0% |
| Recall | 0% | 59.5% | 92.9% |
| Evasion attempts caught | 0/54 | 3/54 | 45/54 |
| Look-alike "trap" prompts flagged | 0% | 64.4% | 0% |
| Sensitive values reaching a provider unprotected (of 126) | 126 | 48 | 9 |

**Failover**, with tier 1 down: a naive "try the next provider" chain sends 87/87 confidential requests to a lower tier. The Clearance Gateway router makes **0 routing errors** and blocks 81. **6** still went through because their data wasn't detected (ID numbers written as words, keys split across lines). Routing can only be as good as detection.

**Policy matrix:** 96/96 role × data class × tier decisions correct.

**Compiler check** (seed text, 3 runs): 3/3 valid, **0 decisions looser** than the hand-written policy, 35 stricter. See [`docs/evaluation.md`](docs/evaluation.md).

## How it works

```
Employee / app ──► POST /api/chat
   canonicalise ─► detect ─► decide (per role, per provider tier) ─► redact / pseudonymise / block
   ─► route: first provider in policy order that is enabled + healthy + cleared for the data
             (none eligible → BLOCK, fail closed)
   ─► provider ─► output guard (new sensitive data, leaked instructions) ─► restore pseudonyms
   ─► explanation to the employee + audit event (metadata only)

Admin ─► policy text ─► LLM compiler (draft, schema-validated) ─► decision diff + simulator ─► activate
```

The components are:
- **Compiler:** policy text → rules
- **Engine:** canonicalise, detect, decide, transform (`packages/core`, pure TypeScript, no I/O)
- **Router:** clearance-based routing, fail closed
- **Bench:** the evaluation harness

Details: [`docs/architecture.md`](docs/architecture.md).

## Technology

Node 22, TypeScript (strict) and npm workspaces:
- **API:** Express 5, deployed on Vercel
- **Web:** React 19, Vite 8, React Router, Recharts, deployed on Vercel
- **Database:** Supabase Postgres, with RLS on and no policies, so only the API's service role can read or write
- **Validation and tests:** zod, Vitest
- **Providers:** Gemini and Groq through plain `fetch`, plus a deterministic mock
- **CI:** GitHub Actions running typecheck, tests, build and a gitleaks secrets scan

## Run locally

```bash
npm install
cp .env.example .env     # see the variables below; everything is optional for a first run
npm run dev              # API http://localhost:3001 · web http://localhost:5173
npm test                 # Vitest across all workspaces
npm run eval             # regenerate the synthetic dataset and eval/results/*
```

- **Offline mode:** set `OFFLINE_MODE=true`. Every provider is answered by a deterministic mock, labelled in the UI, and routing, outages and fail-closed behaviour work as normal.
- **Without Supabase:** the API runs with the seed policy in memory and says so in `/health`.
- **Database setup:**
  - Apply [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
  - Run `npm run db:seed -w @clearance-gateway/api` to store the seed policy as version 1.
  - Optionally run `npm run compiler-check -w @clearance-gateway/api` (needs API keys) to re-run the compiler check.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | API only | Policy versions, audit events, usage counters, simulated outages. Never in the web app. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | API | Tier-2 demo provider and the policy compiler (default model `gemini-3.5-flash-lite`) |
| `GROQ_API_KEY`, `GROQ_MODEL` | API | Tier-3 demo provider and compiler fallback (default model `openai/gpt-oss-20b`) |
| `OFFLINE_MODE` | API | `true` = mock provider only |
| `DEMO_ADMIN_CODE` | API | Required for admin endpoints (`x-admin-code` header) |
| `RATE_LIMIT_PER_CLIENT_PER_DAY`, `GLOBAL_DAILY_CAP` | API | Over the limit, replies come from the mock provider |
| `CLIENT_HASH_SALT` | API | Salt for hashing client IPs (raw IPs are never stored) |
| `CORS_ORIGINS` | API | Allowed web origins (comma-separated) |
| `VITE_API_URL` | Web | API base URL |

## Lens: browser extension (demo)

Lens shows the same checks on **OpenBox Chat (fictional)**, a deliberately generic stand-in for an *unsanctioned* AI site at [/demo-chat](https://clearance-gateway-web.vercel.app/demo-chat). It is not a real product, calls no AI, and sends nothing anywhere.

**Install (Chrome or Edge, "Load unpacked"):**
1. Download `clearance-gateway-lens.zip` from the [Lens release](https://github.com/shibambocollins/clearance-gateway/releases/tag/lens-v0.1.0) and unzip it, or use the repo's `extension/` folder.
2. Open `chrome://extensions`, switch on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
3. Open https://clearance-gateway-web.vercel.app/demo-chat. Use the **Demo chat (fictional)** link or the URL directly: Lens only runs on that page.
4. Paste the Assistant's **ID number** sample and press **Send**. The Lens overlay lists the finding, shows what would be sent (`[REDACTED:SA_ID]`), and offers **Send redacted** or **Edit**. With **Send redacted**, OpenBox shows exactly the redacted text it received.
5. Try the **API key** sample: it is blocked, with no way to send it. Use the toolbar popup to switch Lens off or change the demo role.

Lens sends only `{text, role}` from the page to its background worker, which calls the fixed Clearance Gateway API URL. If the check fails, nothing is sent.

## Known limitations

The full list is in [`docs/limitations.md`](docs/limitations.md). In short:
- **Detection:** pattern- and dictionary-based. It has no contextual understanding, and some evasions are missed (measured above).
- **Routing:** can only be as good as detection.
- **Out of scope:**
  - Coding agents are documented as a design, not built.
  - SaaS copilots and TLS interception are not covered.
- **Demo shortcuts:**
  - Admin auth is a single demo code, not SSO.
  - Provider health is tracked per serverless instance.
  - Provider tiers are demo configuration, not claims about any vendor's data handling.
- **Evidence:**
  - All data is synthetic.
  - There has been no pilot with real employees.
- **Compiler:** an LLM. It can misread ambiguous wording (seen: stricter, never looser), which is why every compile is a reviewed draft.

## Security and privacy

- No prompt or reply text is logged or stored. Audit events hold metadata only (`apps/api/src/audit.ts`).
- Finding previews are masked (`8001••••••087`).
- Token maps for pseudonyms live only for the duration of a request.
- The Supabase service-role key exists only in the API's environment. RLS is enabled with no policies, and database functions are executable by the service role only.
- 16 KB body limit, CORS allowlist, per-visitor and global daily limits. Errors never echo input.
- **Secrets scan:** gitleaks runs on every pull request and push to `main` (`.github/workflows/ci.yml`). Result: passing. _Final pre-submission scan result to be recorded at freeze._

## AI-use disclosure

- **Claude Code** (Anthropic) wrote most of the code, tests and technical documentation (architecture, evaluation method, limitations), working phase by phase from a specification Collins wrote and under his direction.
- Every non-trivial technical choice is logged in [`docs/decisions.md`](docs/decisions.md) with who proposed it.
- At runtime, Google Gemini and Groq serve as demo AI providers and as the policy compiler.

**What Collins designed and decided:** _to be written by Collins._

## Documentation

| Document | Contents | Author |
|---|---|---|
| [`docs/system-map.md`](docs/system-map.md) | Problem, stakeholders, root causes, system relationships | Collins |
| [`docs/intervention.md`](docs/intervention.md) | Options considered, why this one, feasibility, risks, impact | Collins |
| [`docs/architecture.md`](docs/architecture.md) | Technical architecture | Claude Code, reviewed by Collins |
| [`docs/evaluation.md`](docs/evaluation.md) | Evaluation method and results | Claude Code, interpreted by Collins |
| [`docs/limitations.md`](docs/limitations.md) | Known limitations | Claude Code and Collins |
| [`docs/decisions.md`](docs/decisions.md) | Decision log | Both |
| [`docs/SPEC.md`](docs/SPEC.md) | Build specification | Collins |
