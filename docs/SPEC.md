# Clearance Gateway: Build Specification

Owner: Collins Shibambo · Challenge: Credify System Thinking Challenge 2026, area 01 (AI & Cybersecurity)
Deadline: portal closes Thu 29 Oct 2026, 09:00 SAST · Feature freeze: 04:00
Tagline: "Data only goes where it's cleared to go."

Components:
- **Compiler** (policy text → rules)
- **Engine** (canonicalise, detect, decide, transform)
- **Router** (clearance-based, fail closed)
- **Bench** (evaluation harness)
- **Lens** (browser extension)

Always write the full name "Clearance Gateway". Unrelated AI-agent approval tools use the name "Clearance".

---

## 1. Context and goals

**Problem (summary; the full analysis is written by Collins in `docs/system-map.md`):**
Employees use AI tools widely, but security guidance and enforcement lag behind. Company AI policies often exist only on paper, and nothing enforces them at the moment someone pastes data into an AI tool. When the sanctioned route is slower or less useful than a personal AI account, people bypass it.

**What the prototype must demonstrate:**
1. Policy written once in plain English becomes enforceable, versioned rules.
2. Enforcement happens at the point of use, deterministically, with explanations for the user.
3. Routing respects data sensitivity, including during provider outages (fail closed).
4. Effectiveness is **measured**: detection, false positives, evasion, policy correctness and failover safety.
5. The safe path stays useful. Tokenisation keeps prompts meaningful, and coaching explains instead of only blocking.

**Related work (for `docs/intervention.md` and the deck; Collins writes the comparison):**
- **Kaspersky (Oct 2025, South African data):**
  - Recommends a specialised AI proxy that removes sensitive data from queries on the fly and uses role-based access control.
  - Recommends tiered AI access calibrated to each department's data sensitivity.
  - The idea is not new; it is an industry recommendation.
- **Credal** (YC-backed, TechCrunch, Oct 2023):
  - Routes prompts across LLMs based on data sensitivity and company policy.
  - Redacts or warns before sensitive data leaves the network.
  - A commercial precedent for sensitivity-based routing.
- **OWASP Top 10 for LLM Applications 2025:** LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM07 System Prompt Leakage.
- **OWASP Top 10 for Agentic Applications 2026:** vocabulary for the coding-agents limitation.
- **Differentiation to argue:** not novelty. The argument rests on:
  - root-cause analysis (why employees bypass the sanctioned route)
  - plain-English policy compiled into reviewable, versioned rules
  - fail-closed routing measured against a naive fallback chain
  - published evaluation numbers
  - South African context (POPIA, SA ID numbers)

**Non-goals for tonight:** real SSO, coding-agent enforcement (documented as designed, not built), SaaS copilots, TLS interception, multi-tenant admin, production hardening.

---

## 2. Architecture

```
Employee / app / extension
        │
        ▼
POST /api/chat  ──►  canonicalise ──► detect ──► decide (per role, per candidate provider)
                                                     │
                                       transform (redact / tokenise / block)
                                                     │
                                       route: first provider in policy order that is
                                       enabled + healthy + allowed for this data level
                                       (none eligible → BLOCK, fail closed)
                                                     │
                                                 provider call
                                                     │
                                       output guard (scan response, restore tokens)
                                                     │
                                       explanation + audit event (metadata only)
```

Policy lifecycle (separate path; runs only when the admin saves):
```
Admin pastes policy text → POST /api/policy/compile (LLM via fallback chain, schema-validated)
 → draft version → admin reviews rules table → optional shadow simulation → activate
```

---

## 3. Tech stack and allowed dependencies

| Area | Choice |
|---|---|
| Runtime | Node 22 LTS, TypeScript strict, npm workspaces |
| API | Express (current stable), `cors`, `zod`, `@supabase/supabase-js` |
| Web | React, Vite, TypeScript, `react-router-dom`, `recharts` |
| Core | No runtime dependencies if possible (pure TS) |
| Tests | Vitest |
| Eval | `tsx` to run TypeScript scripts; seeded RNG implemented locally (no faker needed) |
| Extension | Plain TypeScript or JS, Manifest V3, no framework |

