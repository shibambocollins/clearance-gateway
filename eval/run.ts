// Bench runner (SPEC §14). Generates the dataset from the seed, runs configurations A–C, and
// writes eval/results/results.json and results.md. Results contain metrics only, never sample text.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CORE_VERSION,
  DATA_CLASS_IDS,
  ROLE_IDS,
  SEED_POLICY,
  check,
  decideAction,
  detect,
  levelRank,
  type Level,
  type ProviderHealth,
  type Tier,
} from "@clearance-gateway/core";
import { regexOnlyDetect, type Span } from "./baseline.js";
import { expectedSeedAction } from "./expected.js";
import { DEFAULT_SEED, generateDataset, type Case, type Label } from "./generate.js";
import { detectionMetrics, percentile, round, type DetectionMetrics } from "./metrics.js";
import { TEMPLATES } from "./templates.js";
import { UNHANDLED_EVASIONS } from "./values.js";

const policy = SEED_POLICY;
const seed = Number(process.env.BENCH_SEED ?? DEFAULT_SEED);
const dataset = generateDataset(seed);
const splits = { test: dataset.filter((c) => c.split === "test"), dev: dataset.filter((c) => c.split === "dev") };

// ---------------------------------------------------------------- configurations
type ConfigId = "A" | "B" | "C";
const CONFIGS: Record<ConfigId, { label: string; predict: (c: Case) => Span[] }> = {
  A: { label: "A. No gateway (everything sent)", predict: () => [] },
  B: { label: "B. Regex-only (no validators, canonicalisation or context)", predict: (c) => regexOnlyDetect(c.text) },
  C: { label: "C. Clearance Gateway (full deterministic pipeline)", predict: (c) => detect(c.text, { terms: policy.terms }) },
};

// ---------------------------------------------------------------- leakage: labelled values reaching a provider unprotected
const covered = (label: Label, spans: { start: number; end: number }[]) => {
  for (let i = label.start; i < label.end; i++) if (!spans.some((s) => s.start <= i && i < s.end)) return false;
  return true;
};

function leakage(cases: Case[]) {
  const result = { A: 0, B: 0, C: 0, labelsRequiringProtection: 0, cBlockedRequests: 0 };
  for (const c of cases) {
    const mustProtect = c.labels.filter((l) => expectedSeedAction(l.dataClass, c.role, 1) !== "allow");
    result.labelsRequiringProtection += mustProtect.length;
    result.A += mustProtect.length; // no gateway: everything is sent as typed
    const bSpans = regexOnlyDetect(c.text); // regex-only: redacts whatever it matched, never blocks
    result.B += mustProtect.filter((l) => !covered(l, bSpans)).length;
    const { decision } = check(c.text, { policy, role: c.role });
    if (decision.action === "block") {
      result.cBlockedRequests++;
      continue;
    }
    const protectedSpans = decision.perFinding.filter((d) => d.action !== "allow").map((d) => d.finding);
    result.C += mustProtect.filter((l) => !covered(l, protectedSpans)).length;
  }
  return result;
}

// ---------------------------------------------------------------- failover safety
const classLevel = (dc: string): Level => policy.dataClasses.find((d) => d.id === dc)?.level ?? "restricted";
const trueLevel = (c: Case): Level =>
  c.labels.reduce<Level>((lvl, l) => (levelRank(classLevel(l.dataClass)) > levelRank(lvl) ? classLevel(l.dataClass) : lvl), "public");

const SCENARIOS = [
  { name: "Tier 1 down", down: ["mock-enterprise"] },
  { name: "Tiers 1 and 2 down", down: ["mock-enterprise", "gemini"] },
];

