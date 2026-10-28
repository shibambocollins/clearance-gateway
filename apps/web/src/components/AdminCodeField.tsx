import { useAdminCode } from "../adminCode";

/** The demo admin code, kept in memory for this tab only. */
export function AdminCodeField() {
  const { code, setCode } = useAdminCode();
  return (
    <label className="field admin-code">
      Admin code
      <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
      <span className="muted">Kept in memory for this tab only.</span>
    </label>
  );
}
