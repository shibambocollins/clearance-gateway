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
