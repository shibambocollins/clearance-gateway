// Dataset generator (SPEC §14.1). Deterministic from the seed. Split by TEMPLATE: within each
// category every third template goes to dev and the rest to test, so no template (sentence frame
// + slot types) used in test ever appears in dev.
import type { DataClassId, RoleId } from "@clearance-gateway/core";
import { createRng } from "./rng.js";
import { TEMPLATES, type Category, type Part, type Template } from "./templates.js";
import type { EvasionType } from "./values.js";

export const DEFAULT_SEED = 20261029;

export interface Label {
  dataClass: DataClassId;
  start: number;
  end: number;
}

export interface Case {
  id: string;
  template: string;
  split: "dev" | "test";
  category: Category;
  role: RoleId;
  evasion?: EvasionType;
  text: string;
  labels: Label[];
}

export function compose(parts: Part[]): { text: string; labels: Label[] } {
  let text = "";
  const labels: Label[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      text += part;
    } else {
      labels.push({ dataClass: part.dataClass, start: text.length, end: text.length + part.value.length });
      text += part.value;
    }
  }
  return { text, labels };
}

export function splitOf(template: Template, templates: Template[] = TEMPLATES): "dev" | "test" {
  const sameCategory = templates.filter((t) => t.category === template.category);
  return sameCategory.indexOf(template) % 3 === 0 ? "dev" : "test";
}

export function generateDataset(seed = DEFAULT_SEED): Case[] {
  const rng = createRng(seed);
  return TEMPLATES.flatMap((template) =>
    Array.from({ length: template.samples }, (_, i) => ({
      id: `${template.id}-${i + 1}`,
      template: template.id,
      split: splitOf(template),
      category: template.category,
      role: template.role ?? "general",
      ...(template.evasion ? { evasion: template.evasion } : {}),
      ...compose(template.render(rng)),
    })),
  );
}
