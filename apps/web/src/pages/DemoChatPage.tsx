// "OpenBox Chat (fictional)": a deliberately generic, clearly fictional stand-in for an
// UNSANCTIONED AI chat site, used to demonstrate Lens. It calls no AI and sends nothing anywhere;
// it only shows what text it would have received. Stable data-lens attributes are the contract
// with the Lens content script.
import { useState, type FormEvent } from "react";

interface Message {
  from: "you" | "openbox";
  text: string;
}

export function DemoChatPage() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sent = text.trim();
    if (!sent) return;
    setMessages((m) => [
      ...m,
      { from: "you", text: sent },
      { from: "openbox", text: `OpenBox (fictional) received ${sent.length} characters. This is exactly what left your browser.` },
    ]);
    setText("");
  };

  return (
    <div className="openbox">
      <p className="note" role="note">
        <strong>Fictional demo site.</strong> OpenBox Chat is not a real product. It stands in for an unsanctioned AI tool an
        employee might paste into. It calls no AI and sends nothing anywhere. Install the Lens extension (see the README) to see
        Clearance Gateway check prompts here before they leave the browser.
      </p>
      <div className="openbox-frame">
        <div className="openbox-title">
          <span className="openbox-logo" aria-hidden="true">□</span> OpenBox Chat <span className="muted">(fictional)</span>
        </div>
        <div className="openbox-log" data-lens="chat-log" aria-live="polite">
          {messages.length === 0 && <p className="muted">Ask OpenBox anything. Try pasting one of the Assistant's sample prompts.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`openbox-msg openbox-${m.from}`}>
              <span className="openbox-who">{m.from === "you" ? "You" : "OpenBox"}</span>
              <span className="openbox-text">{m.text}</span>
            </div>
          ))}
        </div>
        <form className="openbox-form" data-lens="chat-form" onSubmit={submit}>
          <textarea
            data-lens="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Message OpenBox…"
            aria-label="Message"
          />
          <button type="submit" className="primary" data-lens="chat-submit">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
