// Provider + model defaults. Mirrors threadmap/config.py so the UI
// starts in the same place as the CLI.

export type Provider = "gemini" | "anthropic" | "openai";

export const PROVIDERS: { id: Provider; label: string; keyHint: string }[] = [
  { id: "gemini", label: "Gemini", keyHint: "aistudio.google.com/app/apikey" },
  { id: "anthropic", label: "Anthropic", keyHint: "console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI", keyHint: "platform.openai.com/api-keys" },
];

export const DEFAULT_MODELS: Record<Provider, { root: string; sub: string }> = {
  gemini: { root: "gemini/gemini-2.5-pro", sub: "gemini/gemini-2.5-flash" },
  anthropic: { root: "anthropic/claude-opus-4-5", sub: "anthropic/claude-haiku-4-5" },
  openai: { root: "openai/gpt-5", sub: "openai/gpt-5-mini" },
};
