import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { DESIGN_AGENT_PROMPT } from "./ClaudeCodePrompts.js";

/**
 * Supported model providers for the design agent
 * Note: Anthropic requires @ai-sdk/anthropic package to be installed
 */
export type DesignAgentProvider = "google" | "openai";

/**
 * Configuration for design agent execution
 */
export interface DesignAgentConfig {
  /** The model provider to use (anthropic, google, openai) */
  provider: DesignAgentProvider;
  /** The specific model name (e.g., "claude-sonnet-4-5", "gemini-2.0-flash-exp", "gpt-4o") */
  model: string;
  /** The user's message/request */
  userMessage: string;
  /** Working directory for context */
  workDir: string;
  /** Abort controller for cancellation */
  abortController: AbortController;
  /** System logger instance */
  logger: SystemLogger;
  /** Optional prototype ID for logging context */
  prototypeId?: string;
}

/**
 * Result from design agent execution
 */
export interface DesignAgentResult {
  /** The generated design specification (null if failed) */
  designSpec: string | null;
  /** The cost in USD (undefined if not available) */
  costUsd: number | undefined;
}

/**
 * Resolves the language model instance based on provider and model name
 */
function resolveModel(
  provider: DesignAgentProvider,
  modelName: string,
): LanguageModel {
  switch (provider) {
    case "google":
      return google(modelName);
    case "openai":
      return openai(modelName);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Estimates the cost in USD based on usage information from AI SDK
 * This is a simplified estimation - actual costs may vary
 */
function estimateCostUsd(
  provider: DesignAgentProvider,
  modelName: string,
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } | undefined,
): number | undefined {
  if (!usage) return undefined;

  const promptTokens = usage.promptTokens ?? 0;
  const completionTokens = usage.completionTokens ?? 0;

  // Rough cost estimates per 1M tokens (these should be updated based on actual pricing)
  const costMap: Record<
    string,
    { inputUsdPer1M?: number; outputUsdPer1M?: number }
  > = {
    // Google models
    "gemini-2.0-flash-exp": { inputUsdPer1M: 0.0, outputUsdPer1M: 0.0 }, // Free during preview
    "gemini-1.5-pro": { inputUsdPer1M: 1.25, outputUsdPer1M: 5.0 },
    "gemini-1.5-flash": { inputUsdPer1M: 0.075, outputUsdPer1M: 0.3 },

    // OpenAI models
    "gpt-4o": { inputUsdPer1M: 2.5, outputUsdPer1M: 10.0 },
    "gpt-4o-mini": { inputUsdPer1M: 0.15, outputUsdPer1M: 0.6 },
  };

  const pricing = costMap[modelName];
  if (!pricing) return undefined;

  const inputCost = pricing.inputUsdPer1M
    ? (promptTokens * pricing.inputUsdPer1M) / 1_000_000
    : 0;
  const outputCost = pricing.outputUsdPer1M
    ? (completionTokens * pricing.outputUsdPer1M) / 1_000_000
    : 0;

  const total = inputCost + outputCost;
  return total > 0 ? total : undefined;
}

/**
 * Executes the design agent to generate a comprehensive design specification.
 * Uses Vercel AI SDK's generateText() for maximum flexibility across providers.
 *
 * @param config - Configuration for design agent execution
 * @returns Promise resolving to design specification and cost
 */
export async function executeDesignAgent(
  config: DesignAgentConfig,
): Promise<DesignAgentResult> {
  const {
    provider,
    model,
    userMessage,
    workDir,
    abortController,
    logger,
    prototypeId,
  } = config;

  try {
    logger.consoleLogDevOnly(
      "info",
      "Executing design agent with AI SDK",
      {
        provider,
        model,
        userMessageLength: userMessage.length,
        prototypeId,
        workDir,
      },
    );

    const modelInstance = resolveModel(provider, model);

    // Execute design agent using AI SDK's generateText
    const result = await generateText({
      model: modelInstance,
      system: DESIGN_AGENT_PROMPT,
      prompt: userMessage,
      abortSignal: abortController.signal,
    });

    const designSpec = result.text;

    // Extract usage information
    // AI SDK v5 has usage property - we cast to unknown then to our type for compatibility
    const usageRaw = result.usage as unknown as {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    } | undefined;

    // Calculate cost based on usage
    const costUsd = estimateCostUsd(provider, model, usageRaw);

    logger.consoleLogDevOnly(
      "info",
      "Design agent execution completed",
      {
        provider,
        model,
        designSpecLength: designSpec.length,
        costUsd,
        promptTokens: usageRaw?.promptTokens,
        completionTokens: usageRaw?.completionTokens,
        prototypeId,
      },
    );

    if (!designSpec || designSpec.trim().length === 0) {
      logger.warn("Design agent returned empty specification", {
        provider,
        model,
        prototypeId,
      });
      return { designSpec: null, costUsd };
    }

    return { designSpec, costUsd };
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Design agent execution failed",
      {
        provider,
        model,
        prototypeId,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );

    return { designSpec: null, costUsd: undefined };
  }
}

/**
 * Default model configurations for design agent
 */
export const DEFAULT_DESIGN_AGENT_MODELS = {
  google: "gemini-2.0-flash-exp",
  openai: "gpt-4o-mini",
} as const;
