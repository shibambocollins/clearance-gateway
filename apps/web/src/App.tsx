import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { getHealth, type Health } from "./api";
import { AdminCodeProvider } from "./adminCode";
import { AboutPage } from "./pages/AboutPage";
import { AssistantPage } from "./pages/AssistantPage";
import { DemoChatPage } from "./pages/DemoChatPage";

// Charts and admin screens load only when opened, keeping the assistant fast.
const EvaluationPage = lazy(() => import("./pages/EvaluationPage").then((m) => ({ default: m.EvaluationPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const AdminPolicyPage = lazy(() => import("./pages/AdminPolicyPage").then((m) => ({ default: m.AdminPolicyPage })));
const AdminSimulatePage = lazy(() => import("./pages/AdminSimulatePage").then((m) => ({ default: m.AdminSimulatePage })));
const ProvidersPage = lazy(() => import("./pages/ProvidersPage").then((m) => ({ default: m.ProvidersPage })));

type HealthState = { kind: "connecting" } | { kind: "ok"; health: Health } | { kind: "error" };

const later = (page: ReactNode) => <Suspense fallback={<p>Loading…</p>}>{page}</Suspense>;

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
        <nav aria-label="Main">
          <NavLink to="/" end>
            Assistant
          </NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/evaluation">Evaluation</NavLink>
          <NavLink to="/about">How it works</NavLink>
          {/* A full page load, so the Lens content script (matched on this URL) is injected. */}
          <a href="/demo-chat">Demo chat (fictional)</a>
          <span className="nav-group" aria-label="Admin">
            <NavLink to="/admin/policy">Policy</NavLink>
            <NavLink to="/admin/simulate">Simulator</NavLink>
            <NavLink to="/admin/providers">Providers</NavLink>
          </span>
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
          <Route path="/dashboard" element={later(<DashboardPage />)} />
          <Route path="/evaluation" element={later(<EvaluationPage />)} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/demo-chat" element={<DemoChatPage />} />
          <Route path="/admin/policy" element={later(<AdminPolicyPage />)} />
          <Route path="/admin/simulate" element={later(<AdminSimulatePage />)} />
          <Route path="/admin/providers" element={later(<ProvidersPage />)} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
      <footer className="site-footer">
        Synthetic data only. Provider tiers are demo configuration, not claims about any vendor's data handling. Built for
        the Credify System Thinking Challenge 2026.
      </footer>
    </AdminCodeProvider>
  );
}
