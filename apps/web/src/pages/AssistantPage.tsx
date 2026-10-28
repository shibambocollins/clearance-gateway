// Employee assistant: prompt box with live checking, "what will be sent" preview, reply,
// explanation and provider badge.
import { useEffect, useRef, useState } from "react";
import { SAMPLE_PROMPTS } from "@clearance-gateway/core/samples";
import { checkText, sendChat, type ChatResponse, type CheckResponse, type Role } from "../api";
import { DemoControls } from "../components/DemoControls";
import { Highlighted } from "../components/Highlighted";

const ROLES: { id: Role; label: string }[] = [
  { id: "general", label: "General staff" },
  { id: "hr", label: "HR" },
  { id: "finance", label: "Finance" },
  { id: "engineering", label: "Engineering" },
];

const ACTION_LABELS: Record<string, string> = {
  allow: "Allowed",
  redact: "Redacted",
  tokenise: "Pseudonymised",
  block: "Blocked",
};

export function AssistantPage() {
  const [role, setRole] = useState<Role>("general");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<CheckResponse | null>(null);
  const [previewTick, setPreviewTick] = useState(0);
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Live check, debounced. /api/check never calls an AI provider.
  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      checkText(text, role, controller.signal)
        .then(setPreview)
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) setPreview(null);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [text, role, previewTick]);

  const send = async () => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      setResult(await sendChat(text, role));
    } catch {
      setError("The request could not be completed. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const pickSample = (id: string) => {
    const sample = SAMPLE_PROMPTS.find((s) => s.id === id)!;
    setRole(sample.role);
    setText(sample.text);
    setResult(null);
  };

  return (
    <div className="assistant">
      <section className="card">
        <div className="row">
          <label className="field">
            Your role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="samples" role="group" aria-label="Sample prompts">
          {SAMPLE_PROMPTS.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => pickSample(s.id)} title={s.shows}>
              {s.label}
            </button>
          ))}
        </div>

        <label className="field">
          Prompt
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Ask the assistant something, or pick a sample above."
            maxLength={12000}
          />
        </label>

        {preview && (
          <div className="preview">
            <div className="preview-head">
              <span className={`badge badge-${preview.action}`}>{ACTION_LABELS[preview.action]}</span>
              <span className="muted">
                Sensitivity: {preview.level}
                {preview.provider ? ` · would go to ${preview.provider.label}` : " · would not be sent"}
              </span>
            </div>
            {preview.findings.length > 0 && <Highlighted text={text} findings={preview.findings} />}
            {preview.findings.length > 0 && (
              <ul className="findings">
                {preview.findings.map((f) => (
                  <li key={`${f.start}-${f.end}`}>
                    <code>{f.masked}</code> {f.dataClass.replace("_", " ").toLowerCase()} →{" "}
                    <span className={`badge badge-${f.action}`}>{ACTION_LABELS[f.action]}</span>
                    {f.ruleId && <span className="muted"> {f.ruleId}</span>}
                  </li>
                ))}
              </ul>
            )}
            {preview.transformed !== null && (
              <>
                <h3>What will be sent</h3>
                <pre className="sent">{preview.transformed}</pre>
              </>
            )}
          </div>
        )}

        <button type="button" className="primary" disabled={!text.trim() || sending} onClick={send}>
          {sending ? "Sending…" : "Send"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <section className="card result" aria-live="polite">
          <div className="preview-head">
            <span className={`badge badge-${result.outcome === "sent" ? result.decision.action : "block"}`}>
              {result.outcome === "sent" ? ACTION_LABELS[result.decision.action] : result.outcome === "blocked" ? "Blocked" : "No answer"}
            </span>
            {result.provider && (
              <span className="provider-badge">
                {result.provider.label} · tier {result.provider.tier}
                {result.provider.mock ? " · mock" : ""}
              </span>
            )}
            <span className="muted">{result.latencyMs} ms</span>
          </div>
          <h3>Why</h3>
          <ul className="explanation">
            {result.explanation.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {result.sent !== null && (
            <>
              <h3>What was sent</h3>
              <pre className="sent">{result.sent}</pre>
            </>
          )}
          {result.reply !== null && (
            <>
              <h3>Reply</h3>
              <div className="reply">{result.reply}</div>
            </>
          )}
        </section>
      )}

      <DemoControls onChange={() => setPreviewTick((n) => n + 1)} />
    </div>
  );
}
