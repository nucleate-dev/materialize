import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { GoogleProvider } from "./google-provider.js";
import type { LLMProvider } from "./types.js";
import type { SystemLogger } from "../../../loggers/SystemLogger.js";

export type ProviderName = "anthropic" | "openai" | "google";

const providerCache = new Map<string, LLMProvider>();

export function getProvider(name: ProviderName, logger: SystemLogger): LLMProvider {
  const cacheKey = name;

  const cached = providerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let provider: LLMProvider;

  switch (name) {
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY environment variable is not set");
      }
      provider = new AnthropicProvider({ apiKey, logger });
      break;
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY environment variable is not set");
      }
      provider = new OpenAIProvider({ apiKey, logger });
      break;
    }
    case "google": {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new Error("GOOGLE_AI_API_KEY environment variable is not set");
      }
      provider = new GoogleProvider({ apiKey, logger });
      break;
    }
    default: {
      const exhaustiveCheck: never = name;
      throw new Error(`Unknown provider: ${exhaustiveCheck}`);
    }
  }

  providerCache.set(cacheKey, provider);
  return provider;
}

export function isValidProvider(name: string): name is ProviderName {
  return ["anthropic", "openai", "google"].includes(name);
}

export function clearProviderCache(): void {
  providerCache.clear();
}