function failover(cases: Case[]) {
  return SCENARIOS.map(({ name, down }) => {
    const health: ProviderHealth = Object.fromEntries(down.map((id) => [id, false]));
    type Row = { requests: number; naiveUnsafe: number; oursUnsafe: number; oursRoutingErrors: number; oursDetectionMisses: number; oursBlocked: number; oursSent: number };
    const byLevel: Record<string, Row> = {};
    const missedTemplates = new Set<string>();
    for (const c of cases) {
      const level = trueLevel(c);
      if (levelRank(level) < levelRank("internal")) continue;
      const row = (byLevel[level] ??= { requests: 0, naiveUnsafe: 0, oursUnsafe: 0, oursRoutingErrors: 0, oursDetectionMisses: 0, oursBlocked: 0, oursSent: 0 });
      row.requests++;
      // Naive chain: send to the first provider that is up, whatever the data.
      const naive = policy.routing.order.map((id) => policy.providers.find((p) => p.id === id)!).find((p) => !down.includes(p.id))!;
      if (levelRank(level) > levelRank(naive.maxLevel)) row.naiveUnsafe++;
      const { decision } = check(c.text, { policy, role: c.role, health });
      if (!decision.provider) row.oursBlocked++;
      else {
        row.oursSent++;
        if (levelRank(level) > levelRank(decision.provider.maxLevel)) {
          row.oursUnsafe++;
          // The router only sees the DETECTED level. If that is below the true level, the unsafe
          // send was caused by a detection miss; otherwise it would be a routing error.
          if (levelRank(decision.level) < levelRank(level)) {
            row.oursDetectionMisses++;
            if (levelRank(level) >= levelRank("confidential")) missedTemplates.add(c.template);
          } else row.oursRoutingErrors++;
        }
      }
    }
    const sum = (key: keyof Row) => ["confidential", "restricted"].reduce((n, lvl) => n + (byLevel[lvl]?.[key] ?? 0), 0);
    return {
      scenario: name,
      providersDown: down,
      confidentialOrRestricted: {
        requests: sum("requests"),
        naiveUnsafe: sum("naiveUnsafe"),
        oursUnsafe: sum("oursUnsafe"),
        oursRoutingErrors: sum("oursRoutingErrors"),
        oursDetectionMisses: sum("oursDetectionMisses"),
        oursBlocked: sum("oursBlocked"),
      },
      detectionMissTemplates: [...missedTemplates],
      byLevel,
    };
  });
}

// ---------------------------------------------------------------- policy matrix
function policyMatrix() {
  const tiers: Tier[] = [1, 2, 3];
  const failures: string[] = [];
  let cells = 0;
  for (const dc of DATA_CLASS_IDS)
    for (const role of ROLE_IDS)
      for (const tier of tiers) {
        cells++;
        const expected = expectedSeedAction(dc, role, tier);
        const actual = decideAction(policy, dc, role, tier).action;
        if (actual !== expected) failures.push(`${dc}/${role}/tier ${tier}: expected ${expected}, got ${actual}`);
      }
  const allowCells = DATA_CLASS_IDS.flatMap((dc) => ROLE_IDS.flatMap((role) => tiers.map((t) => expectedSeedAction(dc, role, t)))).filter(
    (a) => a === "allow",
  ).length;
  return {
    cells,
    C: { passed: cells - failures.length, rate: round((cells - failures.length) / cells), failures },
    // With no gateway everything is allowed, which is only right where the policy says "allow".
    A: { passed: allowCells, rate: round(allowCells / cells) },
  };
}

// ---------------------------------------------------------------- latency (in-process, no network)
function latency(cases: Case[]) {
  const runs = 5;
  for (const c of cases) check(c.text, { policy, role: c.role }); // warm-up
  const times: number[] = [];
  for (let r = 0; r < runs; r++)
    for (const c of cases) {
      const t = performance.now();
      check(c.text, { policy, role: c.role });
      times.push(performance.now() - t);
    }
  return { p50Ms: percentile(times, 50), p95Ms: percentile(times, 95), calls: times.length };
}

// ---------------------------------------------------------------- dataset summary
const count = (cases: Case[], key: "category" | "split") =>
  cases.reduce<Record<string, number>>((acc, c) => ((acc[c[key]] = (acc[c[key]] ?? 0) + 1), acc), {});
