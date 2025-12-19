import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { DESIGN_AGENT_PROMPT } from "../prompts/ClaudeCodePrompts.js";
import { VERCEL_MODEL_COSTS_USD } from "../cost/cost-calculation.js";

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
 * Estimates the cost in USD based on usage information from AI SDK.
 * Uses the centralized VERCEL_MODEL_COSTS_USD from cost-calculation.ts.
 */
function estimateCostUsd(
  provider: DesignAgentProvider,
  modelName: string,
  usage:
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      }
    | undefined,
): number | undefined {
  if (!usage) return undefined;

  const promptTokens = usage.promptTokens ?? 0;
  const completionTokens = usage.completionTokens ?? 0;

  const pricing = VERCEL_MODEL_COSTS_USD[modelName];
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
    logger.consoleLogDevOnly("info", "Executing design agent with AI SDK", {
      provider,
      model,
      userMessageLength: userMessage.length,
      prototypeId,
      workDir,
    });

    const modelInstance = resolveModel(provider, model);

    // Execute design agent using AI SDK's generateText
    const result = await generateText({
      model: modelInstance,
      prompt: DESIGN_AGENT_PROMPT + "\n\n" + userMessage,
      abortSignal: abortController.signal,
      providerOptions: {
        google: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingLevel: "low",
          },
        },
      },
    });

    const designSpec = result.text;
    logger.consoleLogDevOnly("info", "Design agent execution completed", {
      provider,
      model,
      designSpecLength: designSpec.length,
      designSpec,
      prototypeId,
    });

    // Extract usage information
    // AI SDK v5 has usage property - we cast to unknown then to our type for compatibility
    const usageRaw = result.usage as unknown as
      | {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        }
      | undefined;

    // Calculate cost based on usage
    const costUsd = estimateCostUsd(provider, model, usageRaw);

    logger.consoleLogDevOnly("info", "Design agent execution completed", {
      provider,
      model,
      designSpecLength: designSpec.length,
      costUsd,
      promptTokens: usageRaw?.promptTokens,
      completionTokens: usageRaw?.completionTokens,
      prototypeId,
    });

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
 * Persists the design specification to both CLAUDE.md and AGENTS.md in the working directory.
 *
 * @param workDir - The working directory of the project
 * @param designSpec - The design specification content to write
 * @param logger - System logger instance
 * @param prototypeId - Optional prototype ID for logging context
 */
export async function persistDesignSpecToFiles(
  workDir: string,
  designSpec: string,
  logger: SystemLogger,
  prototypeId?: string,
): Promise<void> {
  try {
    const claudeMdPath = path.join(workDir, "CLAUDE.md");
    const agentsMdPath = path.join(workDir, "AGENTS.md");

    await Promise.all([
      fs.writeFile(claudeMdPath, designSpec, "utf-8"),
      fs.writeFile(agentsMdPath, designSpec, "utf-8"),
    ]);

    logger.consoleLogDevOnly(
      "info",
      "Wrote design specification to CLAUDE.md and AGENTS.md",
      {
        prototypeId,
        specLength: designSpec.length,
        claudeMdPath,
        agentsMdPath,
      },
    );
  } catch (writeError) {
    logger.error(
      writeError instanceof Error ? writeError : new Error(String(writeError)),
      "Failed to write design specification to CLAUDE.md and AGENTS.md",
      { prototypeId },
    );
  }
}

/**
 * Default model configurations for design agent
 */
export const DEFAULT_DESIGN_AGENT_MODELS = {
  google: "gemini-3-pro-preview",
  openai: "gpt-5.1-codex-mini",
} as const;
