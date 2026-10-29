# Security review and threat model

> Technical security review of the Clearance Gateway prototype and its repository, run on 29 Oct 2026 (Claude Code, for Collins to review). It covers what was checked, what was found, what was fixed, and what is accepted as a demo limitation.

## Scope and method

- **Code:** API (`apps/api`), Engine (`packages/core`), web app, Lens extension, Bench, database schema.
- **Repository:** full git history, CI, GitHub security settings.
- **Live system:** production API and web headers, database access rules.
- **Automated checks:**
  - `npm audit` (all workspaces)
  - gitleaks on every PR and push (CI)
  - a regex sweep of the **entire git history** for provider-key, Supabase-key, JWT and PEM shapes
  - a check that `.env` never appears in history
  - GitHub security settings via the API

## Results of the automated checks

| Check | Result |
|---|---|
| `npm audit` (production and dev dependencies) | **0 vulnerabilities** |
| gitleaks (CI, every PR) | **Passing** on every merged PR. One false positive on a test string (PR #6) was fixed by building fake secrets at runtime (D-021); that branch was never merged. |
| Secret sweep of full git history | **No real keys.** Only matches: a placeholder PEM header string in early test/preview code (since removed), and the demo admin code, which is public by design (README). |
| `.env` in git history | **Never committed** (`.gitignore` from the first commit; only `.env.example`) |
| GitHub secret scanning / push protection | **Enabled / enabled** |
| GitHub Dependabot alerts / security updates | **Disabled** → recommendation below |

## Threat model (what could go wrong, and what stops it)

| # | Threat | Mitigation in the build | Residual risk |
|---|---|---|---|
| T1 | Sensitive data reaches an AI provider not cleared for it | Deterministic detect → decide → transform → route; request level taken from the **original** prompt; **fail closed** when no provider is eligible; provider failures re-routed under the same policy (D-031) | Undetected data is treated as public (measured: 6/87 in the failover test, all detection misses, 0 routing errors) |
| T2 | Evasion (spacing, zero-width, fullwidth, altered check digits) | Canonicaliser with an offset map; near-valid SA IDs flagged at low confidence (D-058) | Digits as words, `[at]`/`[dot]`, keys split across lines (measured, listed in limitations) |
| T3 | **LLM in the enforcement path** (OWASP LLM01 prompt injection) | No LLM decides whether a prompt goes through. The compiler only drafts; output is zod-validated, providers and routing are not LLM-controlled (D-044), and an admin must activate | A compiled draft can still misread wording; caught by the decision diff, simulator and policy floor |
| T4 | Sensitive data or instructions leaking **back** in replies (LLM02, LLM07) | Output guard: redacts sensitive data not in the user's prompt, removes system-prompt fragments and canaries, restores only the placeholders it issued | Paraphrased leaks are not caught |
| T5 | Prompt or reply text stored or logged | Audit rows hold metadata only (no text column); errors never echo input; token maps live for one request; API responses are `Cache-Control: no-store` | Vercel/Supabase platform logs hold request metadata (not bodies) |
| T6 | Database exposed to the browser | RLS on every table with **no policies**; the service-role key lives only in the API's environment; database functions executable by `service_role` only; web and extension never talk to Supabase | Compromise of the API's environment |
| T7 | **Public demo admin code** abused | (a) **Policy floor**: activation is refused if any decision would be looser than the baseline policy (D-061); (b) compile has its own daily budget per visitor and in total (D-062); (c) simulated outages expire after 10 minutes (D-048); (d) Reset restores the seed | Someone can still *tighten* the policy or toggle outages for up to 10 minutes; rotate the code after judging |
| T8 | Cost abuse of real LLMs | Per-visitor and global daily caps on `/api/chat` (mock fallback; fail closed if usage can't be counted); compile budget (T7) | Distributed abuse across many IPs up to the global cap |
| T9 | Browser-side attacks on the web app | Strict **Content-Security-Policy** (scripts from self only, no framing, no plugins), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS (D-062); React escapes all output; no `dangerouslySetInnerHTML` | Inline styles are allowed (`style-src 'unsafe-inline'`, needed by the chart library) |
| T10 | Lens extension misuse | Content script only on the demo page or sites the user explicitly protects; pages can send only `{text, role}`; the background calls a **fixed** API URL; the overlay is built with `textContent` in a closed shadow root; fails closed | A user can switch Lens off; heuristic site support (limitations) |
| T11 | Cross-origin access to the API | CORS allowlist (web origin, localhost, `chrome-extension://` ids); 16 KB body limit; zod validation | Extension origins are allowed broadly; `/api/check` is public by design and calls no LLM |
| T12 | Secrets in the repository | gitleaks in CI; fake test secrets built at runtime; `.env` ignored; GitHub push protection | Provider keys were **reused from other local projects** for testing (D-037) |

## Fixed during this review

1. **Policy floor** (T7): activating a version looser than the baseline is refused with `409 looser_than_floor` (`POLICY_FLOOR=off` disables it outside the public demo).
2. **Compile budget** (T7/T8): `10` compiles per visitor per day and `100` in total, counted atomically in `usage_counters`; fails closed.
3. **API headers:** `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `CSP: default-src 'none'`.
4. **Web headers:** CSP, HSTS, `nosniff`, `DENY` framing, `Referrer-Policy`, `Permissions-Policy` (`apps/web/vercel.json`).

## Recommendations (not done: need Collins's decision or are post-challenge)

- **Rotate after judging:** the demo admin code, and the Gemini/Groq keys reused from other projects (D-037). Give this project its own keys.
- **Enable Dependabot alerts and security updates** in the repository settings (Settings → Code security). It was left off during judging to avoid automated pull requests.
- **Production auth:** replace the shared admin code with SSO and per-admin audit of policy changes (who compiled, who activated).
- **Tamper-evident audit:** the SPEC's hash chain (COULD) would make audit edits detectable.
- **Second-opinion check:** an LLM may only *tighten* a decision, never loosen it (SPEC §10), for contextual secrets the patterns can't see.
