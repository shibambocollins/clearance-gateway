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

/** Renders a check result. Only masked previews and the redacted text are shown. */
function showResult(response) {
  const model = response && response.ok ? LensModel.overlayModel(response.check) : LensModel.overlayModel(null);
  result.replaceChildren();
  result.className = `result ${model.kind}`;
  if (model.kind === "clear") {
    result.append(el("strong", { textContent: "Nothing sensitive found." }), el("p", { className: "muted", textContent: "Allowed by the active policy." }));
    return;
  }
  result.append(el("strong", { textContent: model.title }));
  if (model.kind !== "modify") for (const line of model.lines || []) result.append(el("p", { textContent: line }));
  if (model.findings?.length) {
    result.append(el("ul", {}, ...model.findings.map((f) => el("li", { textContent: `${f.label} ${f.masked}: ${f.outcome}${f.ruleId ? ` (${f.ruleId})` : ""}` }))));
  }
  if (model.preview) {
    result.append(el("div", { className: "muted", textContent: "Redacted version" }), el("pre", { textContent: model.preview }));
    const copy = el("button", { type: "button", textContent: "Copy redacted text" });
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
  result.className = "result";
  result.replaceChildren(el("p", { textContent: "Checking…" }));
  try {
    showResult(await chrome.runtime.sendMessage({ type: "lens-check", text, role: role.value }));
  } catch {
    showResult(null);
  } finally {
    $("quick-check").disabled = false;
  }
});

// Right-click result window
if (new URLSearchParams(location.search).get("view") === "selection") {
  $("settings").classList.add("hidden");
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
    $("site-name").textContent = "Lens can't run on this page.";
    return;
  }
  $("site-name").textContent = new URL(origin).host;
  const refresh = async () => {
    const on = await chrome.permissions.contains({ origins: [origin + "/*"] });
    $("protect").classList.toggle("hidden", on);
    $("unprotect").classList.toggle("hidden", !on);
    $("site-note").textContent = on
      ? "Lens checks what you send on this site. Text is checked shortly after you stop typing, and never stored."
      : "Chrome will ask you to let Lens read and change this site only.";
  };
  await refresh();

  $("protect").onclick = async () => {
    // Must run in this click: Chrome only shows the permission prompt for a user gesture.
    const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
    if (!granted) return;
    // The background also registers on permissions.onAdded; this call covers the case where the popup stays open.
    const r = await chrome.runtime.sendMessage({ type: "lens-enable-site", origin });
    $("site-note").textContent = r?.ok ? "Protected. Lens is active on this site now." : "Could not enable Lens here.";
    await refresh();
  };
  $("unprotect").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "lens-disable-site", origin });
    await refresh();
    $("site-note").textContent = "Lens is off for this site. Reload the page to finish.";
  };
}
