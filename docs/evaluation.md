# Evaluation (Bench)

> Method and results: drafted by Claude Code from `eval/results/results.json`. **Interpretation: Collins** (section at the end).
> All numbers come from synthetic data. Re-run with `npm run eval`; the committed results are in [`eval/results/results.md`](../eval/results/results.md).

## Method

**Dataset** (`eval/generate.ts`, `eval/templates.ts`, `eval/values.ts`)
- 307 prompts with 201 labelled sensitive values, generated from seed `20261029` by a local seeded RNG (mulberry32). Same seed, same dataset.
- All data is synthetic:
  - fictional names
  - `example.com`/`example.org` emails
  - SA ID numbers with valid dates and Luhn check digits
  - Luhn-valid card numbers
  - SA phone numbers
  - fake credentials in each known format, assembled at runtime
  - the seed policy's fictional client and project names
- Four categories:
  - **clean:** realistic logistics work prompts, with dates, times, versions, invoice and ticket numbers to provoke false alarms
  - **sensitive:** one or more labelled values
  - **evasion:** spaced, dashed, zero-width, fullwidth, line-break, plus two types the Engine is *known not to handle* (digits written as words, `name [at] example [dot] com`), included on purpose
  - **trap:** look-alikes that must not fire, such as 13-digit order numbers failing the checksum, Luhn-valid numbers with impossible dates, Luhn-failing 16-digit tracking numbers, the word "token" in prose, terms inside other words, and ISBNs
- **Split by template, not by sample.** Within each category, every third template goes to `dev` and the rest to `test`. No sentence template in `test` appears in `dev`; a test asserts this.
- The dataset file is regenerated on each run and **not committed**, because it contains fake secret-shaped strings that the CI secrets scan would (rightly) flag. Only metrics are committed.

**Configurations** (`eval/run.ts`)
- **A. No gateway:** everything is sent as typed.
- **B. Regex-only:** typical DLP-style patterns that accept common separators, but with no validators (Luhn, dates), no canonicalisation and no context gating (`eval/baseline.ts`).
- **C. Clearance Gateway:** the full deterministic pipeline (`check()` from `packages/core`), seed policy.
- **D. Second opinion:** not built.

**Metrics**
- **Per-class precision, recall and F1.** A predicted span counts if it overlaps a labelled span of the same class, and each label is matched at most once.
- **Evasion catch rate:** labelled values in evasion prompts that were found.
- **False-alarm rate:** share of trap prompts, and of clean prompts, with at least one finding.
- **Leakage:** labelled values the policy says must be protected that would reach a provider not fully redacted or pseudonymised (tier 1 healthy).
- **Policy matrix:** every role × data class × provider tier (96 cells) against the actions derived from the policy *text* (`eval/expected.ts`, written independently of `seed.ts`).
- **Failover safety:** with tier 1 down (and tiers 1 and 2 down), confidential or restricted requests sent to a provider whose clearance is below the request's *true* sensitivity (from the labels). Compared:
  - a naive "try the next provider" chain
  - the Clearance Gateway router, with unsafe sends split into **routing errors** (the router knew the level and still sent) and **detection misses** (the data went undetected, so the router saw a lower level)
- **Latency:** in-process `check()` (detect → route → transform → explain), with no network.

**What was not tuned:** nothing. The only tunable detector (entropy) is not built. Dev results are shown for transparency.

## Results (test split, 195 prompts)

| | No gateway | Regex-only | Clearance Gateway |
|---|---|---|---|
| Precision | n/a | 55.6% | **100.0%** |
| Recall | 0% | 59.5% | **92.9%** |
| Evasion caught | 0/54 | 3/54 | **45/54** |
| Trap prompts flagged | 0% | 64.4% | **0%** |
| Clean prompts flagged | 0% | 0% | **0%** |
| Values reaching a provider unprotected (of 126) | 126 | 48 | **9** (+27 requests blocked) |

**Failover safety** (87 confidential or restricted requests, tier 1 down):
- The naive chain sends **87** to a provider not cleared for them.
- The Clearance Gateway router makes **0 routing errors** and blocks 81.
- **6** were still sent unsafely, because their data went undetected: 3 SA ID numbers written as words and 3 AWS keys split across two lines. The router can only act on what detection finds.
- With tiers 1 and 2 down, the results are the same.

**Policy matrix:** 96/96 cells correct.

**Latency:** both p50 and p95 are under 1 ms per in-process check (no network). Exact values vary by machine and run; see `results.json`.

**Where the misses are** (Clearance Gateway, test split):
- SA ID (3, digits written as words)
- email (3, `[at]`/`[dot]` obfuscation)
- credential (3, AWS key split across a line break)

Every miss is an evasion type listed in [limitations.md](limitations.md).

**Dev split** (112 prompts): 100% precision, 100% recall, 0 unsafe sends. All the known-unhandled evasion templates landed in the test split.

## Threats to validity

- Synthetic data generated by the same team that wrote the detectors. Real prompts are messier, and phrasing outside these templates is untested.
- Small numbers per class (6–30 labels in test), so a single miss moves recall by several points.
- The baseline is one reasonable regex set, not the best possible one.
- Detection of *contextual* secrets (strategy, salaries, unreleased results) is not measured, because the Engine does not attempt it.

## Interpretation (Collins)

_To be written by Collins._
