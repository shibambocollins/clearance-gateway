// The web app talks only to the Clearance Gateway API, never to Supabase directly.

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export type Role = "general" | "hr" | "finance" | "engineering";
export type Action = "allow" | "redact" | "tokenise" | "block";

export interface Health {
  status: "ok";
  service: string;
  coreVersion: string;
  offlineMode: boolean;
  db: "ok" | "unreachable" | "not_configured";
  activePolicyVersion: number | null;
  policySource: string;
  time: string;
}

export interface FindingView {
  dataClass: string;
  masked: string;
  start: number;
  end: number;
  action: Action;
  ruleId: string | null;
  confidence?: string;
}

export interface Candidate {
  providerId: string;
  label: string;
  tier: number;
  status: "eligible" | "disabled" | "unhealthy" | "blocked_by_rule" | "level_too_high";
}

export interface PolicyInfo {
  version: number | null;
  source: string;
  degraded: boolean;
}

export interface CheckResponse {
  policy: PolicyInfo;
  level: string;
  action: Action;
  blockReason: string | null;
  provider: { id: string; label: string; tier: number } | null;
  ruleIds: string[];
  findings: FindingView[];
  transformed: string | null;
  explanation: string[];
}

export interface ChatResponse {
  reply: string | null;
  explanation: string[];
  outcome: "sent" | "blocked" | "error";
  sent: string | null;
  decision: {
    action: Action;
    level: string;
    blockReason: string | null;
    ruleIds: string[];
    findings: FindingView[];
    candidates: Candidate[];
  };
  provider: { id: string; label: string; tier: number; mock: boolean } | null;
  latencyMs: number;
  offlineMode: boolean;
  mockReason: string | null;
  policy: PolicyInfo;
}

export interface ProviderStatus {
  id: string;
  label: string;
  tier: number;
  maxLevel: string;
  enabled: boolean;
  configured: boolean;
  simulatedOutage: boolean;
  runtimeDown: boolean;
  healthy: boolean;
}

export interface ProvidersResponse {
  offlineMode: boolean;
  routingOrder: string[];
  providers: ProviderStatus[];
  note: string;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`${code} (${status})`);
  }
}

async function request<T>(path: string, init: RequestInit = {}, adminCode?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminCode) headers["x-admin-code"] = adminCode;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? "request_failed");
  }
  return (await res.json()) as T;
}

export const getHealth = () => request<Health>("/health");

export const checkText = (text: string, role: Role, signal?: AbortSignal) =>
  request<CheckResponse>("/api/check", { method: "POST", body: JSON.stringify({ text, role }), signal });

export const sendChat = (text: string, role: Role) =>
  request<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify({ text, role, channel: "web" }) });

export const getProviders = () => request<ProvidersResponse>("/api/providers");

export const setOutage = (adminCode: string, providerId: string, down: boolean) =>
  request<{ providers: ProviderStatus[] }>(
    "/api/admin/outage",
    { method: "POST", body: JSON.stringify({ providerId, down }) },
    adminCode,
  );

export const resetDemo = (adminCode: string) =>
  request<{ activePolicyVersion: number | null }>("/api/admin/reset", { method: "POST", body: "{}" }, adminCode);

// ---- Policy lifecycle (admin) ----

export interface PolicyRuleView {
  id: string;
  description: string;
  sourceClause?: string;
  match: { dataClasses: string[]; roles?: string[]; providerTiers?: number[] };
  action: Action;
}

export interface CompiledPolicyView {
  name: string;
  dataClasses: { id: string; level: string; defaultAction: Action }[];
  rules: PolicyRuleView[];
  terms: { term: string; aliases?: string[]; dataClass: string }[];
  coaching: boolean;
  [key: string]: unknown;
}

export interface PolicyDiffView {
  cells: { dataClass: string; role: string; tier: number; from: Action; to: Action; direction: "looser" | "stricter" }[];
  levels: { dataClass: string; from: string; to: string; direction: "looser" | "stricter" }[];
  terms: { added: string[]; removed: string[] };
  looserCount: number;
  stricterCount: number;
}

export interface PolicyVersion {
  id: string;
  version: number;
  status: "draft" | "active" | "archived";
  compiled_by: string | null;
  created_at: string;
  activated_at: string | null;
  raw_text: string;
  compiled: CompiledPolicyView;
}

export interface CompileResponse {
  id: string | null;
  version: number | null;
  status: "draft";
  compiledBy: string;
  attempts: { provider: string; outcome: string; errors?: string[] }[];
  compiled: CompiledPolicyView;
  diff: PolicyDiffView;
  activeVersion: number | null;
}

export interface SimulateRow {
  label: string;
  role: Role;
  changed: boolean;
  active: SimSummary;
  candidate: SimSummary;
}
export interface SimSummary {
  action: Action;
  provider: string | null;
  level: string;
  ruleIds: string[];
  findings: { dataClass: string; masked: string; action: Action }[];
}

export const getActivePolicy = () =>
  request<{ version: number | null; source: string; rawText: string; compiled: CompiledPolicyView }>("/api/policy/active");

export const listVersions = (adminCode: string) => request<{ versions: PolicyVersion[] }>("/api/policy/versions", {}, adminCode);

export const compilePolicy = (adminCode: string, rawText: string) =>
  request<CompileResponse>("/api/policy/compile", { method: "POST", body: JSON.stringify({ rawText }) }, adminCode);

export const activateVersion = (adminCode: string, id: string) =>
  request<{ activePolicyVersion: number }>(`/api/policy/${id}/activate`, { method: "POST", body: "{}" }, adminCode);

export const simulate = (adminCode: string, policyId: string, prompts?: string[], role?: Role) =>
  request<{ activeVersion: number | null; candidateVersion: number | null; rows: SimulateRow[]; changedCount: number }>(
    "/api/policy/simulate",
    { method: "POST", body: JSON.stringify({ policyId, prompts, role }) },
    adminCode,
  );

// ---- Dashboard ----

export interface Count {
  name: string;
  count: number;
}

export interface StatsResponse {
  available: boolean;
  windowDays: number;
  total?: number;
  withSensitiveData?: number;
  byOutcome?: Count[];
  byAction?: Count[];
  byDataClass?: Count[];
  byProvider?: Count[];
  byChannel?: Count[];
  byRole?: Count[];
  medianLatencyMs?: number | null;
}

export interface AuditEventView {
  id: number;
  at: string;
  channel: string | null;
  role: string | null;
  policy_version: number | null;
  data_classes: string[] | null;
  final_action: string | null;
  rule_ids: string[] | null;
  provider: string | null;
  outcome: string | null;
  latency_ms: number | null;
}

export const getStats = () => request<StatsResponse>("/api/stats");
export const getAudit = (adminCode: string) => request<{ events: AuditEventView[] }>("/api/audit", {}, adminCode);
