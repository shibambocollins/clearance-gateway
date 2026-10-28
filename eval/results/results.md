# Clearance Gateway Bench results

Generated 2026-10-28T19:31:48.345Z · seed `20261029` · Engine 0.3.0 · **synthetic data only**

Dataset: 307 prompts (201 labelled spans): test 195, dev 112. 67 templates (test 43, dev 24); template-disjoint: **yes**.

## Detection (test split)

| Config | Precision | Recall | F1 | Evasion caught | FP rate: traps | FP rate: clean |
|---|---|---|---|---|---|---|
| A. No gateway (everything sent) | n/a | 0.0% | n/a | 0/54 (0.0%) | 0.0% | 0.0% |
| B. Regex-only (no validators, canonicalisation or context) | 55.6% | 59.5% | 57.5% | 3/54 (5.6%) | 64.4% | 0.0% |
| C. Clearance Gateway (full deterministic pipeline) | 100.0% | 92.9% | 96.3% | 45/54 (83.3%) | 0.0% | 0.0% |

### Per class, configuration C (test)

| Class | TP | FP | FN | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| SA_ID | 9 | 0 | 3 | 100.0% | 75.0% | 85.7% |
| CARD_NUMBER | 15 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| BANK_ACCOUNT | 18 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| EMAIL | 9 | 0 | 3 | 100.0% | 75.0% | 85.7% |
| PHONE | 21 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| CREDENTIAL | 27 | 0 | 3 | 100.0% | 90.0% | 94.7% |
| CLIENT_NAME | 12 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| PROJECT_CODENAME | 6 | 0 | 0 | 100.0% | 100.0% | 100.0% |

### Evasion by type, configuration C (all splits)

| Evasion type | Caught |
|---|---|
| dashed | 6/6 |
| zero-width | 21/21 |
| line-break | 12/15 |
| digits-as-words (known unhandled) | 0/3 |
| spaced | 12/12 |
| fullwidth | 21/21 |
| at-dot (known unhandled) | 0/3 |

## Leakage (test split, tier 1 healthy)

Labelled values the policy says must be protected: 126.

| Config | Values reaching a provider unprotected |
|---|---|
| A. No gateway | 126 |
| B. Regex-only | 48 |
| C. Clearance Gateway | 9 (and 27 requests blocked outright) |

## Failover safety (test split)

Confidential or restricted requests sent to a provider not cleared for them:

| Scenario | Requests | Naive "try the next provider" | Clearance Gateway: routing errors | Clearance Gateway: unsafe because data went undetected | Blocked (fail closed) |
|---|---|---|---|---|---|
| Tier 1 down | 87 | 87 | 0 | 6 | 81 |
| Tiers 1 and 2 down | 87 | 87 | 0 | 6 | 81 |

The router only sees what detection finds. Undetected sends came from these templates: `evasion-id-digits-as-words`, `evasion-aws-line-break`.

## Policy matrix

Role × data class × provider tier: 96 cells. Configuration C: 96/96 (100.0%). No gateway: 2/96 (2.1%).

## Latency

In-process `check()` (detect → route → transform → explain), no network: p50 0.068 ms, p95 0.129 ms over 975 calls.

## Notes

- All data is synthetic, generated from the seed. Reproduce with: npm run eval (BENCH_SEED overrides the seed).
- Split by template: no sentence template used in test appears in dev.
- No parameters were tuned: the only tunable detector (entropy) is not built. Dev is reported for transparency.
- Configuration D (second opinion) was not built.
- Evasion types digits-as-words and at-dot are included on purpose even though the Engine does not handle them.
- Failover safety counts requests whose true sensitivity (from labels) exceeds the receiving provider's clearance.
- Leakage counts labelled values the policy says must be protected that would reach a provider not fully redacted or pseudonymised (tier 1 healthy).
