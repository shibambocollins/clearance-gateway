// Admin: write the policy in plain English once, compile it to rules (LLM, admin-reviewed),
// review the decision diff and activate. Every save is a new version.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { policyDiff, type CompiledPolicy } from "@clearance-gateway/core";
import {
  ApiError,
  activateVersion,
  compilePolicy,
  getActivePolicy,
  listVersions,
  type CompileResponse,
  type CompiledPolicyView,
  type PolicyVersion,
} from "../api";
import { useAdminCode } from "../adminCode";
import { AdminCodeField } from "../components/AdminCodeField";
import { PolicyDiffSummary, RulesTable } from "../components/PolicyReview";

const ERRORS: Record<string, string> = {
  compiler_unavailable: "The compiler needs a real AI provider (it is unavailable in offline mode).",
  compiler_invalid_output: "The compiler could not produce a valid policy. Nothing was saved or activated; try rephrasing.",
  compile_limit_reached: "The daily compile limit for this demo has been reached. Existing versions can still be reviewed.",
  looser_than_floor:
    "Not activated: this version would protect less than the baseline policy in at least one case. The public demo only allows equal or stricter policies.",
};

const errorText = (err: unknown) =>
  err instanceof ApiError
    ? err.status === 401
      ? "Wrong or missing admin code."
      : (ERRORS[err.code] ?? `Request failed (${err.code}).`)
    : "Request failed.";

export function AdminPolicyPage() {
  const { code } = useAdminCode();
  const [text, setText] = useState("");
  const [active, setActive] = useState<{ version: number | null; compiled: CompiledPolicyView } | null>(null);
  const [draft, setDraft] = useState<CompileResponse | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [reviewing, setReviewing] = useState<PolicyVersion | null>(null);
  const [confirmLooser, setConfirmLooser] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadActive = useCallback(async () => {
    const a = await getActivePolicy();
    setActive({ version: a.version, compiled: a.compiled });
    return a;
  }, []);

  useEffect(() => {
    loadActive().then((a) => setText((t) => t || a.rawText)).catch(() => setError("Could not load the active policy."));
  }, [loadActive]);

  const loadVersions = useCallback(() => {
    if (!code) return;
    listVersions(code).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  }, [code]);
  useEffect(loadVersions, [loadVersions]);

  const compile = async () => {
    setBusy("compile");
    setError(null);
    setMessage(null);
    setDraft(null);
    setReviewing(null);
    setConfirmLooser(false);
    try {
      setDraft(await compilePolicy(code, text));
      loadVersions();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const activate = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const r = await activateVersion(code, id);
      setMessage(`Version ${r.activePolicyVersion} is now active. New requests use it within a few seconds.`);
      setDraft(null);
      setReviewing(null);
      await loadActive();
      loadVersions();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  // Review an existing version: diff computed in the browser with the same Engine code.
  const reviewDiff =
    reviewing && active ? policyDiff(active.compiled as unknown as CompiledPolicy, reviewing.compiled as unknown as CompiledPolicy) : null;
  const pending = draft ?? null;
  const looserCount = pending?.diff.looserCount ?? reviewDiff?.looserCount ?? 0;

  return (
    <div className="admin">
      <h1>Policy</h1>
      <p className="muted">
        Write the AI-use policy in plain English. The compiler (an LLM) turns it into rules. You review them and activate
        them. Enforcement itself never uses an LLM.
      </p>
      <AdminCodeField />

      <section className="card">
        <h2>Policy text {active?.version ? <span className="muted">(active: version {active.version})</span> : null}</h2>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} maxLength={8000} aria-label="Policy text" />
        <button
          type="button"
          className={busy === "compile" ? "primary busy" : "primary"}
          disabled={!code || busy !== null || text.trim().length < 20}
          onClick={compile}
        >
          {busy === "compile" ? "Compiling…" : "Compile to a draft"}
        </button>
        {error && <p className="error">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
      </section>

      {(pending || reviewing) && (
        <section className="card">
          <h2>
            {pending ? `Draft version ${pending.version ?? "(not saved)"}` : `Version ${reviewing!.version} (${reviewing!.status})`}
          </h2>
          {pending && (
            <p className="muted">
              Compiled by {pending.compiledBy} · attempts: {pending.attempts.map((a) => `${a.provider} ${a.outcome.replace("_", " ")}`).join(", ")}
            </p>
          )}
          <PolicyDiffSummary diff={(pending?.diff ?? reviewDiff)!} />
          <RulesTable policy={pending?.compiled ?? reviewing!.compiled} />
          {looserCount > 0 && (
            <label className="confirm">
              <input type="checkbox" checked={confirmLooser} onChange={(e) => setConfirmLooser(e.target.checked)} /> I have checked
              every looser change against the policy text.
            </label>
          )}
          <div className="row">
            {(pending?.id || reviewing?.id) && (
              <button
                type="button"
                className="primary"
                disabled={!code || busy !== null || (looserCount > 0 && !confirmLooser)}
                onClick={() => activate((pending?.id ?? reviewing!.id)!)}
              >
                {busy ? "Activating…" : "Activate this version"}
              </button>
            )}
            {(pending?.id || reviewing?.id) && (
              <Link to={`/admin/simulate?version=${pending?.id ?? reviewing!.id}`}>Try it in the simulator first</Link>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Version history</h2>
        {!code && <p className="muted">Enter the admin code to see versions.</p>}
        {code && versions.length === 0 && <p className="muted">No versions yet.</p>}
        {versions.length > 0 && (
          <table className="data-table">
            <thead>
              <tr><th>Version</th><th>Status</th><th>Compiled by</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>{v.version}</td>
                  <td>{v.status}</td>
                  <td>{v.compiled_by ?? "-"}</td>
                  <td>{new Date(v.created_at).toLocaleString()}</td>
                  <td>
                    {v.status !== "active" && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(null);
                          setConfirmLooser(false);
                          setReviewing(v);
                          setText(v.raw_text);
                        }}
                      >
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
