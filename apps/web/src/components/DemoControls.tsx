// Demo controls: simulate a provider outage (admin code required) to show fail-closed routing.
import { useCallback, useEffect, useState } from "react";
import { ApiError, getProviders, resetDemo, setOutage, type ProviderStatus } from "../api";
import { useAdminCode } from "../adminCode";

export function DemoControls({ onChange }: { onChange?: () => void }) {
  const { code, setCode } = useAdminCode();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getProviders()
      .then((r) => setProviders(r.providers))
      .catch(() => setError("Could not load providers"));
  }, []);
  useEffect(refresh, [refresh]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Wrong admin code" : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="card demo-controls">
      <summary>Demo controls: simulate a provider outage</summary>
      <label className="field">
        Admin code
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
      </label>
      <ul className="provider-list">
        {providers.map((p) => (
          <li key={p.id}>
            <span>
              <strong>{p.label}</strong> · tier {p.tier} · up to {p.maxLevel}
              {!p.configured && " · not configured"}
              {p.runtimeDown && " · failing"}
            </span>
            <button
              type="button"
              disabled={busy || !code}
              className={p.simulatedOutage ? "danger" : ""}
              onClick={() => run(() => setOutage(code, p.id, !p.simulatedOutage))}
              aria-pressed={p.simulatedOutage}
            >
              {p.simulatedOutage ? "Outage on: restore" : "Simulate outage"}
            </button>
          </li>
        ))}
      </ul>
      <p className="muted">Simulated outages switch themselves off after 10 minutes.</p>
      <button type="button" disabled={busy || !code} onClick={() => run(() => resetDemo(code))}>
        Reset demo (seed policy, no outages)
      </button>
      {error && <p className="error">{error}</p>}
    </details>
  );
}
