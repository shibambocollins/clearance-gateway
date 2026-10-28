// Lens content script for the fictional OpenBox demo page. Intercepts the chat form's submit in
// the capture phase (before the page sees it), asks Clearance Gateway via the background worker,
// and shows an overlay. If the check fails, nothing is sent (fail closed).
(() => {
  const FORM = 'form[data-lens="chat-form"]';
  const INPUT = '[data-lens="chat-input"]';
  const settings = { enabled: true, role: "general" };
  let bypassNextSubmit = false;
  let host = null;

  chrome.storage.local.get(["enabled", "role"]).then((s) => Object.assign(settings, s));
  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
  });

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches(FORM)) return;
      if (bypassNextSubmit) {
        bypassNextSubmit = false;
        return;
      }
      if (settings.enabled === false) return;
      const input = form.querySelector(INPUT);
      const text = input ? input.value : "";
      if (!text.trim()) return;

      // Must be synchronous: stop the page from sending before we've checked.
      event.preventDefault();
      event.stopImmediatePropagation();
      check(form, input, text);
    },
    true,
  );

  async function check(form, input, text) {
    render(form, input, { kind: "checking" });
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: "lens-check", text, role: settings.role });
    } catch {
      response = null;
    }
    const model = response && response.ok ? LensModel.overlayModel(response.check) : LensModel.overlayModel(null);
    if (model.kind === "clear") {
      close();
      resubmit(form);
      return;
    }
    render(form, input, model);
  }

  /** Sets a React-controlled textarea's value so the page's own state updates. */
  function setValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function resubmit(form) {
    bypassNextSubmit = true;
    // Let the page re-render with the new value before it reads it on submit.
    setTimeout(() => form.requestSubmit(), 0);
  }

  function close() {
    if (host) host.remove();
    host = null;
  }

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const child of children) node.append(child);
    return node;
  };

  function render(form, input, model) {
    close();
    host = el("div", { id: "clearance-gateway-lens" });
    // Shadow DOM: the page can't restyle or read into the overlay by accident.
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.append(el("style", { textContent: STYLES }));

    const panel = el("div", { className: `panel ${model.kind}` });
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Clearance Gateway Lens");
    panel.append(el("div", { className: "brand", textContent: "Clearance Gateway Lens" }));

    if (model.kind === "checking") {
      panel.append(el("p", { textContent: "Checking your message against your company's AI policy…" }));
    } else {
      panel.append(el("h2", { textContent: model.title }));
      for (const line of model.lines || []) panel.append(el("p", { textContent: line }));
      if (model.findings && model.findings.length) {
        const list = el("ul");
        for (const f of model.findings) {
          list.append(el("li", { textContent: `${f.label} ${f.masked}: ${f.outcome}${f.ruleId ? ` (${f.ruleId})` : ""}` }));
        }
        panel.append(list);
      }
      if (model.preview) {
        panel.append(el("div", { className: "label", textContent: "What will be sent" }));
        panel.append(el("pre", { textContent: model.preview }));
      }

      const buttons = el("div", { className: "buttons" });
      if (model.kind === "modify") {
        buttons.append(
          el("button", {
            className: "primary",
            textContent: "Send redacted",
            onclick: () => {
              setValue(input, model.preview);
              close();
              resubmit(form);
            },
          }),
        );
      }
      buttons.append(
        el("button", {
          textContent: "Edit",
          onclick: () => {
            close();
            input.focus();
          },
        }),
      );
      buttons.append(
        el("a", {
          href: LensModel.assistantUrlFor(location.href),
          target: "_blank",
          rel: "noreferrer",
          textContent: "Use the approved assistant",
        }),
      );
      panel.append(buttons);
    }
    shadow.append(el("div", { className: "backdrop" }, panel));
    document.body.append(host);
    shadow.querySelector("button")?.focus();
  }

  const STYLES = `
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 2147483647; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .panel { background: #fff; color: #1b1b1b; max-width: 520px; width: calc(100% - 32px); border-radius: 10px; padding: 18px 20px; box-shadow: 0 10px 30px rgba(0,0,0,.3); border-top: 6px solid #0f6b4f; }
    .panel.blocked, .panel.error { border-top-color: #9c1c1c; }
    .panel.modify { border-top-color: #8a4b00; }
    .brand { font-size: 12px; font-weight: 700; color: #0f6b4f; letter-spacing: .02em; }
    h2 { font-size: 18px; margin: 6px 0 8px; }
    p { margin: 0 0 8px; }
    ul { margin: 0 0 10px; padding-left: 20px; }
    .label { font-weight: 600; margin-top: 6px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f3f3ef; border-radius: 6px; padding: 8px; font: 13px/1.4 ui-monospace, Consolas, monospace; max-height: 200px; overflow: auto; }
    .buttons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
    button { font: inherit; padding: 7px 14px; border-radius: 6px; border: 1px solid #c9c9c2; background: #fff; color: #1b1b1b; cursor: pointer; }
    button.primary { background: #0f6b4f; border-color: #0f6b4f; color: #fff; font-weight: 600; }
    a { color: #0f6b4f; margin-left: auto; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #1d1d1d; color: #ececec; }
      pre { background: #2a2a2a; }
      button { background: #1d1d1d; color: #ececec; border-color: #444; }
      .brand, a { color: #4fc49b; }
    }
  `;
})();