const templatesIn = (split: "dev" | "test") => [...new Set(dataset.filter((c) => c.split === split).map((c) => c.template))];
const devTemplates = templatesIn("dev");
const testTemplates = templatesIn("test");

const results = {
  generatedAt: new Date().toISOString(),
  seed,
  engineVersion: CORE_VERSION,
  dataset: {
    synthetic: true,
    total: dataset.length,
    labels: dataset.reduce((n, c) => n + c.labels.length, 0),
    bySplit: count(dataset, "split"),
    byCategory: { test: count(splits.test, "category"), dev: count(splits.dev, "category") },
    templates: { total: TEMPLATES.length, dev: devTemplates.length, test: testTemplates.length },
    templateDisjoint: devTemplates.every((t) => !testTemplates.includes(t)),
    unhandledEvasionTypes: UNHANDLED_EVASIONS,
  },
  configs: Object.fromEntries(
    (Object.keys(CONFIGS) as ConfigId[]).map((id) => [
      id,
      {
        label: CONFIGS[id].label,
        test: detectionMetrics(splits.test, CONFIGS[id].predict),
        dev: detectionMetrics(splits.dev, CONFIGS[id].predict),
      },
    ]),
  ) as Record<ConfigId, { label: string; test: DetectionMetrics; dev: DetectionMetrics }>,
  leakage: { test: leakage(splits.test), dev: leakage(splits.dev) },
  failover: { test: failover(splits.test), dev: failover(splits.dev) },
  policyMatrix: policyMatrix(),
  latency: latency(splits.test),
  notes: [
    "All data is synthetic, generated from the seed. Reproduce with: npm run eval (BENCH_SEED overrides the seed).",
    "Split by template: no sentence template used in test appears in dev.",
    "No parameters were tuned: the only tunable detector (entropy) is not built. Dev is reported for transparency.",
    "Configuration D (second opinion) was not built.",
    `Evasion types ${UNHANDLED_EVASIONS.join(" and ")} are included on purpose even though the Engine does not handle them.`,
    "Failover safety counts requests whose true sensitivity (from labels) exceeds the receiving provider's clearance.",
    "Leakage counts labelled values the policy says must be protected that would reach a provider not fully redacted or pseudonymised (tier 1 healthy).",
  ],
};

