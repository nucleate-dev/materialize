export type ChatProvider = "claude" | "vercel";

export const ALLOWED_MODELS: Record<ChatProvider, string[]> = {
  claude: [
    // Existing Claude models can be added here as needed
  ],
  vercel: [
    "gpt-5.1-codex-mini",
    "gpt-5.1-codex",
    "gemini-3-pro-preview",
    "gemini-2.5-flash",
  ],
};

export function isAllowedModel(
  provider: ChatProvider,
  model: string | undefined,
): boolean {
  if (!model) return false;
  const allowed = ALLOWED_MODELS[provider] ?? [];
  return allowed.includes(model);
}
