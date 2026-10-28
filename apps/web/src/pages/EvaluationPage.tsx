// Evaluation: renders the committed Bench results (eval/results/results.json). Synthetic data.
// Colour follows the configuration everywhere: C = series 1, B = series 2, A = series 3.
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import results from "../../../../eval/results/results.json";

type ConfigId = "A" | "B" | "C";
const CONFIG_NAMES: Record<ConfigId, string> = { C: "Clearance Gateway", B: "Regex-only", A: "No gateway" };
const CONFIG_COLORS: Record<ConfigId, string> = { C: "var(--series-1)", B: "var(--series-2)", A: "var(--series-3)" };
const ORDER: ConfigId[] = ["C", "B", "A"];

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const toPct = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 10);
const test = (id: ConfigId) => results.configs[id].test;

const qualityData = [
  { metric: "Precision", ...Object.fromEntries(ORDER.map((id) => [id, toPct(test(id).overall.precision)])) },
  { metric: "Recall", ...Object.fromEntries(ORDER.map((id) => [id, toPct(test(id).overall.recall)])) },
  { metric: "Evasion caught", ...Object.fromEntries(ORDER.map((id) => [id, toPct(test(id).evasion.rate)])) },
];
const falsePositiveData = [
  { metric: "Trap prompts flagged", ...Object.fromEntries(ORDER.map((id) => [id, toPct(test(id).trapFalsePositives.rate)])) },
  { metric: "Clean prompts flagged", ...Object.fromEntries(ORDER.map((id) => [id, toPct(test(id).cleanFalsePositives.rate)])) },
];
const leak = results.leakage.test;
const leakData = ORDER.map((id) => ({ config: CONFIG_NAMES[id], id, leaked: leak[id] }));
const failover = results.failover.test.map((f) => ({
  scenario: f.scenario,
  requests: f.confidentialOrRestricted.requests,
  naive: f.confidentialOrRestricted.naiveUnsafe,
  routingErrors: f.confidentialOrRestricted.oursRoutingErrors,
  undetected: f.confidentialOrRestricted.oursDetectionMisses,
  blocked: f.confidentialOrRestricted.oursBlocked,
}));

const evasionByType: Record<string, { caught: number; total: number }> = {};
for (const split of ["test", "dev"] as const)
  for (const [type, v] of Object.entries(results.configs.C[split].evasion.byType)) {
    evasionByType[type] ??= { caught: 0, total: 0 };
    evasionByType[type].caught += v.caught;
    evasionByType[type].total += v.total;
  }

const axisProps = { stroke: "var(--chart-axis)", tick: { fill: "var(--muted)", fontSize: 12 } };
const tooltipProps = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" },
  cursor: { fill: "var(--chart-grid)" },
};

function Tile({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  );
}

