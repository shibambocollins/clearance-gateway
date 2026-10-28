// Admin: run the sample set or pasted prompts against a candidate version and the active one,
// highlighting changed decisions (shadow evaluation: nothing is sent to any provider).
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, listVersions, simulate, type PolicyVersion, type Role, type SimulateRow } from "../api";
import { useAdminCode } from "../adminCode";
import { AdminCodeField } from "../components/AdminCodeField";

export function AdminSimulatePage() {
  const { code } = useAdminCode();
  const [params, setParams] = useSearchParams();
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [prompts, setPrompts] = useState("");
  const [role, setRole] = useState<Role>("general");
  const [rows, setRows] = useState<SimulateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = params.get("version") ?? "";

  const load = useCallback(() => {
    if (!code) return;
    listVersions(code)
      .then((r) => setVersions(r.versions))
      .catch(() => setError("Wrong or missing admin code."));
  }, [code]);
  useEffect(load, [load]);

  const run = async (pasted: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const list = pasted ? prompts.split("\n").map((p) => p.trim()).filter(Boolean).slice(0, 20) : undefined;
      setRows((await simulate(code, selected, list, role)).rows);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Wrong or missing admin code." : "Simulation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin">
      <h1>Simulator</h1>
      <p className="muted">
        Compare a policy version with the active one before activating it. Nothing is sent to any AI provider.
      </p>
      <AdminCodeField />
      <section className="card">
        <label className="field">
          Candidate version
          <select value={selected} onChange={(e) => setParams({ version: e.target.value })}>
            <option value="">Choose a version…</option>
            {versions
              .filter((v) => v.status !== "active")
              .map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version} ({v.status}, {v.compiled_by ?? "unknown"})
                </option>
              ))}
          </select>
        </label>
        <button type="button" className="primary" disabled={!code || !selected || busy} onClick={() => run(false)}>
          Run the six sample prompts
        </button>
        <label className="field" style={{ marginTop: 16 }}>
          Or paste prompts (one per line, up to 20)
          <textarea value={prompts} onChange={(e) => setPrompts(e.target.value)} rows={4} />
        </label>
        <label className="field">
          Role for pasted prompts
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(["general", "hr", "finance", "engineering"] as Role[]).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!code || !selected || busy || !prompts.trim()} onClick={() => run(true)}>
          Run pasted prompts
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {rows && (
        <section className="card">
          <h2>
            {rows.filter((r) => r.changed).length} of {rows.length} decisions change
          </h2>
          <table className="data-table">
            <thead>
              <tr><th>Prompt</th><th>Role</th><th>Active policy</th><th>Candidate</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.changed ? "row-changed" : ""}>
                  <td>{r.label}{r.changed && <strong> · changed</strong>}</td>
                  <td>{r.role}</td>
                  {[r.active, r.candidate].map((s, j) => (
                    <td key={j}>
                      <span className={`badge badge-${s.action}`}>{s.action}</span> {s.provider ?? "not sent"}
                      <div className="muted">
                        {s.findings.map((f) => `${f.masked} → ${f.action}`).join(", ") || "no findings"}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
