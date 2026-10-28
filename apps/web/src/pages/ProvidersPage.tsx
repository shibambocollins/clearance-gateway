// Admin: provider tiers, health and outage toggles for the failover demo.
import { DemoControls } from "../components/DemoControls";

export function ProvidersPage() {
  return (
    <div className="admin">
      <h1>Providers</h1>
      <p className="muted">
        Each provider has a trust tier and the highest data sensitivity it may receive. Requests go to the first provider in
        policy order that is enabled, healthy and cleared for the data. If none qualifies, the request is blocked (fail
        closed).
      </p>
      <p className="note" role="note">
        Tiers and clearances are <strong>demo configuration</strong>, not claims about any vendor's real data handling.
      </p>
      <DemoControls />
      <section className="card">
        <h2>Try it</h2>
        <ol>
          <li>Simulate an outage of the Approved enterprise AI (tier 1).</li>
          <li>On the Assistant page, send the "ID number" sample: it is blocked (fail closed, rule R-ROUTE-01).</li>
          <li>Send the "Clean" sample: it fails over to Google Gemini (tier 2), because public data is cleared for it.</li>
          <li>Restore the provider (or wait 10 minutes).</li>
        </ol>
      </section>
    </div>
  );
}
