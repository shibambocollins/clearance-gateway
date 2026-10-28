// How it works: the architecture in one picture, the safety rules, and the limitations.
const REPO = "https://github.com/shibambocollins/clearance-gateway";

const PIPELINE: { name: string; detail: string }[] = [
  { name: "Canonicalise", detail: "Undo evasions: fullwidth characters, zero-width characters, spaced or dashed digits." },
  { name: "Detect", detail: "SA ID numbers (date + Luhn), cards (Luhn + brand), bank accounts (with context), emails, SA phones, credentials, client and project names." },
  { name: "Decide", detail: "For each finding: the strictest matching rule for this role and provider tier." },
  { name: "Transform", detail: "Redact [REDACTED:SA_ID], pseudonymise [CLIENT_NAME_1], or block." },
  { name: "Route", detail: "First provider in policy order that is enabled, healthy and cleared for the data's sensitivity. None? Block (fail closed)." },
  { name: "Provider", detail: "Only the transformed text is sent." },
  { name: "Output guard", detail: "Remove new sensitive data and leaked instructions from the reply, then restore pseudonyms." },
  { name: "Explain + audit", detail: "Tell the employee what happened and why; store metadata only." },
];

export function AboutPage() {
  return (
    <div className="admin about">
      <h1>How it works</h1>
      <p>
        <strong>Clearance Gateway</strong> sits between employees and AI providers. Data only goes where it's cleared to go.
      </p>

      <section className="card">
        <h2>Policy in, deterministic enforcement out</h2>
        <div className="flow" aria-label="Policy lifecycle">
          <div className="flow-step">Admin writes the AI policy in plain English</div>
          <div className="flow-arrow" aria-hidden="true">→</div>
          <div className="flow-step">LLM compiler drafts rules (schema-validated)</div>
          <div className="flow-arrow" aria-hidden="true">→</div>
          <div className="flow-step">Admin reviews the decision diff and simulates</div>
          <div className="flow-arrow" aria-hidden="true">→</div>
          <div className="flow-step">Activate: a new version</div>
        </div>
        <p className="muted">The LLM only drafts. It is never the component that lets a prompt through.</p>
      </section>

      <section className="card">
        <h2>Every prompt (no LLM in this path)</h2>
        <ol className="pipeline">
          {PIPELINE.map((step) => (
            <li key={step.name}>
              <strong>{step.name}</strong>
              <span>{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>Safety rules</h2>
        <ul>
          <li>Enforcement is deterministic. The compiler's output is a draft until an admin activates it.</li>
          <li>Fail closed: if no approved provider can take the data, the request is blocked and explained.</li>
          <li>No prompt or reply text is logged or stored. Audit records are metadata; previews are masked.</li>
          <li>Synthetic data only. Provider tiers are demo configuration, not claims about any vendor.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Known limitations</h2>
        <ul>
          <li>Detection is pattern- and dictionary-based. It does not understand context (a strategy document has no pattern), and some evasions (digits written as words, keys split across lines) are missed. See the Evaluation page for measured rates.</li>
          <li>Routing can only be as good as detection: undetected data is treated as public.</li>
          <li>Coding agents, SaaS copilots and TLS interception are out of scope. The coding-agent design is documented, not built.</li>
          <li>Demo admin code instead of SSO; health state is per serverless instance.</li>
        </ul>
        <p>
          Full list:{" "}
          <a href={`${REPO}/blob/main/docs/limitations.md`} target="_blank" rel="noreferrer">
            docs/limitations.md
          </a>{" "}
          · Source:{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            {REPO.replace("https://", "")}
          </a>
        </p>
      </section>
    </div>
  );
}
