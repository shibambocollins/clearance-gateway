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
      lines: ["OpenBox is not an approved AI provider. Send the version below without the sensitive values, or edit your message."],
      findings,
      preview: check.transformed,
    };
  }

  root.LensModel = { apiBaseFor, assistantUrlFor, safeRole, overlayModel, LABELS };
})(globalThis);
