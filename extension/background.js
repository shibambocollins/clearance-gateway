// Lens background service worker. Content scripts can't make cross-origin requests with the
// extension's host permissions, so they (and the popup) send only {text, role} here and this
// worker calls the fixed Clearance Gateway API URL (Chrome docs: "Cross-network requests",
// checked 2026-10-28). It also owns the right-click menu and the per-site registrations.
importScripts("lens-model.js");

const MAX_CHARS = 12000;
const MENU_ID = "lens-check-selection";

async function checkText(base, text, role) {
  const res = await fetch(`${base}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, MAX_CHARS), role: LensModel.safeRole(role) }),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

async function currentRole() {
  const { role } = await chrome.storage.local.get({ role: "general" });
  return role;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type === "lens-check" && typeof message.text === "string") {
    // From a content script (demo page or a site the user enabled) or the popup's quick check.
    const base = sender.tab ? LensModel.apiBaseFor(sender.url || sender.tab.url || "") : LensModel.PROD_API;
    checkText(base, message.text, message.role)
      .then((check) => sendResponse({ ok: true, check }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "lens-enable-site" && typeof message.origin === "string") {
    enableSite(message.origin)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "lens-disable-site" && typeof message.origin === "string") {
    disableSite(message.origin)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

/** Registers Lens on one site the user approved in Chrome's permission prompt. Idempotent. */
async function enableSite(origin) {
  if (LensModel.protectableOrigin(origin + "/") !== origin) throw new Error("not a web page");
  const granted = await chrome.permissions.contains({ origins: [origin + "/*"] });
  if (!granted) throw new Error("permission not granted");
  const id = LensModel.scriptIdFor(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) return;
  await chrome.scripting.registerContentScripts([
    { id, matches: [origin + "/*"], js: ["lens-model.js", "content.js"], runAt: "document_idle", persistAcrossSessions: true },
  ]);
  // Start protecting tabs already open on that site, without a reload (content.js ignores a second injection).
  const tabs = await chrome.tabs.query({ url: origin + "/*" });
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["lens-model.js", "content.js"] }).catch(() => {});
    }
  }
}

// The popup can close while Chrome's permission prompt is open, so registration is driven by the
// permission change itself rather than by code after the prompt in the popup.
chrome.permissions.onAdded.addListener(({ origins = [] }) => {
  for (const pattern of origins) {
    const origin = LensModel.protectableOrigin(pattern.replace(/\/\*$/, "/"));
    if (origin) enableSite(origin).catch(() => {});
  }
});

async function disableSite(origin) {
  const id = LensModel.scriptIdFor(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [id] });
  await chrome.permissions.remove({ origins: [origin + "/*"] });
}

// Right-click → "Check with Clearance Gateway" on selected text, on any page. Lens reads only the
// selection the user chose; the result (masked) opens in a small window.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: "Check with Clearance Gateway", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  let result;
  try {
    const check = await checkText(LensModel.PROD_API, info.selectionText, await currentRole());
    // Store only the check result (masked findings, redacted text), in memory-only session storage.
    result = { ok: true, check: { action: check.action, findings: check.findings, transformed: check.transformed, explanation: check.explanation } };
  } catch {
    result = { ok: false };
  }
  await chrome.storage.session.set({ lastSelectionCheck: result });
  await chrome.windows.create({ url: "popup.html?view=selection", type: "popup", width: 400, height: 600 });
});
