import { Suspense, lazy, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { getHealth, type Health } from "./api";
import { AdminCodeProvider } from "./adminCode";
import { AssistantPage } from "./pages/AssistantPage";

// Charts are heavy; load them only when the Evaluation page is opened.
const EvaluationPage = lazy(() => import("./pages/EvaluationPage").then((m) => ({ default: m.EvaluationPage })));
const AdminPolicyPage = lazy(() => import("./pages/AdminPolicyPage").then((m) => ({ default: m.AdminPolicyPage })));
const AdminSimulatePage = lazy(() => import("./pages/AdminSimulatePage").then((m) => ({ default: m.AdminSimulatePage })));

type HealthState = { kind: "connecting" } | { kind: "ok"; health: Health } | { kind: "error" };

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "connecting" });

  useEffect(() => {
    getHealth()
      .then((h) => setHealth({ kind: "ok", health: h }))
      .catch(() => setHealth({ kind: "error" }));
  }, []);

  return (
    <AdminCodeProvider>
      <header className="site-header">
        <div className="brand">
          <span className="brand-name">Clearance Gateway</span>
          <span className="tagline">Data only goes where it's cleared to go.</span>
        </div>
        <nav>
          <NavLink to="/" end>
            Assistant
          </NavLink>
          <NavLink to="/evaluation">Evaluation</NavLink>
          <NavLink to="/admin/policy">Policy</NavLink>
          <NavLink to="/admin/simulate">Simulator</NavLink>
        </nav>
        <span className={`status status-${health.kind}`} role="status">
          {health.kind === "connecting" && "Connecting…"}
          {health.kind === "error" && "API unreachable"}
          {health.kind === "ok" &&
            `Policy v${health.health.activePolicyVersion ?? "seed"} · Engine ${health.health.coreVersion}`}
        </span>
      </header>
      {health.kind === "ok" && health.health.offlineMode && (
        <div className="banner" role="note">
          Offline mode: every reply comes from a deterministic mock provider, not a real AI model.
        </div>
      )}
      {health.kind === "ok" && health.health.db !== "ok" && (
        <div className="banner" role="note">
          Database {health.health.db.replace("_", " ")}: using the seed policy held in memory.
        </div>
      )}
      <main>
        <Routes>
          <Route path="/" element={<AssistantPage />} />
          <Route
            path="/evaluation"
            element={
              <Suspense fallback={<p>Loading results…</p>}>
                <EvaluationPage />
              </Suspense>
            }
          />
          <Route
            path="/admin/policy"
            element={
              <Suspense fallback={<p>Loading…</p>}>
                <AdminPolicyPage />
              </Suspense>
            }
          />
          <Route
            path="/admin/simulate"
            element={
              <Suspense fallback={<p>Loading…</p>}>
                <AdminSimulatePage />
              </Suspense>
            }
          />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
      <footer className="site-footer">
        Synthetic data only. Provider tiers are demo configuration, not claims about any vendor's data handling.
      </footer>
    </AdminCodeProvider>
  );
}
