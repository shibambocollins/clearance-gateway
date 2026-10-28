// The web app talks only to the Clearance Gateway API, never to Supabase directly.

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export interface Health {
  status: "ok";
  service: string;
  coreVersion: string;
  offlineMode: boolean;
  db: "ok" | "unreachable" | "not_configured";
  activePolicyVersion: number | null;
  time: string;
}

export async function getHealth(): Promise<Health> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return (await res.json()) as Health;
}
