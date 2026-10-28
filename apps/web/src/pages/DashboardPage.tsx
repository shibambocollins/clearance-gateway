// Dashboard: what the gateway did over the last 7 days, from audit metadata (never prompt text).
// Each chart is a single series, so it uses one colour with direct value labels and no legend.
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAudit, getStats, type AuditEventView, type Count, type StatsResponse } from "../api";
import { useAdminCode } from "../adminCode";
import { AdminCodeField } from "../components/AdminCodeField";

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase();
const axisProps = { stroke: "var(--chart-axis)", tick: { fill: "var(--muted)", fontSize: 12 } };

function CountChart({ title, data, describe }: { title: string; data: Count[]; describe?: (name: string) => string }) {
  const rows = data.map((d) => ({ ...d, label: describe ? describe(d.name) : pretty(d.name) }));
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">No data yet.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 34 + 30)}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" allowDecimals={false} {...axisProps} />
              <YAxis type="category" dataKey="label" width={150} {...axisProps} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }}
                cursor={{ fill: "var(--chart-grid)" }}
              />
              <Bar dataKey="count" name="Requests" fill="var(--chart-single)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
                <LabelList dataKey="count" position="right" fill="var(--fg)" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <table className="data-table count-table">
            <caption>{title}</caption>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.label}</td>
                  <td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { code } = useAdminCode();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [events, setEvents] = useState<AuditEventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => setError("Could not load statistics."));
  }, []);

  useEffect(() => {
    if (!code) return;
    getAudit(code)
      .then((r) => setEvents(r.events))
      .catch(() => setEvents(null));
  }, [code]);

  const count = (list: Count[] | undefined, name: string) => list?.find((c) => c.name === name)?.count ?? 0;

  return (
    <div className="evaluation">
      <h1>Dashboard</h1>
      <p className="muted">
        The last {stats?.windowDays ?? 7} days of requests through the live demo, including test traffic, built from audit
        metadata only. Prompt and reply text are never stored.
      </p>
      {error && <p className="error">{error}</p>}
      {stats && !stats.available && <p className="muted">Statistics need the database, which is not available right now.</p>}

      {stats?.available && (
        <>
          <section className="tiles" aria-label="Totals">
            <div className="tile">
              <div className="tile-value">{stats.total}</div>
              <div className="tile-label">Requests</div>
            </div>
            <div className="tile">
              <div className="tile-value">{stats.withSensitiveData}</div>
              <div className="tile-label">Contained sensitive data</div>
            </div>
            <div className="tile">
              <div className="tile-value">{count(stats.byOutcome, "blocked")}</div>
              <div className="tile-label">Blocked</div>
              <div className="tile-note">by rule or fail closed</div>
            </div>
            <div className="tile">
              <div className="tile-value">{count(stats.byAction, "redact") + count(stats.byAction, "tokenise")}</div>
              <div className="tile-label">Sent after redaction or pseudonymisation</div>
            </div>
            <div className="tile">
              <div className="tile-value">{stats.medianLatencyMs ?? "–"} ms</div>
              <div className="tile-label">Median end-to-end latency</div>
              <div className="tile-note">sent requests, including the provider</div>
            </div>
          </section>

          <CountChart title="Requests by data class found" data={stats.byDataClass ?? []} />
          <CountChart title="Requests by final action" data={stats.byAction ?? []} />
          <CountChart title="Sent requests by provider" data={stats.byProvider ?? []} />
          <CountChart title="Requests by channel" data={stats.byChannel ?? []} />
        </>
      )}

      <section className="card">
        <h2>Recent audit events</h2>
        <p className="muted">Exactly what is stored per request: metadata only. Requires the admin code.</p>
        <AdminCodeField />
        {events && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th><th>Channel</th><th>Role</th><th>Policy</th><th>Data classes</th><th>Action</th><th>Rules</th><th>Provider</th><th>Outcome</th><th>ms</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleTimeString()}</td>
                  <td>{e.channel}</td>
                  <td>{e.role}</td>
                  <td>{e.policy_version ?? "seed"}</td>
                  <td>{(e.data_classes ?? []).map(pretty).join(", ") || "–"}</td>
                  <td>{e.final_action}</td>
                  <td>{(e.rule_ids ?? []).join(", ") || "–"}</td>
                  <td>{e.provider ?? "–"}</td>
                  <td>{e.outcome}</td>
                  <td>{e.latency_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
