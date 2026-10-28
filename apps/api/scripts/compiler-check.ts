// Compiler check (SPEC §14.6): compile the seed policy text N times with the real compiler and
// compare each result with the hand-written golden policy (seed.ts). A cell that is LOOSER than
// golden is critical. Writes eval/results/compiler-check.json and .md. Needs API keys in .env.
// Run: npm run compiler-check -w @clearance-gateway/api
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEED_POLICY, SEED_POLICY_TEXT, policyDiff } from "@clearance-gateway/core";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
process.env.OFFLINE_MODE = "false";
const { compilePolicy, CompilerError } = await import("../src/compiler/compile.js");

const RUNS = Number(process.env.COMPILER_RUNS ?? 3);
// Clauses that must produce at least one rule (1 is permissive context, 7 is routing, 8 is coaching).
const RULE_CLAUSES = ["2", "3", "4", "5", "6"];

const runs = [];
for (let i = 1; i <= RUNS; i++) {
  const started = Date.now();
  try {
    const { compiled, compiledBy, attempts } = await compilePolicy(SEED_POLICY_TEXT, SEED_POLICY);
    const diff = policyDiff(SEED_POLICY, compiled);
    const coveredClauses = RULE_CLAUSES.filter((n) => compiled.rules.some((r) => r.sourceClause?.trim().startsWith(`${n}.`)));
    runs.push({
      run: i,
      ok: true,
      compiledBy,
      attempts,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      rules: compiled.rules.length,
      clauseCoverage: { covered: coveredClauses, missing: RULE_CLAUSES.filter((n) => !coveredClauses.includes(n)) },
      coaching: compiled.coaching,
      looserThanGolden: diff.looserCount,
      stricterThanGolden: diff.stricterCount,
      cellChanges: diff.cells,
      levelChanges: diff.levels,
      terms: diff.terms,
    });
  } catch (err) {
    runs.push({ run: i, ok: false, error: err instanceof CompilerError ? err.code : "error", attempts: err instanceof CompilerError ? err.attempts : [] });
  }
  console.log(JSON.stringify(runs.at(-1), null, 0).slice(0, 600));
}

const ok = runs.filter((r) => r.ok) as Extract<(typeof runs)[number], { ok: true }>[];
const summary = {
  generatedAt: new Date().toISOString(),
  runs: RUNS,
  valid: ok.length,
  runsWithLooserCells: ok.filter((r) => r.looserThanGolden > 0).length,
  identicalDecisionsToGolden: ok.filter((r) => r.looserThanGolden === 0 && r.stricterThanGolden === 0 && r.terms.added.length === 0).length,
  details: runs,
};

const out = fileURLToPath(new URL("../../../eval/results/", import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(`${out}compiler-check.json`, JSON.stringify(summary, null, 2) + "\n");

const md = [
  "# Compiler check",
  "",
  `Generated ${summary.generatedAt}. The seed policy text was compiled ${RUNS} times and each result compared, decision by decision (8 data classes × 4 roles × 3 tiers), with the hand-written golden policy.`,
  "",
  `- Valid compilations: **${summary.valid}/${RUNS}**`,
  `- Runs with any decision LOOSER than golden (critical): **${summary.runsWithLooserCells}**`,
  `- Runs with decisions identical to golden: **${summary.identicalDecisionsToGolden}**`,
  "",
  "| Run | Compiled by | Attempts | Rules | Clauses missing a rule | Looser cells | Stricter cells | Level changes | Terms added / removed |",
  "|---|---|---|---|---|---|---|---|---|",
  ...runs.map((r) =>
    r.ok
      ? `| ${r.run} | ${r.compiledBy} | ${r.attempts.map((a) => `${a.provider}:${a.outcome}`).join(", ")} | ${r.rules} | ${r.clauseCoverage.missing.join(", ") || "none"} | ${r.looserThanGolden} | ${r.stricterThanGolden} | ${r.levelChanges.map((l) => `${l.dataClass} ${l.from}→${l.to}`).join("; ") || "none"} | ${r.terms.added.length} / ${r.terms.removed.length} |`
      : `| ${r.run} | failed (${r.error}) | ${r.attempts.map((a) => `${a.provider}:${a.outcome}`).join(", ")} | | | | | | |`,
  ),
  "",
  "Looser or stricter cells are listed in `compiler-check.json`. Compilation always produces a DRAFT: an admin reviews the decision diff before activating it.",
  "",
].join("\n");
writeFileSync(`${out}compiler-check.md`, md);
console.log("\n" + md);
