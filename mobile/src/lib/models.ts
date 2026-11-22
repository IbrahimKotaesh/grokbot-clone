// Display names for Fino's included models (the server decides which a plan may use).
const NAMES: Record<string, string> = {
  "deepseek/deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "qwen/qwen3.7-flash": "Qwen 3.7 Flash",
  "z-ai/glm-5.3-flash": "GLM 5.3 Flash",
  "qwen/qwen3.7-plus": "Qwen 3.7 Plus",
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
  "openai/gpt-5.4-mini": "GPT-5.4 mini",
  "x-ai/grok-4.3": "Grok 4.3",
  "anthropic/claude-sonnet-5.5": "Claude Sonnet 5.5",
  "openai/gpt-5.4": "GPT-5.4",
};
/** "deepseek/deepseek-v4.1-flash" → "DeepSeek V4.1 Flash"; the default model when none is set. */
export function modelName(id: string) {
  if (!id) return NAMES["deepseek/deepseek-v4.1-flash"];
  return NAMES[id] ?? id.split("/").pop() ?? id;
}
