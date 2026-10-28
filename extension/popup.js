// Lens popup: settings, per-site protection (Chrome asks the user for that one site), quick
// check, and the result of a right-click "Check with Clearance Gateway" (?view=selection).
const $ = (id) => document.getElementById(id);
const enabled = $("enabled");
const role = $("role");
const result = $("result");
$("assistant").href = LensModel.assistantUrlFor("");

chrome.storage.local.get({ enabled: true, role: "general" }).then((s) => {
  enabled.checked = s.enabled !== false;
  role.value = s.role;
});
enabled.addEventListener("change", () => chrome.storage.local.set({ enabled: enabled.checked }));
role.addEventListener("change", () => chrome.storage.local.set({ role: role.value }));

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
};

// Short tag for each outcome; the word always accompanies the colour.
const OUTCOME_TAGS = {
  removed: ["Removed", ""],
  "replaced with a placeholder": ["Placeholder", "placeholder"],
  "not allowed": ["Blocked", "blocked"],
  allowed: ["Allowed", "allowed"],
};

/** Renders a check result. Only masked previews and the redacted text are shown. */
function showResult(response) {
  const model = response && response.ok ? LensModel.overlayModel(response.check) : LensModel.overlayModel(null);
  result.replaceChildren();
  result.className = `card result ${model.kind}`;
  if (model.kind === "clear") {
    result.append(
      el("p", { className: "label", textContent: "Result" }),
      el("h2", { textContent: "Nothing sensitive found" }),
      el("p", { className: "muted", textContent: "The active policy allows this text as it is." }),
    );
    return;
  }
  result.append(el("p", { className: "label", textContent: "Result" }), el("h2", { textContent: model.title }));
  if (model.kind !== "modify") for (const line of model.lines || []) result.append(el("p", { textContent: line }));
  if (model.findings?.length) {
    const list = el("ul", { className: "findings" });
    for (const f of model.findings) {
      const [tagText, tagClass] = OUTCOME_TAGS[f.outcome] || [f.outcome, ""];
      list.append(
        el(
          "li",
          {},
          el("span", { textContent: f.label }),
          el("code", { textContent: f.masked }),
          el("span", { className: `tag ${tagClass}`, textContent: tagText }),
          ...(f.ruleId ? [el("span", { className: "rule", textContent: f.ruleId })] : []),
        ),
      );
    }
    result.append(list);
  }
  if (model.preview) {
    result.append(el("p", { className: "label", textContent: "Redacted version" }), el("pre", { textContent: model.preview }));
    const copy = el("button", { type: "button", className: "primary", textContent: "Copy redacted text" });
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(model.preview);
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Copy failed";
      }
    };
    result.append(el("div", { className: "row" }, copy));
  }
}

// Quick check
$("quick-check").addEventListener("click", async () => {
  const text = $("quick-text").value.trim();
  if (!text) return;
  $("quick-check").disabled = true;
  result.className = "card result";
  result.replaceChildren(el("p", { className: "label", textContent: "Checking…" }));
  try {
    showResult(await chrome.runtime.sendMessage({ type: "lens-check", text, role: role.value }));
  } catch {
    showResult(null);
  } finally {
    $("quick-check").disabled = false;
  }
});

// Right-click result window: show only the result.
if (new URLSearchParams(location.search).get("view") === "selection") {
  for (const id of ["settings", "site-card", "quick-card"]) $(id).classList.add("hidden");
  chrome.storage.session.get("lastSelectionCheck").then(({ lastSelectionCheck }) => {
    showResult(lastSelectionCheck);
    chrome.storage.session.remove("lastSelectionCheck");
  });
} else {
  setUpSite();
}

// Per-site protection
async function setUpSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = tab?.url ? LensModel.protectableOrigin(tab.url) : null;
  if (!origin) {
    $("site-name").textContent = "Lens can't run on this page";
    return;
  }
  $("site-name").textContent = new URL(origin).host;
  const status = $("site-status");
  const refresh = async () => {
    const on = await chrome.permissions.contains({ origins: [origin + "/*"] });
    $("protect").classList.toggle("hidden", on);
    $("unprotect").classList.toggle("hidden", !on);
    status.classList.remove("hidden");
    status.className = `tag ${on ? "on" : ""}`;
    status.textContent = on ? "Protected" : "Not protected";
    $("site-note").textContent = on
      ? "Lens checks what you send here, shortly after you stop typing. Nothing is stored."
      : "Chrome will ask you to let Lens read and change this site only.";
  };
  await refresh();

  $("protect").onclick = async () => {
    // Must run in this click: Chrome only shows the permission prompt for a user gesture.
    const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
    if (!granted) return;
    // The background also registers on permissions.onAdded; this call covers the case where the popup stays open.
    const r = await chrome.runtime.sendMessage({ type: "lens-enable-site", origin });
    await refresh();
    if (!r?.ok) $("site-note").textContent = "Could not enable Lens here.";
  };
  $("unprotect").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "lens-disable-site", origin });
    await refresh();
    $("site-note").textContent = "Lens is off for this site. Reload the page to finish.";
  };
}
