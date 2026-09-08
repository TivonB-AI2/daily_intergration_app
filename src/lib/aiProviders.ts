/** AI providers available for the app's AI-powered features. "anthropic"
 * and "openai" call the OpenAI/Anthropic APIs directly using this app's own
 * `OPENAI_API_KEY`/`ANTHROPIC_KEY` secrets (see
 * `@/services/ai/aiModelService`) — switched after the platform AI/ML
 * connector's auth started failing with 401s (see routes/AGENTS.md feature
 * notes for context). "ai-squared-bolt" instead goes through the platform's
 * own AI/ML connector (id `AI_SQUARED_BOLT_CONNECTOR_ID` below, "App Builder
 * AI Squared Bolt") via `useExecuteModel()` — offered as a selectable option
 * everywhere the other two are, not a replacement for them. */
export const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI (GPT)" },
  { id: "ai-squared-bolt", label: "AI Squared Bolt" },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = "anthropic";

/** The platform AI/ML connector id backing the "ai-squared-bolt" provider
 * option — re-verified live via `aisquared_connectors_show`/
 * `aisquared_connectors_execute_model` ("App Builder AI Squared Bolt",
 * connector_name "Aisquared", now returns a real completion at the platform
 * level, unlike the connector previously wired up here). Still kept behind
 * the same 401 handling/fallback messaging in case platform authorization
 * for model execution changes again in the future. */
export const AI_SQUARED_BOLT_CONNECTOR_ID = 2342;

/** Extracts the assistant's reply text from an `executeModel` response,
 * regardless of whether the connector is Anthropic- or OpenAI-shaped. */
export function extractProviderText(data: unknown[] | undefined): string {
  const first = data?.[0] as Record<string, unknown> | undefined;
  if (!first) return "";

  // OpenAI-style: data[0].choices[0].message.content
  const choices = first.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  if (typeof message?.content === "string") return message.content;

  // Anthropic-style: data[0].content = [{ type: "text", text }]
  const content = first.content;
  if (Array.isArray(content)) {
    const block = content.find(
      (b) => (b as Record<string, unknown>)?.type === "text",
    ) as Record<string, unknown> | undefined;
    if (typeof block?.text === "string") return block.text;
  }

  return "";
}
