# Architecture

> Technical description, drafted by Claude Code for Collins to review.

## Components

| Component | Where | Responsibility |
|---|---|---|
| **Engine** | `packages/core` | Canonicalise, detect, decide, transform, explain, output guard. Pure TypeScript with no I/O. Shared by the API, Bench and web app. |
| **Router** | `packages/core/src/route.ts` | First provider in policy order that is enabled, healthy and cleared for the request's sensitivity; otherwise block (fail closed). |
| **Compiler** | `apps/api/src/compiler` | Plain-English policy → schema-validated draft rules (LLM). Never activates anything. |
| **API** | `apps/api` | Express on Vercel (`src/app.ts`). Providers, health, rate limit, audit, admin endpoints. |
| **Web** | `apps/web` | Assistant, dashboard, evaluation, admin (policy, simulator, providers), about. Talks only to the API. |
| **Bench** | `eval/` | Synthetic dataset generator, baselines, metrics, results. |
| **Database** | Supabase Postgres | `policy_versions`, `audit_events`, `usage_counters`, `simulated_outages`. RLS on, no policies; functions `increment_usage`, `activate_policy` (service role only). |

## Request path (`POST /api/chat`)

1. **Validate** the body (zod; 16 KB limit) and **rate limit** (salted IP hash per day plus a global cap; over the limit, the mock provider answers).
2. **Load the active policy.** It comes from the database, re-validated, cached for 5 s. If the database is unavailable, the seed policy in memory is used and the response says so.
3. **Provider health** = simulated outages (database, expire after 10 min) + runtime failures (2 consecutive → down for 60 s, per instance) + configuration (no key → unavailable).
4. **`check()` (Engine, deterministic):**
   1. **Canonicalise:** NFKC per code point, zero-width characters removed, plus a digits view with separators between digit groups removed. Both views keep a map to original offsets.
   2. **Detect:** `za_id`, `card`, `bank_account`, `email`, `phone_za`, `cred_known` (gitleaks patterns), `cred_assign`, `terms`. Overlaps are resolved by confidence, then span length, then detector order.
   3. **Decide:** per finding, the strictest matching rule for (data class, role, provider tier): block > tokenise > redact > allow, falling back to the class default.
   4. **Route:** the request's level is the highest level among findings in the **original** prompt. The router walks the routing order, skipping disabled, unhealthy, blocked-by-rule or not-cleared providers. If none is eligible, the request is blocked (`BLOCKED_BY_RULE` or `NO_ELIGIBLE_PROVIDER`).
   5. **Transform:** `[REDACTED:SA_ID]` / `[CLIENT_NAME_1]`, applied right to left. Identical values share a placeholder.
5. **Provider call** with the transformed text only (20 s timeout, 45 s total). On failure the provider is marked unhealthy and `check()` runs **again**. There is no blind fallback.
6. **Output guard:** remove canaries and system-prompt fragments, redact sensitive data above `public` that was not in the user's prompt, then restore placeholders tolerantly and count leftovers.
7. **Explain:** plain-English lines with rule ids and skipped providers.
8. **Audit:** one row of metadata. No text.

`POST /api/check` runs steps 1–4 without a provider call. It is used for live highlighting.

## Policy lifecycle

`POST /api/policy/compile` (admin):
1. The LLM (Gemini, then Groq; temperature 0) returns `name`, `dataClasses`, `rules`, `terms`, `coaching`.
2. Providers and routing are copied from the active policy.
3. The result is zod-validated. On failure there is one retry with the errors, then the next provider.
4. The result is saved as a **draft**.

The admin reviews it on `/admin/policy`:
- a decision diff (`policyDiff`) over every role × class × tier cell, with looser changes flagged
- the rules with their source clauses
- optionally `/admin/simulate`

`POST /api/policy/:id/activate` re-validates and calls `activate_policy()`, which archives the old version and activates the new one in one transaction.

## Data model

See [`supabase/schema.sql`](../supabase/schema.sql). `audit_events` columns:
- `channel`, `role`, `policy_version`
- `data_classes[]`, `final_action`, `rule_ids[]`
- `provider`, `outcome`, `latency_ms`

There is deliberately no text column.

## Deployment

- Two Vercel projects from one repository: `apps/api` (Express preset, region `lhr1`) and `apps/web` (Vite).
- Both are Git-connected, so `main` deploys to production.
- Supabase project in `eu-west-2`.
- CI runs typecheck, tests, build and gitleaks on every PR.

## Not built

- Second opinion: an optional tighten-only LLM check.
- Entropy detector and fuzzy term matching.
- Audit hash chain.
- Canary injection suite.
- Coding-agent enforcement: designed, see limitations.
- Browser extension (Lens): stretch, Phase 7.
