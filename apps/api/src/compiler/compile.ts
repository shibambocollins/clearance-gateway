// Policy compiler: LLM via a fallback chain → parse → schema-validate → on failure retry once with
// the validation errors → next provider → otherwise an error. The result is only ever a DRAFT;
// an admin must review and activate it (SPEC §10). Providers and routing are configuration, so
// they are copied from the active policy rather than generated.
import { policySchema, type CompiledPolicy } from "@clearance-gateway/core";
import { getConfig } from "../config.js";
import { geminiGenerate, groqChat, type GenerateOptions } from "../providers/adapters.js";
import { COMPILER_SYSTEM, compilerUserPrompt } from "./prompt.js";

const CALL_TIMEOUT_MS = 45_000;
const MAX_TOKENS = 8192;

export class CompilerError extends Error {
  constructor(
    readonly code: "unavailable" | "invalid_output",
    readonly attempts: Attempt[],
  ) {
    super(code);
  }
}

export interface Attempt {
  provider: string;
  outcome: "valid" | "invalid_json" | "schema_errors" | "provider_error";
  errors?: string[];
}

interface CompilerProvider {
  id: string;
  compiledBy: string;
  generate(o: GenerateOptions): Promise<string>;
}

function compilerChain(): CompilerProvider[] {
  const c = getConfig();
  if (c.offlineMode) return [];
  const chain: CompilerProvider[] = [];
  if (c.geminiApiKey && c.geminiModel) {
    const [key, model] = [c.geminiApiKey, c.geminiModel];
    chain.push({ id: "gemini", compiledBy: `gemini:${model}`, generate: (o) => geminiGenerate(key, model, o) });
  }
  if (c.groqApiKey && c.groqModel) {
    const [key, model] = [c.groqApiKey, c.groqModel];
    chain.push({ id: "groq", compiledBy: `groq:${model}`, generate: (o) => groqChat(key, model, o) });
  }
  return chain;
}

/** Pulls the JSON object out of a reply, tolerating code fences or stray prose. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

/** Validates LLM output merged with the configuration the LLM must not control. */
export function validateCompiled(output: unknown, base: CompiledPolicy): { policy?: CompiledPolicy; errors: string[] } {
  const o = (output ?? {}) as Record<string, unknown>;
  const candidate = {
    schemaVersion: 1,
    mode: "enforce",
    name: o.name,
    dataClasses: o.dataClasses,
    rules: o.rules,
    terms: o.terms,
    coaching: o.coaching,
    providers: base.providers,
    routing: base.routing,
  };
  const parsed = policySchema.safeParse(candidate);
  if (parsed.success) return { policy: parsed.data, errors: [] };
  return { errors: parsed.error.issues.slice(0, 15).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}

export async function compilePolicy(
  rawText: string,
  base: CompiledPolicy,
): Promise<{ compiled: CompiledPolicy; compiledBy: string; attempts: Attempt[] }> {
  const chain = compilerChain();
  const attempts: Attempt[] = [];
  if (chain.length === 0) throw new CompilerError("unavailable", attempts);
  const user = compilerUserPrompt(rawText, base.providers);

  for (const provider of chain) {
    let feedback = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      let reply: string;
      try {
        reply = await provider.generate({
          system: COMPILER_SYSTEM,
          user: user + feedback,
          maxTokens: MAX_TOKENS,
          temperature: 0,
          json: true,
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        });
      } catch {
        attempts.push({ provider: provider.id, outcome: "provider_error" });
        break; // move on to the next provider
      }
      let output: unknown;
      try {
        output = extractJson(reply);
      } catch {
        attempts.push({ provider: provider.id, outcome: "invalid_json" });
        feedback = "\n\nYour previous answer was not a valid JSON object. Return only the JSON object.";
        continue;
      }
      const { policy, errors } = validateCompiled(output, base);
      if (policy) {
        attempts.push({ provider: provider.id, outcome: "valid" });
        return { compiled: policy, compiledBy: provider.compiledBy, attempts };
      }
      attempts.push({ provider: provider.id, outcome: "schema_errors", errors });
      feedback = `\n\nYour previous answer failed validation:\n${errors.map((e) => `- ${e}`).join("\n")}\nReturn a corrected JSON object only.`;
    }
  }
  throw new CompilerError("invalid_output", attempts);
}
