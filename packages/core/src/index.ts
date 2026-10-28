// Clearance Gateway Engine. Pure TypeScript with no I/O, shared by the API, Bench and Lens.

export const CORE_VERSION = "0.1.0";

export interface CoreInfo {
  name: "Clearance Gateway Engine";
  version: string;
}

export function coreInfo(): CoreInfo {
  return { name: "Clearance Gateway Engine", version: CORE_VERSION };
}