Ask before adding anything else.

---

## 4. Repo layout and deployment

```
/
  package.json            (workspaces: packages/*, apps/*, eval)
  CLAUDE.md
  .env.example
  packages/core/src/
    canonicalise.ts  detectors/  policy/schema.ts  policy/seed.ts
    decide.ts  transform.ts  route.ts  outputGuard.ts  explain.ts  index.ts
  apps/api/src/
    app.ts (export default app)  server.ts (local listen)
    routes/  providers/  compiler/  db/  rateLimit.ts  config.ts
  apps/web/src/
    pages/  components/  api.ts
  extension/            (Lens)
    manifest.json  background.ts  content.ts  popup.html  popup.ts
  eval/                 (Bench)
    generate.ts  run.ts  data/  results/
  supabase/schema.sql
  docs/
```

**Deployment:**
- Two Vercel projects from this one repo: root directory `apps/api` and root directory `apps/web`.
- **Deploy a skeleton in Phase 0** to prove that `apps/api` can import `packages/core` on Vercel.
  - If the workspace import fails on Vercel, fall back to a prebuild step that copies or bundles `packages/core` into `apps/api`.
  - Record which approach worked in `docs/decisions.md`.
- Locally, `server.ts` calls `app.listen`. On Vercel, the default export is used. (Verify how to detect the Vercel environment; see §20.)
- The web app reads `VITE_API_URL`. The API sets a CORS allowlist: the web origin, `http://localhost:5173` and the extension origin.

**Environment variables (`.env.example`):**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # API only. Never in web or extension.
GEMINI_API_KEY=
GEMINI_MODEL=
GROQ_API_KEY=
GROQ_MODEL=
OFFLINE_MODE=false                # true = mock provider only, labelled in the UI
DEMO_ADMIN_CODE=                  # required for admin endpoints; shared with judges in the README
RATE_LIMIT_PER_CLIENT_PER_DAY=50
GLOBAL_DAILY_CAP=1000
CLIENT_HASH_SALT=
CORS_ORIGINS=
```

---

## 5. Core: canonicalisation (`canonicalise.ts`)

Goal: make evasion variants look the same to detectors **without losing the ability to redact the original text**.

1. Apply Unicode NFKC normalisation (this folds fullwidth digits and similar characters).
2. Remove zero-width characters (U+200B–U+200D, U+2060, U+FEFF).
3. Produce a second "digits-collapsed" view in which separators (space, `-`, `.`, `/`) between digit groups are removed, for the numeric detectors.
4. **Keep an index map from every canonical position back to the original position**, so findings always report `start` and `end` in the original text.
5. Must be tested with: spaced digits, dashed digits, zero-width characters inside numbers, fullwidth digits, and line breaks inside a number.

---

## 6. Core: detectors

Every detector returns:
```ts
interface Finding {
  detectorId: string;
  dataClass: DataClassId;
  start: number; end: number;        // offsets in the ORIGINAL text
  confidence: "high" | "medium" | "low";
  masked: string;                    // e.g. "8001••••••082" — never the full value
}
```

| Detector | Data class | Method | Confidence |
|---|---|---|---|
| `za_id` | `SA_ID` | 13 digits; first 6 form a valid YYMMDD date; checksum digit valid (Luhn; verify, see §20); citizenship digit 0 or 1 | high if all pass, else no finding |
| `card` | `CARD_NUMBER` | 13–19 digits, Luhn-valid, known prefixes (Visa 4; Mastercard 51–55 and 2221–2720; Amex 34/37) | high |
| `bank_account` | `BANK_ACCOUNT` | 7–11 digit run **only** within ~40 characters of context words (account, acc, acct, "account number", branch code, FNB, Absa, Standard Bank, Nedbank, Capitec) | medium |
| `email` | `EMAIL` | standard pattern | high |
| `phone_za` | `PHONE` | `+27` or `0` followed by 9 digits, separators allowed; mobile prefixes 6/7/8 | high, else medium |
| `cred_known` | `CREDENTIAL` | known secret formats: AWS access key IDs (`AKIA` + 16), GitHub tokens (`ghp_`, `gho_`, `ghs_`, `github_pat_`), Google API keys (`AIza…`), Stripe (`sk_live_`, `sk_test_`), Slack (`xoxb-`, `xoxp-`), PEM private key headers, JWTs (`eyJ…` three base64url segments). Verify each against current docs or gitleaks rules (§20) | high |
| `cred_assign` | `CREDENTIAL` | `password\|passwd\|pwd\|secret\|token\|api[_-]?key` followed by `:` or `=` and a value | high |
| `entropy` | `CREDENTIAL` | tokens ≥ 20 chars with mixed character classes and Shannon entropy above a threshold **tuned on the dev split only**; boosted near credential keywords | medium/low |
| `terms` | `CLIENT_NAME`, `PROJECT_CODENAME` | dictionary from the active policy's `terms` (case-insensitive, word boundaries, aliases). Optional fuzzy match: edit distance ≤ 1 for terms ≥ 6 characters | high exact, low fuzzy |

**Rules:**
- Overlapping findings: keep the higher-confidence one, and on ties the longer span.
- Each detector has a unit test file with positives, negatives and **traps**: 13-digit order numbers failing the checksum, invalid dates, Luhn-failing 16-digit numbers, the word "token" in normal prose, and terms appearing inside other words.

---

## 7. Policy model

### 7.1 Compiled policy schema (zod, `policy/schema.ts`)
```ts
type Level = "public" | "internal" | "confidential" | "restricted";
type Action = "allow" | "redact" | "tokenise" | "block";
type DataClassId = "SA_ID" | "CARD_NUMBER" | "BANK_ACCOUNT" | "EMAIL" | "PHONE"
                 | "CREDENTIAL" | "CLIENT_NAME" | "PROJECT_CODENAME";
