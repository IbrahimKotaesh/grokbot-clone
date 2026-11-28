// Display names for Fino's included models (the server decides which a plan may use).
const NAMES: Record<string, string> = {
  // Fino's own names for the open-source models it hosts.
  "deepseek/deepseek-v4-pro-0813": "Badr 5.2",
  "deepseek/deepseek-v4-pro": "Badr 5.1",
  "deepseek/deepseek-v4.1-flash-1017": "Badr 4.8",
  "deepseek/deepseek-v4.1-flash": "Badr 4.8",
  "moonshotai/kimi-k2.7-code": "Badr 5.0",
  "z-ai/glm-5.3-flash": "Badr 4.9",
  "qwen/qwen3.8-flash": "Badr 4.5",
  "xiaomi/mimo-v2.6-flash": "Badr 4.2",
  "openai/gpt-5.4-mini": "GPT-5.4 mini",
  "x-ai/grok-4.3": "Grok 4.3",
  "anthropic/claude-sonnet-5.5": "Claude Sonnet 5.5",
  "openai/gpt-5.4": "GPT-5.4",
};
/** "deepseek/deepseek-v4.1-flash" → "Badr 4.8"; the default model when none is set. */
export function modelName(id: string) {
  if (!id) return NAMES["deepseek/deepseek-v4.1-flash-1017"];
  return NAMES[id] ?? id.split("/").pop() ?? id;
}
