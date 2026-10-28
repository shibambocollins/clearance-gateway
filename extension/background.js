// Lens background service worker. Content scripts can't make cross-origin requests with the
// extension's host permissions, so they send only {text, role} here and this worker calls the
// fixed Clearance Gateway API URL (Chrome docs: "Cross-network requests", checked 2026-10-28).
importScripts("lens-model.js");

const MAX_CHARS = 12000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "lens-check" || typeof message.text !== "string") return false;

  const base = LensModel.apiBaseFor(sender.url || sender.tab?.url || "");
  fetch(`${base}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message.text.slice(0, MAX_CHARS), role: LensModel.safeRole(message.role) }),
  })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
    .then((check) => sendResponse({ ok: true, check }))
    .catch(() => sendResponse({ ok: false }));
  return true; // respond asynchronously
});
