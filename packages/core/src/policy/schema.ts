// Compiled policy schema (SPEC §7.1). The compiler's LLM output must pass this before an admin
// can even review it, and the API re-validates whatever it loads from the database.
import { z } from "zod";
import { DATA_CLASS_IDS } from "../types.js";

export const LEVELS = ["public", "internal", "confidential", "restricted"] as const;
export const ACTIONS = ["allow", "redact", "tokenise", "block"] as const;
export const ROLE_IDS = ["general", "hr", "finance", "engineering"] as const;

export type Level = (typeof LEVELS)[number];
export type Action = (typeof ACTIONS)[number];
export type RoleId = (typeof ROLE_IDS)[number];
export type Tier = 1 | 2 | 3;

const levelSchema = z.enum(LEVELS);
const actionSchema = z.enum(ACTIONS);
const dataClassSchema = z.enum(DATA_CLASS_IDS);
const roleSchema = z.enum(ROLE_IDS);
const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const policySchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1),
    mode: z.enum(["enforce", "shadow"]),
    dataClasses: z.array(
      z.object({ id: dataClassSchema, level: levelSchema, defaultAction: actionSchema }).strict(),
    ),
    rules: z.array(
      z
        .object({
          id: z.string().regex(/^R-[A-Z]+-\d{2}$/, 'Rule ids look like "R-CRED-01"'),
          description: z.string().min(1),
          sourceClause: z.string().optional(),
          match: z
            .object({
              dataClasses: z.array(dataClassSchema).min(1),
              roles: z.array(roleSchema).min(1).optional(),
              providerTiers: z.array(tierSchema).min(1).optional(),
            })
            .strict(),
          action: actionSchema,
        })
        .strict(),
    ),
    terms: z.array(
      z
        .object({
          term: z.string().min(1),
          aliases: z.array(z.string().min(1)).optional(),
          dataClass: z.enum(["CLIENT_NAME", "PROJECT_CODENAME"]),
        })
        .strict(),
    ),
    providers: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            tier: tierSchema,
            maxLevel: levelSchema,
            enabled: z.boolean(),
          })
          .strict(),
      )
      .min(1),
    routing: z
      .object({ order: z.array(z.string()).min(1), onNoEligibleProvider: z.literal("block") })
      .strict(),
    coaching: z.boolean(),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });

    const classIds = policy.dataClasses.map((d) => d.id);
    for (const id of DATA_CLASS_IDS) {
      if (!classIds.includes(id)) issue(`Data class ${id} needs a level and default action`, ["dataClasses"]);
    }
    if (new Set(classIds).size !== classIds.length) issue("Each data class may appear only once", ["dataClasses"]);

    const ruleIds = policy.rules.map((r) => r.id);
    if (new Set(ruleIds).size !== ruleIds.length) issue("Rule ids must be unique", ["rules"]);

    const providerIds = policy.providers.map((p) => p.id);
    if (new Set(providerIds).size !== providerIds.length) issue("Provider ids must be unique", ["providers"]);
    policy.routing.order.forEach((id, i) => {
      if (!providerIds.includes(id)) issue(`Unknown provider "${id}" in routing order`, ["routing", "order", i]);
    });
  });

export type CompiledPolicy = z.infer<typeof policySchema>;
export type PolicyRule = CompiledPolicy["rules"][number];
export type ProviderConfig = CompiledPolicy["providers"][number];

export function levelRank(level: Level): number {
  return LEVELS.indexOf(level);
}

/** Strictness order for combining rule actions (SPEC §8): block > tokenise > redact > allow. */
export function actionRank(action: Action): number {
  return ["allow", "redact", "tokenise", "block"].indexOf(action);
}