// ---------------------------------------------------------------- write
const outDir = fileURLToPath(new URL("./results/", import.meta.url));
const dataDir = fileURLToPath(new URL("./data/", import.meta.url));
mkdirSync(outDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
writeFileSync(`${dataDir}dataset.json`, JSON.stringify(dataset, null, 2)); // gitignored: contains fake secrets
writeFileSync(`${outDir}results.json`, JSON.stringify(results, null, 2) + "\n");
writeFileSync(`${outDir}results.md`, renderMarkdown());

function pct(x: number | null) {
  return x === null ? "n/a" : `${(x * 100).toFixed(1)}%`;
}

function renderMarkdown(): string {
  const lines: string[] = [];
  const { dataset: d } = results;
  lines.push("# Clearance Gateway Bench results", "");
  lines.push(`Generated ${results.generatedAt} · seed \`${seed}\` · Engine ${CORE_VERSION} · **synthetic data only**`, "");
  lines.push(
    `Dataset: ${d.total} prompts (${d.labels} labelled spans): test ${d.bySplit.test}, dev ${d.bySplit.dev}. ` +
      `${d.templates.total} templates (test ${d.templates.test}, dev ${d.templates.dev}); template-disjoint: **${d.templateDisjoint ? "yes" : "NO"}**.`,
    "",
  );
  lines.push("## Detection (test split)", "");
  lines.push("| Config | Precision | Recall | F1 | Evasion caught | FP rate: traps | FP rate: clean |", "|---|---|---|---|---|---|---|");
  for (const id of ["A", "B", "C"] as ConfigId[]) {
    const m = results.configs[id].test;
    lines.push(
      `| ${results.configs[id].label} | ${pct(m.overall.precision)} | ${pct(m.overall.recall)} | ${pct(m.overall.f1)} | ` +
        `${m.evasion.caught}/${m.evasion.total} (${pct(m.evasion.rate)}) | ${pct(m.trapFalsePositives.rate)} | ${pct(m.cleanFalsePositives.rate)} |`,
    );
  }
  lines.push("", "### Per class, configuration C (test)", "", "| Class | TP | FP | FN | Precision | Recall | F1 |", "|---|---|---|---|---|---|---|");
  for (const dc of DATA_CLASS_IDS) {
    const s = results.configs.C.test.perClass[dc];
    lines.push(`| ${dc} | ${s.tp} | ${s.fp} | ${s.fn} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} |`);
  }
  lines.push("", "### Evasion by type, configuration C (all splits)", "", "| Evasion type | Caught |", "|---|---|");
  const byType: Record<string, { caught: number; total: number }> = {};
  for (const split of ["test", "dev"] as const)
    for (const [t, v] of Object.entries(results.configs.C[split].evasion.byType)) {
      byType[t] ??= { caught: 0, total: 0 };
      byType[t].caught += v.caught;
      byType[t].total += v.total;
    }
  for (const [t, v] of Object.entries(byType))
    lines.push(`| ${t}${UNHANDLED_EVASIONS.includes(t as never) ? " (known unhandled)" : ""} | ${v.caught}/${v.total} |`);

  lines.push("", "## Leakage (test split, tier 1 healthy)", "");
  const l = results.leakage.test;
  lines.push(`Labelled values the policy says must be protected: ${l.labelsRequiringProtection}.`, "");
  lines.push("| Config | Values reaching a provider unprotected |", "|---|---|");
  lines.push(`| A. No gateway | ${l.A} |`, `| B. Regex-only | ${l.B} |`, `| C. Clearance Gateway | ${l.C} (and ${l.cBlockedRequests} requests blocked outright) |`);

  lines.push("", "## Failover safety (test split)", "");
  lines.push("Confidential or restricted requests sent to a provider not cleared for them:", "");
  lines.push(
    "| Scenario | Requests | Naive \"try the next provider\" | Clearance Gateway: routing errors | Clearance Gateway: unsafe because data went undetected | Blocked (fail closed) |",
    "|---|---|---|---|---|---|",
  );
  for (const f of results.failover.test) {
    const r = f.confidentialOrRestricted;
    lines.push(`| ${f.scenario} | ${r.requests} | ${r.naiveUnsafe} | ${r.oursRoutingErrors} | ${r.oursDetectionMisses} | ${r.oursBlocked} |`);
  }
  const missed = [...new Set(results.failover.test.flatMap((f) => f.detectionMissTemplates))];
  if (missed.length)
    lines.push("", `The router only sees what detection finds. Undetected sends came from these templates: ${missed.map((t) => `\`${t}\``).join(", ")}.`);

  const pm = results.policyMatrix;
  lines.push("", "## Policy matrix", "", `Role × data class × provider tier: ${pm.cells} cells. Configuration C: ${pm.C.passed}/${pm.cells} (${pct(pm.C.rate)}). No gateway: ${pm.A.passed}/${pm.cells} (${pct(pm.A.rate)}).`);
  if (pm.C.failures.length) lines.push("", ...pm.C.failures.map((f) => `- ${f}`));

  lines.push("", "## Latency", "", `In-process \`check()\` (detect → route → transform → explain), no network: p50 ${results.latency.p50Ms} ms, p95 ${results.latency.p95Ms} ms over ${results.latency.calls} calls.`);
  lines.push("", "## Notes", "", ...results.notes.map((n) => `- ${n}`), "");
  return lines.join("\n");
}

console.log(renderMarkdown());
