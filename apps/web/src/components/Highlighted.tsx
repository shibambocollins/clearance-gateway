// Renders the user's own text with detected spans marked by the action that will apply.
// Runs in the user's browser only; the text never leaves except to the API they're calling.
import type { ReactNode } from "react";
import type { FindingView } from "../api";

export function Highlighted({ text, findings }: { text: string; findings: FindingView[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const f of [...findings].sort((a, b) => a.start - b.start)) {
    if (f.start < at) continue;
    parts.push(text.slice(at, f.start));
    parts.push(
      <mark key={f.start} className={`mark-${f.action}`} title={`${f.dataClass}: ${f.action}${f.ruleId ? ` (${f.ruleId})` : ""}`}>
        {text.slice(f.start, f.end)}
      </mark>,
    );
    at = f.end;
  }
  parts.push(text.slice(at));
  return <div className="highlighted">{parts}</div>;
}