type RoleId = "general" | "hr" | "finance" | "engineering";

interface CompiledPolicy {
  schemaVersion: 1;
  name: string;
  mode: "enforce" | "shadow";
  dataClasses: { id: DataClassId; level: Level; defaultAction: Action }[];
  rules: {
    id: string;                 // "R-CRED-01"
    description: string;        // shown to employees, plain English
    sourceClause?: string;      // the policy sentence this came from
    match: { dataClasses: DataClassId[]; roles?: RoleId[]; providerTiers?: (1|2|3)[] };
    action: Action;
  }[];
  terms: { term: string; aliases?: string[]; dataClass: "CLIENT_NAME" | "PROJECT_CODENAME" }[];
  providers: { id: string; label: string; tier: 1|2|3; maxLevel: Level; enabled: boolean }[];
  routing: { order: string[]; onNoEligibleProvider: "block" };
  coaching: boolean;
}
```

### 7.2 Seeded policy (fictional company; used for the demo, tests and eval)
Raw text, stored as version 1 with `compiled_by = 'seed'`:

> **Acme Demo Logistics (fictional) – AI Use Policy v1**
> 1. Staff may use approved AI assistants for drafting, summarising and coding help.
> 2. Never send South African ID numbers, bank card numbers or bank account details to any AI provider, except as allowed in clause 5.
> 3. Passwords, API keys, tokens and private keys must never be shared with any AI tool.
> 4. Client names and internal project codenames may only be sent to the approved enterprise AI provider, and must be pseudonymised. Clients: Harbourview Clinic, Meridian Mining. Projects: Project Fynbos, Project Baobab.
> 5. HR staff may include employee ID numbers only when using the approved enterprise provider, and they must be pseudonymised.
> 6. Remove email addresses and phone numbers before sending, except for HR using the approved enterprise provider.
> 7. If no approved provider is available for confidential data, the request must not be sent.
> 8. Every blocked or modified request must explain the reason to the employee.

Hand-write the matching compiled JSON in `policy/seed.ts`. It is also the **golden expected output** for the compiler test (§14.6).

Demo providers, labelled in the UI as demo configuration:

| Provider | Label | Tier | Max level |
|---|---|---|---|
| mock-enterprise | "Approved enterprise AI (demo)" | 1 | confidential |
| gemini | | 2 | internal |
| groq | | 3 | public |

Adjust the mapping to whichever keys work tonight. **Never claim a tier reflects a real vendor's data handling.**

---

## 8. Decide, transform, route

**Sensitivity level of a request** = the highest level among findings in the **original** prompt. This is conservative: routing does not rely on tokenisation having caught everything. Document it as a design decision.

**Decision algorithm (`decide.ts` + `route.ts`):**
1. Go through providers in `routing.order`. Skip any that are disabled or marked unhealthy.
2. For a candidate provider P, and for each finding:
   - collect the rules matching (`dataClass`, `role`, `P.tier`);
   - take the strictest action, in the order block > tokenise > redact > allow;
   - if no rule matches, use the data class's `defaultAction`.
3. P is **eligible** if no finding resolves to `block` **and** the request level ≤ `P.maxLevel`.
4. Use the first eligible provider. If none is eligible: final action `BLOCK`, reason `NO_ELIGIBLE_PROVIDER` (fail closed).
5. Return `{ action, provider, perFinding: [{finding, action, ruleId}], ruleIds, reasons }`.

**Transform (`transform.ts`):**
- `redact` replaces the value with `[REDACTED:SA_ID]`.
- `tokenise` replaces it with a placeholder such as `[SA_ID_1]`. Identical values get the same placeholder. The map lives only in request scope and is never persisted.
- Apply replacements from the end of the string backwards so offsets stay valid.

**Shadow mode:** compute everything but send the **original** decision path as if allowed. Use it only in the simulator, never on live `/api/chat`. Return "would have" results.

**Provider health:**
- In-memory per instance: mark a provider unhealthy for 60 s after 2 consecutive failures.
- Timeout per provider call: 20 s.
- Simulated outages come only from the admin "simulate outage" setting or the harness, never from a client-supplied header on public endpoints.

---

## 9. Output guard and explanations

**Output guard (`outputGuard.ts`):**
- Run all detectors on the provider's response. Redact anything with level > public that was not in the user's own prompt.
- Check for canary strings (eval suite) and system-prompt fragments.
- Restore tokens tolerantly: accept `[SA_ID_1]` and minor variants such as `SA_ID_1` without brackets. Count placeholders that could not be restored and show the count.

**Explanation (`explain.ts`):** every response includes human-readable lines, for example:
- "Removed 1 South African ID number. Rule R-PII-01: ID numbers may not be sent to AI providers."
- "Pseudonymised 2 client names before sending to Approved enterprise AI (demo). The names were restored in the reply."
- "Blocked: no approved provider is available for confidential data right now (fail closed, rule R-ROUTE-01)."

---

## 10. API

All bodies are JSON with a 16 KB limit. Errors never echo the input text.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness, `offlineMode`, active policy version |
| POST | `/api/check` | none | `{text, role}` → findings (masked), decision, transformed preview. **No LLM call.** Used for live highlighting and by the extension |
| POST | `/api/chat` | none, rate-limited | `{text, role, channel}` → full pipeline. Returns `{reply, explanation[], decision, provider, latencyMs, offlineMode}` |
| GET | `/api/policy/active` | none | Active compiled policy (raw text included) |
| GET | `/api/policy/versions` | admin | Version list |
| POST | `/api/policy/compile` | admin | `{rawText}` → draft version (LLM compile + zod validation) |
| POST | `/api/policy/:id/activate` | admin | Activate a draft (one active version at a time) |
| POST | `/api/policy/simulate` | admin | `{policyId, prompts[] or "sample"}` → per prompt: active vs draft decision |
| POST | `/api/admin/outage` | admin | `{providerId, down: boolean}` for the failover demo |
| POST | `/api/admin/reset` | admin | Restore the seed policy, clear outages |
| GET | `/api/audit` | admin | Recent events (metadata only) |
| GET | `/api/stats` | none | Aggregates for the dashboard |

Admin auth uses the `x-admin-code` header compared with `DEMO_ADMIN_CODE`. This is a demo mechanism; document it as a limitation.

**Policy compiler (`compiler/`):**
- The prompt contains the JSON schema, the allowed enums and the seed example. The policy text is wrapped in clear delimiters and treated as **data**.
- Response flow: parse JSON → zod validate → on failure, retry once with the validation errors → then try the next provider in the chain → otherwise return an error. Never auto-activate.
- The compiler may use any provider, because policy text is not sensitive. Record `compiled_by`.
- The UI shows the compiled rules as a readable table with `sourceClause` next to each rule, so the admin can check the mapping.

**Optional second opinion (COULD):**
- Trigger only when there is a low-confidence finding, or when no finding was made but sensitivity keywords appear ("confidential", "internal only", "salary").
- Send the **redacted** prompt to the tier-1 provider only.
- The result can only tighten the decision. If it errors, the action becomes "ask the user to confirm".

---

## 11. Database (`supabase/schema.sql`)

```sql
create table policy_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  raw_text text not null,
  compiled jsonb not null,
  status text not null check (status in ('draft','active','archived')),
  compiled_by text,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create unique index one_active_policy on policy_versions (status) where status = 'active';

