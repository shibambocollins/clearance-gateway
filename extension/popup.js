// Lens popup: the on/off toggle and the demo role, saved in chrome.storage.local.
const enabled = document.getElementById("enabled");
const role = document.getElementById("role");

chrome.storage.local.get({ enabled: true, role: "general" }).then((s) => {
  enabled.checked = s.enabled !== false;
  role.value = s.role;
});

enabled.addEventListener("change", () => chrome.storage.local.set({ enabled: enabled.checked }));
role.addEventListener("change", () => chrome.storage.local.set({ role: role.value }));
