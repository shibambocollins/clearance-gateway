// Review a compiled policy: the decision diff against the active version (looser changes first)
// and the rules table with the policy sentence each rule came from.
import type { CompiledPolicyView, PolicyDiffView } from "../api";

const label = (s: string) => s.replace(/_/g, " ").toLowerCase();

export function PolicyDiffSummary({ diff }: { diff: PolicyDiffView }) {
  const looser = diff.cells.filter((c) => c.direction === "looser");
  const stricter = diff.cells.filter((c) => c.direction === "stricter");
  const nothing = diff.cells.length === 0 && diff.levels.length === 0 && diff.terms.added.length === 0 && diff.terms.removed.length === 0;
  return (
    <div className="diff">
      <h3>Changes compared with the active policy</h3>
      {nothing && <p>No decision changes: this draft enforces exactly what the active policy does.</p>}
      {diff.looserCount > 0 && (
        <p className="looser" role="alert">
          <strong>{diff.looserCount} change{diff.looserCount === 1 ? "" : "s"} would LOOSEN protection.</strong> Check each one
          against the policy text before activating.
        </p>
      )}
      {looser.length + stricter.length > 0 && (
        <table className="data-table">
          <thead>
            <tr><th>Data class</th><th>Role</th><th>Tier</th><th>Active</th><th>Draft</th><th>Effect</th></tr>
          </thead>
          <tbody>
            {[...looser, ...stricter].map((c) => (
              <tr key={`${c.dataClass}-${c.role}-${c.tier}`} className={c.direction === "looser" ? "row-looser" : ""}>
                <td>{label(c.dataClass)}</td>
                <td>{c.role}</td>
                <td>{c.tier}</td>
                <td><span className={`badge badge-${c.from}`}>{c.from}</span></td>
                <td><span className={`badge badge-${c.to}`}>{c.to}</span></td>
                <td>{c.direction === "looser" ? "Looser" : "Stricter"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {diff.levels.length > 0 && (
        <ul>
          {diff.levels.map((l) => (
            <li key={l.dataClass} className={l.direction === "looser" ? "looser" : ""}>
              Sensitivity of {label(l.dataClass)}: {l.from} → {l.to} ({l.direction})
            </li>
          ))}
        </ul>
      )}
      {diff.terms.added.length > 0 && <p>Terms added: {diff.terms.added.join(", ")}</p>}
      {diff.terms.removed.length > 0 && <p className="looser">Terms no longer protected: {diff.terms.removed.join(", ")}</p>}
    </div>
  );
}

export function RulesTable({ policy }: { policy: CompiledPolicyView }) {
  return (
    <>
      <h3>Rules ({policy.rules.length})</h3>
      <table className="data-table rules-table">
        <thead>
          <tr><th>Rule</th><th>Applies to</th><th>Action</th><th>Shown to employees</th><th>From the policy</th></tr>
        </thead>
        <tbody>
          {policy.rules.map((r) => (
            <tr key={r.id}>
              <td><code>{r.id}</code></td>
              <td>
                {r.match.dataClasses.map(label).join(", ")}
                <div className="muted">
                  {r.match.roles ? `roles: ${r.match.roles.join(", ")}` : "all roles"} ·{" "}
                  {r.match.providerTiers ? `tiers: ${r.match.providerTiers.join(", ")}` : "all tiers"}
                </div>
              </td>
              <td><span className={`badge badge-${r.action}`}>{r.action}</span></td>
              <td>{r.description}</td>
              <td className="muted">{r.sourceClause ?? "(no source clause)"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Terms: {policy.terms.map((t) => `${t.term} (${label(t.dataClass)})`).join(", ") || "none"} · Coaching:{" "}
        {policy.coaching ? "on" : "off"}
      </p>
    </>
  );
}
