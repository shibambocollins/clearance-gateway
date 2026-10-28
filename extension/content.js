// Lens content script. Two modes:
// - Demo page (OpenBox, data-lens attributes): intercept the form submit, check, overlay with
//   one-click "Send redacted".
// - A site the user enabled: check the focused editor's text shortly after typing stops. On Enter
//   or a send-like click, step in only if the latest check found something (or hasn't finished).
//   The overlay offers "Replace with redacted text" and "Copy redacted text"; the user sends
//   themselves, so Lens never has to fake events on someone else's editor.
// If a check fails, nothing is let through (fail closed).
(() => {
  if (window.__clearanceGatewayLens) return; // injected twice (static match + registration)
  window.__clearanceGatewayLens = true;

  const DEMO_FORM = 'form[data-lens="chat-form"]';
  const DEMO_INPUT = '[data-lens="chat-input"]';
  const EDITOR = 'textarea, [contenteditable=""], [contenteditable="true"], [role="textbox"]';
  const SEND_BUTTON =
    'button[type="submit"], [aria-label*="send" i], [data-testid*="send" i], button[title*="send" i]';
  const DEBOUNCE_MS = 450;

  const settings = { enabled: true, role: "general" };
  chrome.storage.local.get(["enabled", "role"]).then((s) => Object.assign(settings, s));
  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
  });

  const isDemo = () => Boolean(document.querySelector(DEMO_FORM));
  let bypassNextSubmit = false;
  let host = null;

  const ask = async (text) => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "lens-check", text, role: settings.role });
      return response && response.ok ? LensModel.overlayModel(response.check) : LensModel.overlayModel(null);
    } catch {
      return LensModel.overlayModel(null);
    }
  };

  // ------------------------------------------------------------------ demo page (OpenBox)
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches(DEMO_FORM) || settings.enabled === false) return;
      if (bypassNextSubmit) {
        bypassNextSubmit = false;
        return;
      }
      const input = form.querySelector(DEMO_INPUT);
      const text = input ? input.value : "";
      if (!text.trim()) return;
      // Must be synchronous: stop the page from sending before we've checked.
      event.preventDefault();
      event.stopImmediatePropagation();
      render({ kind: "checking" });
      ask(text).then((model) => {
        if (model.kind === "clear") {
          close();
          resubmit(form);
          return;
        }
        render(model, {
          primary: model.kind === "modify" && {
            label: "Send redacted",
            run: () => {
              setTextareaValue(input, model.preview);
              resubmit(form);
            },
          },
          editTarget: input,
        });
      });
    },
    true,
  );

  function resubmit(form) {
    bypassNextSubmit = true;
    // Let the page re-render with the new value before it reads it on submit.
    setTimeout(() => form.requestSubmit(), 0);
  }

  // ------------------------------------------------------------------ any enabled site
  const latest = new WeakMap(); // editor → { text, model } from the most recent finished check
  const timers = new WeakMap();

  const editorOf = (node) => (node instanceof Element ? node.closest(EDITOR) : null);
  const textOf = (editor) => (editor instanceof HTMLTextAreaElement ? editor.value : editor.innerText || "").trim();

  document.addEventListener(
    "input",
    (event) => {
      if (isDemo() || settings.enabled === false) return;
      const editor = editorOf(event.target);
      if (!editor) return;
      clearTimeout(timers.get(editor));
      timers.set(
        editor,
        setTimeout(async () => {
          const text = textOf(editor);
          if (!text) return latest.delete(editor);
          const model = await ask(text);
          if (textOf(editor) === text) latest.set(editor, { text, model });
        }, DEBOUNCE_MS),
      );
    },
    true,
  );

  /** True if this send attempt should be stopped (sensitive, unchecked, or the check failed). */
  function shouldStop(editor) {
    const text = textOf(editor);
    if (!text) return false;
    const known = latest.get(editor);
    return !(known && known.text === text && known.model.kind === "clear");
  }

  function intercept(event, editor) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const text = textOf(editor);
    const known = latest.get(editor);
    const show = (model) => {
      if (model.kind === "clear") {
        latest.set(editor, { text, model });
        render({ kind: "clear-now", title: "Checked: nothing sensitive", lines: ["Send again to continue."] }, { editTarget: editor });
        return;
      }
      render(model, {
        primary: model.kind === "modify" && {
          label: "Replace with redacted text",
          run: () => replaceEditorText(editor, model.preview),
        },
        copy: model.kind === "modify" ? model.preview : null,
        editTarget: editor,
      });
    };
    if (known && known.text === text) show(known.model);
    else {
      render({ kind: "checking" });
      ask(text).then(show);
    }
  }

  window.addEventListener(
    "keydown",
    (event) => {
      if (isDemo() || settings.enabled === false) return;
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.isComposing) return;
      const editor = editorOf(event.target);
      if (editor && shouldStop(editor)) intercept(event, editor);
    },
    true,
  );

  window.addEventListener(
    "click",
    (event) => {
      if (isDemo() || settings.enabled === false || !(event.target instanceof Element)) return;
      const button = event.target.closest(SEND_BUTTON);
      if (!button || (host && host.contains(event.target))) return;
      const editor = editorOf(document.activeElement) || button.closest("form")?.querySelector(EDITOR) || lastEditor;
      if (editor && shouldStop(editor)) intercept(event, editor);
    },
    true,
  );

  let lastEditor = null;
  document.addEventListener("focusin", (event) => {
    const editor = editorOf(event.target);
    if (editor) lastEditor = editor;
  });

  // ------------------------------------------------------------------ editing helpers
  /** Sets a React-controlled textarea's value so the page's own state updates. */
  function setTextareaValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function replaceEditorText(editor, value) {
    editor.focus();
    if (editor instanceof HTMLTextAreaElement) setTextareaValue(editor, value);
    else {
      // Rich editors (contenteditable) handle execCommand insertText like typing.
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, value);
    }
    const replaced = textOf(editor) === value.trim();
    // The redacted text came from the gateway itself, so the next send can go straight through.
    if (replaced) latest.set(editor, { text: value.trim(), model: { kind: "clear" } });
    if (!replaced) {
      render(
        { kind: "modify", title: "Couldn't replace the text on this site", lines: ["Copy the redacted text and paste it over your message instead."] },
        { copy: value, editTarget: editor },
      );
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ overlay
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

  function render(model, actions = {}) {
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
        panel.append(el("div", { className: "label", textContent: "Redacted version" }));
        panel.append(el("pre", { textContent: model.preview }));
      }

      const buttons = el("div", { className: "buttons" });
      if (actions.primary) {
        buttons.append(
          el("button", {
            className: "primary",
            textContent: actions.primary.label,
            onclick: () => {
              close();
              actions.primary.run();
            },
          }),
        );
      }
      if (actions.copy) {
        const copyButton = el("button", { textContent: "Copy redacted text" });
        copyButton.onclick = async () => {
          try {
            await navigator.clipboard.writeText(actions.copy);
            copyButton.textContent = "Copied";
          } catch {
            copyButton.textContent = "Copy failed: select the text above";
          }
        };
        buttons.append(copyButton);
      }
      buttons.append(
        el("button", {
          textContent: model.kind === "clear-now" ? "OK" : "Edit",
          onclick: () => {
            close();
            actions.editTarget?.focus();
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
    .panel { background: #fff; color: #1b1b1b; max-width: 520px; width: calc(100% - 32px); border-radius: 10px; padding: 18px 20px; box-shadow: 0 10px 30px rgba(0,0,0,.3); border-top: 6px solid #12503a; }
    .panel.blocked, .panel.error { border-top-color: #a65d3a; }
    .panel.modify { border-top-color: #7d8b6a; }
    .brand { font-size: 12px; font-weight: 700; color: #12503a; letter-spacing: .02em; }
    h2 { font-size: 18px; margin: 6px 0 8px; }
    p { margin: 0 0 8px; }
    ul { margin: 0 0 10px; padding-left: 20px; }
    .label { font-weight: 600; margin-top: 6px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f1efe8; border-radius: 6px; padding: 8px; font: 13px/1.4 ui-monospace, Consolas, monospace; max-height: 200px; overflow: auto; user-select: text; }
    .buttons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
    button { font: inherit; padding: 7px 14px; border-radius: 6px; border: 1px solid #c9c9c2; background: #fff; color: #1b1b1b; cursor: pointer; }
    button.primary { background: #12503a; border-color: #0a3527; color: #fbfaf7; font-weight: 600; box-shadow: 3px 3px 0 #0a3527; }
    a { color: #12503a; margin-left: auto; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #1d1d1d; color: #ececec; }
      pre { background: #2a2a2a; }
      button { background: #1d1d1d; color: #ececec; border-color: #444; }
      .brand, a { color: #7fbf9e; }
    }
  `;
})();
