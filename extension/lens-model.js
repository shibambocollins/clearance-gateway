// Lens: pure helpers shared by the content script and the background worker (and unit-tested).
// Plain JS so the extension loads unpacked without a build step.
(function (root) {
  const PROD_WEB = "https://clearance-gateway-web.vercel.app";
  const PROD_API = "https://clearance-gateway-api.vercel.app";
  const LOCAL_WEB = "http://localhost:5173";
  const LOCAL_API = "http://localhost:3001";
  const ROLES = ["general", "hr", "finance", "engineering"];

  const LABELS = {
    SA_ID: "South African ID number",
    CARD_NUMBER: "Card number",
    BANK_ACCOUNT: "Bank account number",
    EMAIL: "Email address",
    PHONE: "Phone number",
    CREDENTIAL: "Password, key or token",
    CLIENT_NAME: "Client name",
    PROJECT_CODENAME: "Project codename",
  };

  const ACTIONS = {
    redact: "removed",
    tokenise: "replaced with a placeholder",
    block: "not allowed",
    allow: "allowed",
  };

  /** The API is chosen from a fixed list: a page can never make Lens call another URL. */
  function apiBaseFor(pageUrl) {
    return typeof pageUrl === "string" && pageUrl.startsWith(LOCAL_WEB + "/") ? LOCAL_API : PROD_API;
  }

  function assistantUrlFor(pageUrl) {
    return typeof pageUrl === "string" && pageUrl.startsWith(LOCAL_WEB + "/") ? LOCAL_WEB + "/" : PROD_WEB + "/";
  }

  function safeRole(role) {
    return ROLES.includes(role) ? role : "general";
  }

  /**
   * What the overlay should show for an /api/check response. This site is NOT an approved AI
   * provider, so "Send anyway" is never offered for anything the policy changes or blocks.
   */
  function overlayModel(check) {
    if (!check || typeof check.action !== "string") {
      return { kind: "error", title: "Lens could not check this message", lines: ["Your message was not sent."], findings: [] };
    }
    if (check.action === "allow") return { kind: "clear" };
    const findings = (check.findings || []).map((f) => ({
      label: LABELS[f.dataClass] || f.dataClass,
      masked: f.masked,
      outcome: ACTIONS[f.action] || f.action,
      ruleId: f.ruleId || null,
    }));
    if (check.action === "block" || check.transformed === null) {
      return {
        kind: "blocked",
        title: "Blocked by your company's AI policy",
        // Explanations already say why (a rule, or fail closed); drop routing lines meant for the assistant.
        lines: (check.explanation || []).filter((l) => !l.startsWith("Not used:")),
        findings,
      };
    }
    return {
      kind: "modify",
      title: "Sensitive data found",
      lines: ["This site is not an approved AI provider. Use the version below without the sensitive values, or edit your message."],
      findings,
      preview: check.transformed,
    };
  }

  /**
   * The origin Lens may be enabled on for this URL, or null. Only ordinary web pages qualify:
   * not browser pages, not the Clearance Gateway API itself.
   */
  function protectableOrigin(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.origin === PROD_API || parsed.origin === LOCAL_API) return null;
    return parsed.origin;
  }

  /** Stable id for a dynamically registered content script (one per enabled site). */
  function scriptIdFor(origin) {
    return "lens-site-" + origin.replace(/[^a-z0-9]/gi, "_");
  }

  root.LensModel = { PROD_API, apiBaseFor, assistantUrlFor, safeRole, overlayModel, protectableOrigin, scriptIdFor, LABELS };
})(globalThis);