function ConfigBars({ data, unit }: { data: Record<string, unknown>[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="metric" {...axisProps} />
        <YAxis domain={[0, 100]} unit={unit} width={44} {...axisProps} />
        <Tooltip {...tooltipProps} formatter={(v) => (v === null || v === undefined ? "n/a" : `${v}${unit}`)} />
        <Legend formatter={(value) => <span style={{ color: "var(--ink-60)" }}>{value}</span>} />
        {ORDER.map((id) => (
          <Bar key={id} dataKey={id} name={CONFIG_NAMES[id]} fill={CONFIG_COLORS[id]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            <LabelList dataKey={id} position="top" fill="var(--fg)" fontSize={11} formatter={(v: unknown) => (v === null || v === undefined ? "n/a" : `${v}`)} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EvaluationPage() {
  const d = results.dataset;
  const c = test("C");
  const tier1 = failover[0]!;
  return (
    <div className="evaluation">
      <h1>Evaluation</h1>
      <p className="note" role="note">
        <strong>Synthetic data only.</strong> {d.total} generated prompts ({d.labels} labelled values), seed{" "}
        <code>{results.seed}</code>, Engine {results.engineVersion}, generated {results.generatedAt.slice(0, 10)}. Headline
        numbers use the <strong>test</strong> split ({d.bySplit.test} prompts); its {d.templates.test} templates never appear in
        dev (template-disjoint: {d.templateDisjoint ? "yes" : "no"}). Reproduce with <code>npm run eval</code>. These are
        measured results on synthetic data, not a guarantee: detection is not 100%.
      </p>

      <section className="tiles" aria-label="Headline results (test split)">
        <Tile value={pct(c.overall.recall)} label="Recall" note={`${c.overall.tp} of ${c.overall.tp + c.overall.fn} sensitive values found`} />
        <Tile value={pct(c.overall.precision)} label="Precision" note={`${c.overall.fp} false alarms on labelled prompts`} />
        <Tile value={pct(c.trapFalsePositives.rate)} label="Trap prompts flagged" note={`${c.trapFalsePositives.cases} look-alikes; regex-only: ${pct(test("B").trapFalsePositives.rate)}`} />
        <Tile value={`${tier1.routingErrors}`} label="Unsafe routing decisions in an outage" note={`naive fallback: ${tier1.naive} of ${tier1.requests}`} />
        <Tile value={`${results.policyMatrix.C.passed}/${results.policyMatrix.cells}`} label="Policy matrix cells correct" />
        <Tile value={`${results.latency.p50Ms} ms`} label="Check latency (p50)" note={`p95 ${results.latency.p95Ms} ms, in-process`} />
      </section>

      <section className="card">
        <h2>Detection quality (higher is better)</h2>
        <ConfigBars data={qualityData} unit="%" />
        <table className="data-table">
          <caption>Detection quality, test split</caption>
          <thead>
            <tr><th>Configuration</th><th>Precision</th><th>Recall</th><th>F1</th><th>Evasion caught</th></tr>
          </thead>
          <tbody>
            {ORDER.map((id) => (
              <tr key={id}>
                <td>{results.configs[id].label}</td>
                <td>{pct(test(id).overall.precision)}</td>
                <td>{pct(test(id).overall.recall)}</td>
                <td>{pct(test(id).overall.f1)}</td>
                <td>{test(id).evasion.caught}/{test(id).evasion.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>False alarms (lower is better)</h2>
        <p className="muted">Share of prompts with at least one finding, among look-alike "trap" prompts and clean work prompts.</p>
        <ConfigBars data={falsePositiveData} unit="%" />
      </section>

      <section className="card">
        <h2>Values reaching a provider unprotected (lower is better)</h2>
        <p className="muted">
          Of {leak.labelsRequiringProtection} labelled values the policy says must be removed, pseudonymised or blocked (test
          split, tier 1 healthy). Clearance Gateway also blocked {leak.cBlockedRequests} requests outright.
        </p>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={leakData} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" {...axisProps} allowDecimals={false} />
            <YAxis type="category" dataKey="config" width={130} {...axisProps} />
            <Tooltip {...tooltipProps} />
            <Bar dataKey="leaked" name="Values leaked" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
              {leakData.map((row) => (
                <Cell key={row.id} fill={CONFIG_COLORS[row.id]} />
              ))}
              <LabelList dataKey="leaked" position="right" fill="var(--fg)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <h2>Failover safety: is confidential data ever sent to a provider not cleared for it?</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Confidential or restricted requests</th>
              <th>Naive "try the next provider"</th>
              <th>Clearance Gateway: routing errors</th>
              <th>Clearance Gateway: sent because detection missed the data</th>
              <th>Blocked (fail closed)</th>
            </tr>
          </thead>
          <tbody>
            {failover.map((f) => (
              <tr key={f.scenario}>
                <td>{f.scenario}</td>
                <td>{f.requests}</td>
                <td>{f.naive}</td>
                <td>{f.routingErrors}</td>
                <td>{f.undetected}</td>
                <td>{f.blocked}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          The router made no unsafe decisions. The {tier1.undetected} unsafe sends were prompts whose sensitive data went
          undetected (ID numbers written as words, keys split across lines), so the router saw them as public. Routing can only
          be as good as detection.
        </p>
      </section>

      <section className="card">
        <h2>Per data class (Clearance Gateway, test split)</h2>
        <table className="data-table">
          <thead>
            <tr><th>Data class</th><th>Found</th><th>False alarms</th><th>Missed</th><th>Precision</th><th>Recall</th></tr>
          </thead>
          <tbody>
            {Object.entries(c.perClass).map(([dc, s]) => (
              <tr key={dc}>
                <td>{dc.replace(/_/g, " ").toLowerCase()}</td>
                <td>{s.tp}</td>
                <td>{s.fp}</td>
                <td>{s.fn}</td>
                <td>{pct(s.precision)}</td>
                <td>{pct(s.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Evasion attempts by type (Clearance Gateway, all splits)</h2>
        <table className="data-table">
          <thead>
            <tr><th>Evasion type</th><th>Caught</th></tr>
          </thead>
          <tbody>
            {Object.entries(evasionByType).map(([type, v]) => (
              <tr key={type}>
                <td>
                  {type}
                  {(d.unhandledEvasionTypes as string[]).includes(type) && <span className="muted"> (known unhandled, included on purpose)</span>}
                </td>
                <td>{v.caught}/{v.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Method notes</h2>
        <ul>
          {results.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="muted">Dev split (reported separately, nothing was tuned on it): recall {pct(results.configs.C.dev.overall.recall)}, precision {pct(results.configs.C.dev.overall.precision)}.</p>
      </section>
    </div>
  );
}
