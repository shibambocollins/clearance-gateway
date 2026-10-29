# HANDOFF: verified state for the final documentation and pitch deck

Written by Claude Code on 29 Oct 2026, about 04:50 SAST, and **updated at about 05:10 SAST** after the open decisions were closed (D-066) and the stale doc lines were fixed (PR #24), on branch `handoff-summary` (not merged into `main`). Facts only: each claim has a source (file, command or URL), and anything not verified is marked **UNVERIFIED** with the reason. No app code, tests, policy or eval logic was changed while writing this. All sample data is synthetic. No secret values appear here.

Raw browser log of the judge-path walk-through: [`HANDOFF-judge-path-log.json`](HANDOFF-judge-path-log.json).

---

## 1. Repo state

| Item | Value | Source |
|---|---|---|
| `main` SHA | `034f828796a79bd36e0db097bd234a84a90ad5e3` when written; **after PR #24 (docs only) `main` is newer: run `git rev-parse origin/main`** | `git rev-parse HEAD` after merging PR #23 |
| Open PRs | none | `gh pr list --state open` returned `[]` |
| Last CI run on `main` | **success** for `034f828` (and for `8ced16f` before it) | `gh run list --branch main` |
| CI jobs on the latest PR (#23, run 40808480033) | "Typecheck, test, build": pass (26 s). "Secrets scan (gitleaks)": pass (6 s). | `gh pr checks 23` |
| Release tags | `lens-v0.3.0` (Latest), `lens-v0.2.0`, `lens-v0.1.0` | `gh release list` |
| Visibility | **PUBLIC** | `gh repo view --json visibility` |
| Branches | All feature branches are kept (Collins's instruction). `handoff-summary` is deliberately unmerged. | `git branch -r` |
| CLAUDE.md | Untracked and git-ignored (D-065). Still present in git history. | `.gitignore`, `git log -- CLAUDE.md` |

## 2. Checks (run locally on `main` at `034f828`)

| Check | Result | Source |
|---|---|---|
| `npm test` | `Test Files  26 passed (26)` / `Tests  381 passed (381)` | `npx vitest run` |
| `npm run typecheck` | No `error TS` lines printed; CI "Typecheck, test, build" also passes. (My local command printed no exit code of its own, so the CI result is the firm evidence.) | local run + `gh pr checks 23` |
| `npm run build` | `built in 930ms` (core, API, web), no errors | `npm run build` |
| `npm audit` (all workspaces) | `found 0 vulnerabilities` | `npm audit` |
| gitleaks, full history, locally | **UNVERIFIED**: gitleaks is not installed on this machine (`command -v gitleaks` found nothing). CI runs gitleaks on every PR and push to `main` and has passed. An earlier regex sweep of the whole history found no real keys (see `docs/security.md`). | local check; `docs/security.md` |

## 3. Bench

- Last commit that changed `eval/results/`: `f74bcb7` (2026-10-29 01:30:20 +0200) (`git log -1 -- eval/results`).
- `packages/core` / `eval/` changed afterwards in one commit, `63bac9b`: only the provider labels in `packages/core/src/policy/seed.ts` and the matching strings in `packages/core/src/check.test.ts` (`git diff --stat f74bcb7..HEAD -- packages/core eval`). No detector, routing or metric logic changed.
- **Re-ran `npm run eval` and diffed every field** against the committed `results.json`. Changed fields (3): `generatedAt` (2026-10-28T23:29:35Z → 2026-10-29T02:42:26Z), `latency.p50Ms` 0.047 → 0.076 ms, `latency.p95Ms` 0.09 → 0.176 ms. **Nothing else changed.** The re-run files were discarded, so the committed results are unchanged. Latency varies by machine and run.
- Current numbers (`eval/results/results.md`, generated 2026-10-28T23:29:35Z, seed `20261029`, 307 prompts, 195 test):

| Test split | No gateway | Regex-only | Clearance Gateway |
|---|---|---|---|
| Precision | n/a | 55.6% | 100.0% |
| Recall | 0% | 59.5% | 92.9% |
| Evasion caught | 0/54 | 3/54 | 45/54 |
| Trap prompts flagged | 0% | 64.4% | 0% |
| Clean prompts flagged | 0% | 0% | 0% |
| Labelled values unprotected (of 126) | 126 | 48 | 9 (+27 requests blocked) |

  - Failover, tier 1 down (test split, 87 confidential/restricted requests): naive chain unsafe 87; Clearance Gateway routing errors 0, undetected-data sends 6, blocked 81. Same with tiers 1 and 2 down.
  - Policy matrix 96/96. Latency p50 0.047 ms, p95 0.09 ms (committed values).
  - Dev split (112 prompts): recall 100%, precision 93.8%, trap false alarms 20%, 0 unsafe sends. The dev trap rise is explained in D-058 and `docs/evaluation.md`.
- Compiler check (`eval/results/compiler-check.md`, generated 2026-10-28T21:13:20Z): 3/3 valid, 0 runs with a looser decision than golden, 35 stricter decisions per run, 16 rules, model `gemini:gemini-3.5-flash-lite`.

## 4. Live system

Measured from Collins's Windows machine over the public internet (Vercel function in `lhr1`, London; Supabase `eu-west-2`), 29 Oct 2026 ~04:42 SAST.

`GET /health` (first call):

```json
{"status":"ok","service":"Clearance Gateway API","coreVersion":"0.3.0","offlineMode":false,"db":"ok","activePolicyVersion":1,"policyUpdatedAt":"2026-10-28T21:39:01.668628+00:00","policySource":"database","time":"2026-10-29T02:42:49.933Z"}
```

| Call | n | p50 | p95 | min / max |
|---|---|---|---|---|
| `GET /health` | 10, sequential, warm | 793 ms | 961 ms | 168 / 961 ms |
| `POST /api/check` (ID-number sample) | 10, sequential, warm | 178 ms | 260 ms | 174 / 260 ms |

- One `POST /api/chat` with the Clean sample: 370 ms measured by the client, `latencyMs` 116 ms reported by the server, outcome `sent`, provider "Approved enterprise AI", `mock: true`.
- The first request after the final merge (fresh deployment) took 2092 ms. This is **not** a controlled cold-start measurement.
- **Cold call after 15+ minutes idle: UNVERIFIED** (not run; it needs a 15-minute wait).
- Observation: `/health` was slower than `/api/check` in this run. Cause **UNVERIFIED** (both read the active policy, which is cached 5 s per instance, so different serverless instances may each be querying the database).
- Script: `timing.mjs` was a throwaway; the method is 10 sequential `fetch` calls timed with `performance.now()`.

## 5. Judge path (fresh headless Chrome, DevTools protocol, 1280 px)

Walked on https://clearance-gateway-web.vercel.app with a fresh profile. Exact texts, from `HANDOFF-judge-path-log.json`:

| README step | What was done | Exact result |
|---|---|---|
| 1 | Open app | Title "Clearance Gateway". Nav: Assistant, Dashboard, Evaluation, How it works, OpenBox (fictional), Policy, Simulator, Providers. Samples: Clean, ID number, API key, Client name, HR case, Outage case. |
| 2 | Click **ID number** | Highlighted: `8001015009087`. Badge: REDACTED. **What will be sent**: `Summarise this complaint: the customer with ID number [REDACTED:SA_ID] says her delivery arrived three days late.` |
| 2 | Click **Send** | **Why**: "Removed 1 South African ID number. Rule R-PII-01: ID numbers may not be sent to AI providers." / "Sent to Approved enterprise AI (tier 1)." Provider badge: "Approved enterprise AI · tier 1 · mock". Reply starts "(Mock reply from Approved enterprise AI. No real model was called.)" |
| 3 | Open **Simulate a provider outage**, enter code, click first **Simulate outage** | Buttons before: Simulate outage ×3, "Reset (seed policy, no outages)". After: "Outage on: restore", Simulate outage ×2. |
| 4 | **Send** again | BLOCKED badge. "Blocked: no approved provider is available for confidential data right now (fail closed, rule R-ROUTE-01)." / "Not used: Approved enterprise AI (unavailable); Google Gemini (not cleared for confidential data); Groq (not cleared for confidential data)." |
| 4 (optional) | Clean sample, **Send** | Provider "Google Gemini · tier 2". "No sensitive data found." / "Sent to Google Gemini (tier 2); skipped Approved enterprise AI (unavailable)." |
| 5 | Open **Evaluation** | Tiles: 92.9% recall, 100.0% precision, 0.0% trap prompts flagged, 0 unsafe routing decisions in an outage (naive fallback: 87 of 87), 96/96 policy matrix, 0.047 ms p50 |
| 6 | **Reset** | Worked (HTTP 200 on the API reset as well). Providers all healthy afterwards (`GET /api/providers`). |

**Differences from the README:** (1) the button reads **"Reset (seed policy, no outages)"**, while README step 6 says "Click **Reset**" (minor). Everything else matches the README text exactly.

## 6. Screenshots (`docs/screenshots/`, 1280 px wide, synthetic samples)

`assistant-id-number.png`, `reply-why.png`, `fail-closed-block.png`, `policy-decision-diff.png` (reviews the stored deliberately relaxed draft v4: "98 changes would LOOSEN protection"), `evaluation.png`, `dashboard.png`, `openbox-without-lens.png`. Index: `docs/screenshots/README.md`. The outage was reset afterwards.

- **Lens overlay screenshot: UNVERIFIED / not delivered.** Headless Chrome did not load the extension (no overlay host appeared, and the OpenBox page accepted the message unchecked). The unprotected page is kept as `openbox-without-lens.png`, named honestly. A real overlay screenshot needs a headed Chrome with the extension loaded.

## 7. Diagrams (`docs/diagrams/`, plain draw.io style, 2× PNG, editable `.drawio`, README with open-in-draw.io links)

- (a) **Use case diagram**: `use-cases` (Employee, Admin, Lens extension, AI provider). Done.
- (b) **Failover sequence**: `failover-sequence` (tier 1 down; naive chain 87/87 unsafe vs gateway 0 routing errors, 81 blocked, 6 undetected; numbers from `results.md`). Done.
- (c) **System map**: **NOT DONE.** `docs/system-map.md` is still the 283-byte scaffold (headings only), so there is nothing to draw from. To do once Collins commits it, with the caption "Analysis: Collins; drawn by Claude Code".
- (d) **Data model**: `data-model` (`audit_events` has no text column; also `usage_counters`, `simulated_outages`, `policy_versions`). Done.
- Style: these use the **plain draw.io style** Collins asked for later (D-064), not the earlier sketch style.

## 8. Consistency check (claims vs code or live app)

| Claim | Where | Verdict |
|---|---|---|
| "381 tests" | `README.md` (Technology). The current `architecture.png` no longer states a test count (an earlier sketch version said "381 tests"; replaced in PR #21). | **Correct**: `npm test` gives 381. |
| "public repo" | Earlier architecture diagram version only | Repo is PUBLIC (`gh repo view`). Current diagram doesn't claim it. |
| "live everywhere in about 5 seconds" | `docs/diagrams/policy-lifecycle.drawio/.png`; `docs/architecture.md` says "cached for 5 s" | Code: `CACHE_MS = 5_000` per serverless instance (`apps/api/src/policy/active.ts:8`). One live check on 28 Oct saw the new policy within a 6 s wait (decision changed). **Not re-measured today; across all instances UNVERIFIED.** |
| What clean prompts go to when all providers are up | README (judge path) | Verified live: `POST /api/chat` Clean → "Approved enterprise AI" (tier 1, **mock**). Routing order `["mock-enterprise","gemini","groq"]` (`packages/core/src/policy/seed.ts:123`). This is the open decision **D-025**. |
| Lens release version | README links `/releases/latest` | `lens-v0.3.0` zip: manifest `Clearance Gateway Lens (demo)` **0.3.0**, includes `icons\*.png`. `main`: `Clearance Gateway Lens` 0.3.0. **Version matches; the release zip still has "(demo)" in the extension name** (built before the label tweak). |

**Other stale or inconsistent statements found** (items 1, 2, 3 and the README Reset label were **fixed in PR #24**; the rest remain):
1. `docs/architecture.md` lines 66-73, "Not built" lists "Browser extension (Lens): stretch, Phase 7". **Wrong: Lens is built.**
2. `docs/limitations.md` line 3 says "SPEC §19 has the starting list"; that section is now §16 after the spec was trimmed.
3. `docs/security.md` line 55 says "It was not switched on tonight…" (time-relative wording).
4. `docs/intervention.md` line 3 refers to "SPEC §1 lists related work": still true (§1 exists).
5. The header "Policy updated …" changes whenever **Reset** is used (`activate_policy` sets `activated_at = now()`). It showed Oct 28 11:39 PM before today's tests and Oct 29 04:44 AM after the walk-through's Reset. It means "last activation", not "last change to the policy's content".
6. The Lens release zip's extension name still contains "(demo)" (see above).
7. `docs/decisions.md` D-010/D-011 etc. mention "demo" provider labels from before D-060; they're history, not wrong.

## 9. Docs status

| File | Status | Placeholder / scaffold lines |
|---|---|---|
| `README.md` | **Complete except one placeholder** | Line 193: `**What Collins designed and decided:** _to be written by Collins._` |
| `docs/system-map.md` | **Scaffold only** | `> **Collins writes this document.** Credify requires participants to show their own reasoning. The headings below are a scaffold only.` (headings: Problem and context, Stakeholders, Root causes, System relationships, Where Clearance Gateway intervenes) |
| `docs/intervention.md` | **Scaffold only** | `> **Collins writes this document.** The headings below are a scaffold only. SPEC §1 lists related work…` (headings: Options considered, Why this intervention, Feasibility, Risks and assumptions, Expected impact and how to measure it in a pilot) |
| `docs/evaluation.md` | **Complete except the interpretation** | Line 84: `_To be written by Collins._` (section "Interpretation (Collins)") |
| `docs/architecture.md` | Complete, with one stale line (see §8.1) | none |
| `docs/limitations.md` | Complete (see §8.2) | none |
| `docs/security.md` | Complete (see §8.3) | none |
| `docs/decisions.md` | Complete, D-001 to D-065 | none |
| `docs/SPEC.md` | Complete (trimmed in D-065) | none |
| `docs/diagrams/README.md`, `docs/screenshots/README.md` | Complete | The system map row says "to be added" |

## 10. Decisions

**Added after D-063:** D-064 (diagrams restyled to plain draw.io), D-065 (final polish: footer and logo dot removed, CLAUDE.md untracked, SPEC trimmed, README rewritten).

**Update 05:10: all closed by D-066 (Collins delegated: "use best practices").** D-024 kept as written; D-025 kept (approved provider first); D-040 presented as 0 routing errors + 6 detection misses. The list below is the original record.

**Originally waiting on Collins:**
- **D-024**: how the seed policy text maps to rules (redact vs block, exceptions by narrowing). "Collins to review the clause interpretation."
- **D-025**: routing order. SPEC order kept (tier-1 mock first, so clean prompts get mock replies). Alternative: put Gemini first. Not chosen yet.
- **D-040**: how to present failover safety (0 routing errors + 6 detection misses vs a single "6"). README and Evaluation page use the first wording; not explicitly confirmed.
- **D-047**: compiler reads clause 2 as "block"; D-050 records the decision to keep the wording, so this is resolved.
- **Follow-ups, not numbered decisions:** rotate the admin code and the reused Gemini/Groq keys after judging (D-037); decide on Dependabot (see §12).

## 11. AI-use facts

**Built by Claude Code, per PR** (`gh pr list --state merged`):

| Phase / work | PR | Main files |
|---|---|---|
| Phase 0 scaffold and deploy | #2 (+#1) | `package.json`, `packages/core`, `apps/api/src/app.ts`, `apps/web`, `supabase/schema.sql` |
| Vercel result log; CI; Supabase live | #3, #4, #5 | `.github/workflows/ci.yml`, `apps/api/vercel.json`, `docs/decisions.md` |
| Phase 1: detectors | #7 | `packages/core/src/canonicalise.ts`, `detectors/*` |
| Phase 2: policy engine | #8 | `policy/schema.ts`, `policy/seed.ts`, `decide.ts`, `route.ts`, `transform.ts`, `explain.ts`, `apps/api/src/routes/check.ts` |
| Phase 3: chat path | #9, #10 | `apps/api/src/routes/chat.ts`, `providers/*`, `outputGuard.ts`, `rateLimit.ts`, `audit.ts`, `AssistantPage.tsx` |
| Phase 5: Bench | #11 | `eval/*`, `EvaluationPage.tsx`, `docs/evaluation.md` |
| Phase 4: compiler | #12 | `apps/api/src/compiler/*`, `routes/policy.ts`, `AdminPolicyPage.tsx`, `AdminSimulatePage.tsx`, `policy/diff.ts` |
| Phase 6: dashboard, README | #13 | `routes/stats.ts`, `DashboardPage.tsx`, `ProvidersPage.tsx`, `AboutPage.tsx`, `README.md`, `docs/architecture.md` |
| Phase 7: Lens | #14, #15, #18 | `extension/*`, `DemoChatPage.tsx` |
| FinMe design system | #16 | `apps/web/src/styles.css`, `index.html` |
| Near-valid SA ID fix | #17 | `packages/core/src/detectors/zaId.ts` |
| Polish, security | #19 | `docs/security.md`, policy floor, security headers |
| Diagrams | #20, #21, #23 | `docs/diagrams/*`, `docs/screenshots/*` |
| Final polish | #22 | `README.md`, `docs/SPEC.md`, `.gitignore` |

**Decisions where Collins appears in "Proposed by"** (`docs/decisions.md`): D-011 (Supabase setup, "whatever works fastest"), D-015 (asked for CI), D-016 (accepted London region), D-037 (reused test keys), D-050 (kept clause 2 unchanged), D-054 (Lens beyond the demo page, opt-in), D-056 (no Web Store before deadline), D-057 (FinMe design system), D-058 (found the near-valid SA ID gap), D-059 (Lens design and icon), D-060 (removed "(demo)" labels), D-063 (diagrams), D-064 (plain diagram style), D-065 (final polish).

## 12. Known issues and security follow-ups

**Rough edges found:**
1. `/health` is much slower than `/api/check` (p50 793 ms vs 178 ms); cause UNVERIFIED (§4).
2. The "Policy updated" header date moves on every Reset (§8.5).
3. Production `policy_versions` holds drafts v2, v3 and v4 (v4 is the deliberately relaxed policy, refused by the floor). Harmless and visible in the Policy page history. Collins said they are OK.
4. The Lens overlay has **never been confirmed in a real browser by Claude** (headless Chrome won't load extensions). Collins was asked to test it by hand. Per-site protection is untested on real AI sites (documented in `docs/limitations.md`).
5. Stale doc lines listed in §8.
6. `README.md` step 6 label mismatch (§5).
7. The fictional-company policy text can compile stricter than the hand-written golden policy (35 cells); documented (D-047/D-050).

**Security:**
- **Admin code** (`credify-8d724294`) is public in the README by design. It can compile (budgeted), simulate outages (10-minute expiry) and activate stricter policies; a policy floor refuses looser ones. **Rotate after judging.**
- **Provider keys** (Gemini, Groq) were reused from other local projects (D-037). **Rotate after judging.**
- **Env vars set (names only):** local `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `OFFLINE_MODE`, `DEMO_ADMIN_CODE`, `RATE_LIMIT_PER_CLIENT_PER_DAY`, `GLOBAL_DAILY_CAP`, `CLIENT_HASH_SALT`, `PORT`, `VITE_API_URL`, `SUPABASE_DB_PASSWORD` are set; `CORS_ORIGINS` is **unset** locally (it is set on Vercel). Vercel's contents were not re-listed in this pass (UNVERIFIED today; production `/health` shows `db: ok` and real providers answered during the run).
- **Dependabot:** alerts and security updates were **disabled** at the last check (`gh api repos/.../dependabot/alerts` returned "disabled"). Secret scanning and push protection are **enabled** (`gh api repos/...` security_and_analysis). Not re-checked in this pass.
- `npm audit`: 0 vulnerabilities (§2).

---

## Summary

1. **Verified:** `main` `034f828` is green (CI incl. gitleaks); 381 tests, typecheck and build pass; `npm audit` clean; repo public; Lens `lens-v0.3.0` matches `main` at version 0.3.0.
2. **Verified (Bench):** results are current; the re-run changed only the timestamp and in-process latency.
3. **Verified (live):** `/health` ok with real providers; judge path works end to end with exact texts recorded; screenshots and 3 new diagrams are on `main`.
4. **Broken or off:** stale doc lines (architecture "Lens not built", SPEC §19 reference, "tonight"); `/health` is slow vs `/api/check`; the header date moves on Reset; README says "Reset" while the button says "Reset (seed policy, no outages)".
5. **UNVERIFIED:** Lens overlay in a real browser (no screenshot), cold start after 15 min idle, 5-second propagation across instances, local gitleaks, current Vercel env contents, Dependabot status today; and the **system-map diagram is not done** because `docs/system-map.md` is still a scaffold.
