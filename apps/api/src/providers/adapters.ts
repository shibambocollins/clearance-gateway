// Provider adapters: plain fetch, no SDKs. Endpoints checked against the provider docs on
// 2026-10-28 (docs/decisions.md D-029). Errors never include request or response bodies.
import { getConfig, type Config } from "../config.js";

export const SYSTEM_PROMPT =
  "You are a helpful workplace assistant for Acme Demo Logistics, a fictional company. " +
  "Some values in the user's message were replaced with placeholders such as [CLIENT_NAME_1] or [REDACTED:SA_ID]. " +
  "Keep placeholders exactly as written, never guess what they stand for, and never ask for the hidden values. " +
  "Answer concisely.";

/** Fragments of SYSTEM_PROMPT the output guard removes if a reply echoes them. */
export const SYSTEM_PROMPT_FRAGMENTS = [
  "Keep placeholders exactly as written, never guess what they stand for",
  "never ask for the hidden values",
];

export class ProviderError extends Error {
  constructor(
    readonly providerId: string,
    readonly kind: "http" | "timeout" | "empty" | "not_configured",
    readonly status?: number,
  ) {
    super(`${providerId}: ${kind}${status ? ` (${status})` : ""}`);
  }
}

export interface ProviderAdapter {
  call(prompt: string, signal: AbortSignal): Promise<string>;
}

export interface ResolvedAdapter {
  adapter: ProviderAdapter;
  /** True when a deterministic mock answers instead of a real model. */
  mock: boolean;
}

const MAX_OUTPUT_TOKENS = 1024;

function geminiAdapter(apiKey: string, model: string): ProviderAdapter {
  return {
    async call(prompt, signal) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
          }),
        },
      );
      if (!res.ok) throw new ProviderError("gemini", "http", res.status);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (!text) throw new ProviderError("gemini", "empty");
      return text;
    },
  };
}

function groqAdapter(apiKey: string, model: string): ProviderAdapter {
  return {
    async call(prompt, signal) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.4,
        }),
      });
      if (!res.ok) throw new ProviderError("groq", "http", res.status);
      const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      const text = body.choices?.[0]?.message?.content?.trim();
      if (!text) throw new ProviderError("groq", "empty");
      return text;
    },
  };
}

/**
 * Deterministic stand-in for a model: repeats the placeholders it received (so token restore is
 * visible) and never sees any value that was redacted or tokenised.
 */
export function mockAdapter(label: string): ProviderAdapter {
  return {
    async call(prompt) {
      const placeholders = [...new Set(prompt.match(/\[[A-Z_]+_\d+\]/g) ?? [])];
      const redactions = (prompt.match(/\[REDACTED:[A-Z_]+\]/g) ?? []).length;
      const words = prompt.trim().split(/\s+/).length;
      const subject = placeholders.length > 0 ? placeholders.join(" and ") : "your request";
      const lines = [
        `(Deterministic demo reply from ${label}. No real model was called.)`,
        `I received a ${words}-word request${redactions > 0 ? ` with ${redactions} value${redactions === 1 ? "" : "s"} removed` : ""}.`,
        `Draft: "Hello team, here is a short update regarding ${subject}. The details are being finalised and we will confirm next steps by Friday. Kind regards."`,
      ];
      return lines.join("\n\n");
    },
  };
}

/** True if the provider can be called in the current mode (offline mode always uses the mock). */
export function isConfigured(providerId: string, config: Config = getConfig()): boolean {
  if (config.offlineMode || providerId === "mock-enterprise") return true;
  if (providerId === "gemini") return Boolean(config.geminiApiKey && config.geminiModel);
  if (providerId === "groq") return Boolean(config.groqApiKey && config.groqModel);
  return false;
}

export function resolveAdapter(providerId: string, label: string, forceMock: boolean): ResolvedAdapter {
  const config = getConfig();
  if (providerId === "mock-enterprise") return { adapter: mockAdapter(label), mock: true };
  if (forceMock || config.offlineMode) return { adapter: mockAdapter(`a mock standing in for ${label}`), mock: true };
  if (providerId === "gemini" && config.geminiApiKey && config.geminiModel) {
    return { adapter: geminiAdapter(config.geminiApiKey, config.geminiModel), mock: false };
  }
  if (providerId === "groq" && config.groqApiKey && config.groqModel) {
    return { adapter: groqAdapter(config.groqApiKey, config.groqModel), mock: false };
  }
  throw new ProviderError(providerId, "not_configured");
}