create table audit_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  channel text,            -- web | extension | api | eval
  role text,
  policy_version int,
  data_classes text[],
  final_action text,       -- allow | redact | tokenise | block
  rule_ids text[],
  provider text,
  outcome text,            -- sent | blocked | error
  latency_ms int,
  prev_hash text,          -- COULD: hash chain
  hash text
);

create table usage_counters (
  day date not null,
  client_hash text not null,   -- salted hash of client IP; never the raw IP
  count int not null default 0,
  primary key (day, client_hash)
);

alter table policy_versions enable row level security;
alter table audit_events    enable row level security;
alter table usage_counters  enable row level security;
-- No RLS policies: only the API (service role) can read or write.
```

- If the database is unreachable, `/api/check` and `/api/chat` keep working with the seed policy held in memory, and the response says so.
- The hash chain is a COULD: `hash = sha256(prev_hash + canonical JSON of event)`. Concurrent serverless writes can fork the chain; note this in the limitations.

---

## 12. Web app (`apps/web`)

1. **Employee assistant** (`/`)
   - Role selector, prompt box with live highlighting via debounced `/api/check`.
   - "What will be sent" preview, reply, explanation panel, provider badge.
   - Six one-click sample prompts (clean, ID number, API key, client name, HR case, outage case).
2. **Admin: policy** (`/admin/policy`)
   - Raw text editor, Compile button, rules table with source clauses, diff against the active version, Activate button, version history.
   - The admin code field is stored in session memory only.
3. **Admin: simulator** (`/admin/simulate`): run the sample set or pasted prompts against the draft and active versions, highlighting changed decisions.
4. **Admin: providers** (`/admin/providers`): tiers, health, and outage toggles for the failover demo.
5. **Dashboard** (`/dashboard`): counts by data class, action and provider from `/api/stats`.
6. **Evaluation** (`/evaluation`): renders the committed `eval/results/results.json` with charts and the dataset size, labelled synthetic.
7. **Demo chat site** (`/demo-chat`): a clearly **fictional** brand (for example "OpenBox Chat (fictional)"). Not a look-alike of any real product. Stable `data-` attributes on the form for the extension.
8. **How it works** (`/about`): architecture diagram, limitations, link to the repo.

Show a banner when `offlineMode` is true. On first load, call `/health` and show a "connecting…" state.

---

## 13. Lens: browser extension (stretch, cut-off 03:30)

- Manifest V3. The content script matches **only** the demo chat page (production URL plus localhost).
- On submit (capture phase), call `preventDefault` and send `{text, role}` to the background script. The background script calls `/api/check`; the API URL is in `host_permissions`. Verify cross-origin behaviour in Chrome's docs (§20).
- Show an overlay with findings, the redacted preview and buttons: **Send redacted** · **Edit** · (if policy allows) **Send anyway**.
- The popup has an on/off toggle and the demo role.
- Ship a zip in a GitHub release, "Load unpacked" steps in the README, and a short GIF.

---

## 14. Bench: evaluation harness (`eval/`)

### 14.1 Dataset (`generate.ts`)
- Use a seeded RNG (seed recorded in the results). All data is synthetic.
- Generators:
  - valid SA IDs (random valid dates + sequence + checksum)
  - Luhn-valid card numbers
  - emails at example.com / example.org
  - `+27` phone numbers
  - fake credentials matching each known format with random characters
  - terms from the seed policy
- Categories:
  - `clean`: realistic work prompts with no sensitive data
  - `sensitive`: one or more labelled spans
  - `evasion`: spaced, dashed, zero-width, fullwidth, split across lines
  - `trap`: look-alikes that must **not** fire
- **Split by template, not by sample**: templates used in `test` never appear in `dev`, which prevents leakage.
- Roughly 300 cases in total. Tune the entropy threshold and other parameters on `dev` only.

### 14.2 Configurations compared
- A. No gateway (baseline: everything sent)
- B. Regex-only (patterns without validators, canonicalisation or context gating)
- C. Full deterministic pipeline
- D. C + second opinion (only if built)

### 14.3 Metrics (report on `test`; show `dev` separately)
- Per-class precision, recall and F1, where a predicted span counts if it overlaps a labelled span with the same class
- Evasion catch rate
- False-positive rate on traps and on clean prompts
- Policy-matrix pass rate: role × data class × provider tier against expected actions from the seed policy
- **Failover safety:** with tier 1 down, count restricted or confidential requests that a naive "try the next provider" chain would send to a lower tier, versus this router (expected 0)
- Latency p50/p95 of the in-process `check` pipeline (no network)

### 14.4 Output
`eval/results/results.json` and `results.md`, both committed, including dataset counts, the seed and the timestamp. The web Evaluation page reads the JSON.

### 14.5 Injection / canary suite (COULD)
- A toy assistant whose system prompt contains a canary string, plus a fake internal document containing a fake secret.
- About 20 injection payloads. Measure the leak rate with the output guard off and on.
- Requires a real model, so keep n small and report it.

### 14.6 Compiler check (SHOULD)
- Compile the seed policy text 3 times.
- Compare to the golden JSON: rule coverage per clause, and any action that is **looser** than golden (critical).
- Report the results honestly.

---

## 15. Security and privacy requirements

- 16 KB body limit. Provider timeout 20 s, total request timeout 45 s.
- CORS allowlist from `CORS_ORIGINS`.
- Rate limit per salted client hash per day, plus a global daily cap, both stored in `usage_counters`. When exceeded, `/api/chat` falls back to mock mode with a message.
- No raw prompt or response text in logs, audit records or error messages.
- The service-role key is used only in the API. RLS is enabled with no policies.
- Before the final commit, run a secrets scan (gitleaks or equivalent) and record the result in the README.
- Dependencies stay minimal (§3).

---

## 16. Build plan (times SAST, Wed 28 → Thu 29 Oct)

| Phase | Time box | Scope | Acceptance checks |
|---|---|---|---|
| 0 Scaffold + deploy | 19:30–20:15 | Workspaces, TS config, Vitest, `/health`, web hello page, Supabase schema applied, **both Vercel projects live** | Live API `/health` returns JSON; live web page loads and shows health; `packages/core` import works on Vercel |
| 1 Core detection | 20:15–21:45 | Canonicaliser + all detectors except fuzzy and entropy; unit tests | `npm test` green; every detector has a trap test; evasion tests pass for numeric classes |
| 2 Policy engine | 21:45–22:45 | Schema, seed policy, decide, transform, route, explain; `/api/check` | Policy-matrix unit tests pass; `/api/check` returns masked findings and correct actions for the six sample prompts |
| 3 Full chat path | 22:45–23:45 | Provider adapters (mock, Gemini, Groq), health, fail-closed routing, output guard, tokenise + restore, audit insert, rate limit; basic employee assistant page | End-to-end on live URL in both offline and real mode; outage toggle makes a confidential prompt block (fail closed); no prompt text in `audit_events` |
| 5 Evaluation | 23:45–01:30 | Generator, runner, configs A–C, results JSON/MD, Evaluation page | `npm run eval` produces results; test split is template-disjoint; failover safety shows naive > 0 vs ours = 0 |
| 4 Policy compiler | 01:30–02:30 | Compile endpoint, versions, activate, admin policy page, simulator | Seed text compiles to valid JSON; no rule looser than golden in the compiler check; activation changes live decisions |
| 6 Dashboard + polish | 02:30–03:15 | Stats, dashboard, providers page, about page, offline banner | Judges can follow the 2-minute path in the README end to end |
| 7 Extension (stretch) | 03:15–04:00 | §13 | Overlay appears on the demo page; "Send redacted" sends the transformed text |
| Freeze | 04:00 | Docs, README, deck, recording | Submit by 08:30 |

The evaluation phase (5) is deliberately placed before the compiler (4): evidence is worth more to the judges than another feature.

---

## 17. Priorities and cut list

- **MUST:** Phases 0, 1, 2, 3, 5; README; limitations; decisions log.
- **SHOULD:** Phase 4 (compiler, versions, simulator), dashboard, providers page.
- **COULD:** extension, second opinion, entropy detector, fuzzy terms, hash chain, canary suite.

If behind schedule, cut from the bottom of COULD upwards. Never cut tests or the evaluation run.

---

## 18. Documentation deliverables

**README.md** must contain:
- Live links, the demo admin code, and a **2-minute judge path**: open the assistant → click "ID number" sample → see the redaction explanation → toggle the tier-1 outage → see the fail-closed block → open the Evaluation page.
- What it does, technologies, setup and run steps (local and offline mode), environment variables.
- Known limitations (required by the Credify guide).
- AI-use disclosure: tools used (including Claude Code) and what Collins personally designed and decided, with a link to `docs/decisions.md`.
- The secrets scan result.

**`docs/`** (Collins writes the analysis; Claude Code scaffolds headings and the technical sections):
- `system-map.md`: problem and context, stakeholders, root causes, system relationships (Collins)
- `intervention.md`: options considered, why this one, feasibility, risks, assumptions, expected impact and how to measure it in a pilot (Collins)
- `architecture.md`: technical (Claude Code drafts, Collins reviews)
- `evaluation.md`: method and results (Claude Code drafts from results, Collins interprets)
- `limitations.md`
- `decisions.md`

---

## 19. Known limitations (starter list; extend as you go)

- Coding agents (for example Claude Code) are not covered. The layered design (base URL to gateway, managed settings, PreToolUse hooks, egress allowlist) is documented, not built.
- SaaS copilots and TLS-intercepting proxies are not covered.
- Detection is pattern- and dictionary-based, with no contextual understanding of secrets such as strategy documents.
- Test data is synthetic; provider tiers are assumptions; there is no pilot with real employees.
- Demo admin auth only; no SSO.
- Serverless instances keep health state per instance.
- The hash chain (if built) can fork under concurrent writes.
- The browser extension works only on the fictional demo page.

---

## 20. Open items to verify (do not guess; check docs, then record in decisions.md)

1. Vercel: npm-workspace import from `packages/core` when the project root is `apps/api`; how to detect running on Vercel; current Node versions.
2. Gemini and Groq: current REST endpoints, auth headers, model names, free-tier rate limits.
3. SA ID number: confirm the structure (YYMMDD, sequence, citizenship digit, checksum algorithm) against an authoritative source before relying on it.
4. Credential prefixes in §6: confirm against provider docs or the gitleaks default rules.
5. Chrome MV3: cross-origin fetch from content scripts versus the background service worker with `host_permissions`.
6. Supabase: `gen_random_uuid()` availability (pgcrypto) on the project.
