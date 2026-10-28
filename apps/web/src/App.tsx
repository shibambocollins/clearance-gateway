import { useEffect, useState } from "react";
import { API_URL, getHealth, type Health } from "./api";

type State = { kind: "connecting" } | { kind: "ok"; health: Health } | { kind: "error"; message: string };

export function App() {
  const [state, setState] = useState<State>({ kind: "connecting" });

  useEffect(() => {
    getHealth()
      .then((health) => setState({ kind: "ok", health }))
      .catch((err: unknown) =>
        setState({ kind: "error", message: err instanceof Error ? err.message : "Could not reach the API" }),
      );
  }, []);

  return (
    <main>
      {state.kind === "ok" && state.health.offlineMode && (
        <div className="banner">Offline mode: replies come from a mock provider, not a real AI model.</div>
      )}
      <h1>Clearance Gateway</h1>
      <p className="tagline">Data only goes where it's cleared to go.</p>

      <section className="card">
        <h2>API status</h2>
        {state.kind === "connecting" && <p>Connecting…</p>}
        {state.kind === "error" && (
          <p className="error">
            {state.message}. API: <code>{API_URL}</code>
          </p>
        )}
        {state.kind === "ok" && (
          <dl>
            <dt>Status</dt>
            <dd>{state.health.status}</dd>
            <dt>Engine (core) version</dt>
            <dd>{state.health.coreVersion}</dd>
            <dt>Database</dt>
            <dd>{state.health.db}</dd>
            <dt>Active policy version</dt>
            <dd>{state.health.activePolicyVersion ?? "none yet"}</dd>
            <dt>Offline mode</dt>
            <dd>{state.health.offlineMode ? "on" : "off"}</dd>
            <dt>API</dt>
            <dd>
              <code>{API_URL}</code>
            </dd>
          </dl>
        )}
      </section>
    </main>
  );
}
