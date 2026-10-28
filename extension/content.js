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
  let onEscape = null;

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
          previewLabel: "What will be sent",
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
        render({ kind: "clear-now", title: "Nothing sensitive found", lines: ["Send again to continue."] }, { editTarget: editor });
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

  // ------------------------------------------------------------------ overlay (FinMe design, D-057)
  function close() {
    if (host) host.remove();
    host = null;
    if (onEscape) window.removeEventListener("keydown", onEscape, true);
    onEscape = null;
  }

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const child of children) node.append(child);
    return node;
  };

  const SVG = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  /** The Lens mark (same geometry as icons/), drawn inline so the page can't swap it out. */
  function mark() {
    const svg = svgEl("svg", { viewBox: "0 0 32 32", "aria-hidden": "true" });
    svg.append(
      svgEl("rect", { width: "32", height: "32", rx: "7", fill: "#12503a" }),
      svgEl("circle", { cx: "13.76", cy: "13.76", r: "7.28", fill: "none", stroke: "#fbfaf7", "stroke-width": "2.72" }),
      svgEl("line", { x1: "20.2", y1: "20.2", x2: "25.6", y2: "25.6", stroke: "#fbfaf7", "stroke-width": "3.4", "stroke-linecap": "round" }),
      svgEl("polyline", { points: "10.7,14.2 13,16.5 17.1,11.7", fill: "none", stroke: "#fbfaf7", "stroke-width": "2.1", "stroke-linecap": "round", "stroke-linejoin": "round" }),
    );
    return svg;
  }

  // Status tag per state: the word always accompanies the colour.
  const STATUS = {
    checking: ["Checking", "neutral"],
    modify: ["Changes needed", "modify"],
    blocked: ["Blocked", "blocked"],
    error: ["Not sent", "blocked"],
    "clear-now": ["Clear", "clear"],
  };
  const OUTCOME_TAGS = {
    removed: ["Removed", ""],
    "replaced with a placeholder": ["Placeholder", "modify"],
    "not allowed": ["Blocked", "blocked"],
    allowed: ["Allowed", "clear"],
  };

  function render(model, actions = {}) {
    close();
    host = el("div", { id: "clearance-gateway-lens" });
    // Shadow DOM: the page can't restyle or read into the overlay by accident.
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.append(el("style", { textContent: STYLES }));

    const dismiss = () => {
      close();
      actions.editTarget?.focus();
    };
    const [statusText, statusClass] = STATUS[model.kind] || ["Lens", "neutral"];
    const panel = el("div", { className: `panel ${model.kind}` });
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Clearance Gateway Lens");

    const head = el(
      "div",
      { className: "head" },
      mark(),
      el("div", { className: "brand" }, el("strong", { textContent: "Lens" }), el("span", { textContent: "Clearance Gateway" })),
      el("span", { className: `tag status ${statusClass}`, textContent: statusText }),
    );
    if (model.kind !== "checking") {
      const x = el("button", { className: "x", textContent: "×", title: "Close (Esc)", onclick: dismiss });
      x.setAttribute("aria-label", "Close");
      head.append(x);
    }
    panel.append(head);

    const body = el("div", { className: "body" });
    if (model.kind === "checking") {
      body.append(el("p", { className: "checking" }, el("span", { className: "dot" }), "Checking your message against your company's AI policy…"));
    } else {
      body.append(el("h2", { textContent: model.title }));
      for (const line of model.lines || []) body.append(el("p", { textContent: line }));
      if (model.findings && model.findings.length) {
        body.append(el("p", { className: "label", textContent: "Found" }));
        const list = el("ul", { className: "findings" });
        for (const f of model.findings) {
          const [tagText, tagClass] = OUTCOME_TAGS[f.outcome] || [f.outcome, ""];
          list.append(
            el(
              "li",
              {},
              el("span", { className: "what", textContent: f.label }),
              el("code", { textContent: f.masked }),
              el("span", { className: `tag ${tagClass}`, textContent: tagText }),
              ...(f.ruleId ? [el("span", { className: "rule", textContent: f.ruleId })] : []),
            ),
          );
        }
        body.append(list);
      }
      if (model.preview) {
        body.append(el("p", { className: "label", textContent: actions.previewLabel || "Redacted version" }));
        body.append(el("pre", { textContent: model.preview }));
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
      buttons.append(el("button", { textContent: model.kind === "clear-now" ? "OK" : "Edit", onclick: dismiss }));
      body.append(buttons);
      body.append(
        el(
          "p",
          { className: "foot" },
          "Work data belongs in the ",
          el("a", { href: LensModel.assistantUrlFor(location.href), target: "_blank", rel: "noreferrer", textContent: "approved assistant" }),
          ".",
        ),
      );
    }
    panel.append(body);
    shadow.append(el("div", { className: "backdrop" }, panel));
    document.body.append(host);

    if (model.kind !== "checking") {
      onEscape = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dismiss();
      };
      window.addEventListener("keydown", onEscape, true);
    }
    (shadow.querySelector("button.primary") || shadow.querySelector(".buttons button") || shadow.querySelector("button"))?.focus();
  }

  const STYLES = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; background: rgba(20, 20, 15, .45); display: flex; align-items: center; justify-content: center; z-index: 2147483647; font: 15px/1.5 "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif; color: #5c5b52; text-align: left; }
    .panel { background: #fbfaf7; width: min(540px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto; border: 1px solid #e3e1d9; border-radius: 12px; box-shadow: 0 24px 48px -24px rgba(20, 20, 15, .5); }
    .head { display: flex; align-items: center; gap: 10px; padding: 12px 14px 12px 16px; background: #fff; border-bottom: 1px solid #e3e1d9; }
    .head svg { width: 28px; height: 28px; flex: none; }
    .brand { display: flex; flex-direction: column; line-height: 1.15; }
    .brand strong { font-size: 15px; font-weight: 800; letter-spacing: -.03em; color: #14140f; }
    .brand span { font: 500 9.5px/1.3 "JetBrains Mono", ui-monospace, Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; color: #6b6a61; }
    .status { margin-left: auto; }
    .body { padding: 16px 18px 16px; border-top: 3px solid #12503a; }
    .panel.modify .body { border-top-color: #7d8b6a; }
    .panel.blocked .body, .panel.error .body { border-top-color: #a65d3a; }
    .panel.checking .body { border-top-color: #e3e1d9; }
    h2 { font-size: 20px; line-height: 1.2; font-weight: 800; letter-spacing: -.03em; color: #14140f; margin: 0 0 6px; }
    p { margin: 0 0 8px; }
    .label { font: 500 9.5px/1.3 "JetBrains Mono", ui-monospace, Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; color: #6b6a61; margin: 14px 0 6px; }
    .findings { list-style: none; padding: 0; margin: 0; border-top: 1px solid #e3e1d9; }
    .findings li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 8px 0; border-bottom: 1px solid #e3e1d9; }
    .what { color: #14140f; font-weight: 600; }
    code { font: 12.5px/1.4 "JetBrains Mono", ui-monospace, Consolas, monospace; color: #14140f; background: #f1efe8; border-radius: 4px; padding: 1px 6px; }
    .rule { font: 10px/1.3 "JetBrains Mono", ui-monospace, Consolas, monospace; color: #6b6a61; }
    .tag { display: inline-block; padding: 2px 7px; border: 1px solid #e3e1d9; border-radius: 4px; background: #f1efe8; font: 500 9.5px/1.4 "JetBrains Mono", ui-monospace, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; color: #6b6a61; white-space: nowrap; }
    .tag.clear { background: #e4eee7; border-color: #bfd6c8; color: #12503a; }
    .tag.modify { background: #eef1e7; border-color: #d3dbc6; color: #56633f; }
    .tag.blocked { background: #fbf3ee; border-color: #e7d5c8; color: #7a3f24; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; background: #fff; border: 1px solid #e3e1d9; border-radius: 6px; padding: 10px 12px; font: 13px/1.45 "JetBrains Mono", ui-monospace, Consolas, monospace; color: #14140f; max-height: 200px; overflow: auto; user-select: text; }
    .buttons { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
    button { font: inherit; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 8px 16px; border-radius: 7px; border: 1.5px solid #c9c5b8; background: transparent; color: #5c5b52; cursor: pointer; transition: transform 90ms ease, box-shadow 90ms ease; }
    button:hover { border-color: #14140f; color: #14140f; }
    button.primary { background: #12503a; border-color: #0a3527; color: #fbfaf7; box-shadow: 3px 3px 0 #0a3527; }
    button.primary:hover { color: #fbfaf7; transform: translate(1.5px, 1.5px); box-shadow: 1.5px 1.5px 0 #0a3527; }
    button.primary:active { transform: translate(3px, 3px); box-shadow: 0 0 0 #0a3527; }
    button:focus-visible { outline: 2px solid #12503a; outline-offset: 3px; }
    .x { min-height: 30px; width: 30px; padding: 0; border-color: transparent; font-size: 20px; line-height: 1; color: #6b6a61; }
    .foot { margin: 14px 0 0; padding-top: 12px; border-top: 1px solid #e3e1d9; font-size: 13px; color: #6b6a61; }
    a { color: #12503a; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .checking { display: flex; align-items: center; gap: 10px; margin: 4px 0; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #7d8b6a; animation: blink 1.1s steps(1) infinite; }
    @keyframes blink { 0%, 60% { opacity: 1; } 61%, 100% { opacity: .25; } }
    @media (prefers-reduced-motion: reduce) { * { animation-duration: .001ms !important; transition-duration: .001ms !important; } }
  `;
})();
