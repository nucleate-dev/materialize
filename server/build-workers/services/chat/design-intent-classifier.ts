import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { VERCEL_MODEL_COSTS_USD } from "./cost-calculation.js";

/**
 * Classification result indicating whether user wants a full app or something specific/small
 */
export type DesignIntent = "full_app" | "specific_component";

/**
 * Configuration for design intent classification
 */
export interface DesignIntentClassifierConfig {
  /** The user's message to classify */
  userMessage: string;
  /** Abort controller for cancellation */
  abortController: AbortController;
  /** System logger instance */
  logger: SystemLogger;
  /** Optional prototype ID for logging context */
  prototypeId?: string;
}

/**
 * Result from design intent classification
 */
export interface DesignIntentClassifierResult {
  /** The classified intent */
  intent: DesignIntent;
  /** The cost in USD (undefined if not available) */
  costUsd: number | undefined;
}

/**
 * Prompt for the design intent classifier
 */
const CLASSIFIER_PROMPT = `You are a classifier that determines if a user wants to build a complete app or something specific and small.

Classify the user's request as either:
- "full_app": User wants to build a complete application with multiple features, screens, and functionality
- "specific_component": User wants something specific and small like a single component, paywall, screen, or small feature

Examples of "full_app":
- "Build me a fitness tracking app"
- "I want to create a social media app for pet owners"
- "Make an expense tracking application"
- "Create a recipe sharing platform"

Examples of "specific_component":
- "Recreate the blinkist paywall for me"
- "Make a login screen"
- "Build a todo list component"
- "Create a settings page"
- "Add a profile card"

Respond with ONLY one word: either "full_app" or "specific_component". No explanation, no punctuation, just the classification.`;

/**
 * Model to use for classification - fast and cheap
 */
const CLASSIFIER_MODEL = "gemini-2.5-flash";

/**
 * Estimates the cost in USD based on usage information from AI SDK.
 * Uses the centralized VERCEL_MODEL_COSTS_USD from cost-calculation.ts.
 */
function estimateCostUsd(
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } | undefined,
): number | undefined {
  if (!usage) return undefined;

  const promptTokens = usage.promptTokens ?? 0;
  const completionTokens = usage.completionTokens ?? 0;

  const pricing = VERCEL_MODEL_COSTS_USD[CLASSIFIER_MODEL];
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
 * Classifies user intent to determine if they want a full app or specific component.
 * Uses gemini-2.5-flash for fast, cheap classification.
 *
 * @param config - Configuration for design intent classification
 * @returns Promise resolving to intent classification and cost
 */
export async function classifyDesignIntent(
  config: DesignIntentClassifierConfig,
): Promise<DesignIntentClassifierResult> {
  const { userMessage, abortController, logger, prototypeId } = config;

  try {
    logger.consoleLogDevOnly(
      "info",
      "Classifying design intent with gemini-2.5-flash",
      {
        model: CLASSIFIER_MODEL,
        userMessageLength: userMessage.length,
        prototypeId,
      },
    );

    const modelInstance = google(CLASSIFIER_MODEL);

    // Execute classification using AI SDK's generateText
    const result = await generateText({
      model: modelInstance,
      system: CLASSIFIER_PROMPT,
      prompt: userMessage,
      abortSignal: abortController.signal,
    });

    const classificationText = result.text.trim().toLowerCase();

    // Parse the classification result
    let intent: DesignIntent;
    if (classificationText.includes("full_app")) {
      intent = "full_app";
    } else if (classificationText.includes("specific_component")) {
      intent = "specific_component";
    } else {
      // Default to specific_component if unclear (safer default - faster path)
      logger.warn(
        "Design intent classifier returned unexpected result, defaulting to specific_component",
        {
          classificationText,
          prototypeId,
        },
      );
      intent = "specific_component";
    }

    // Extract usage information
    const usageRaw = result.usage as unknown as {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    } | undefined;

    // Calculate cost based on usage
    const costUsd = estimateCostUsd(usageRaw);

    logger.consoleLogDevOnly(
      "info",
      "Design intent classification completed",
      {
        model: CLASSIFIER_MODEL,
        intent,
        costUsd,
        promptTokens: usageRaw?.promptTokens,
        completionTokens: usageRaw?.completionTokens,
        prototypeId,
      },
    );

    return { intent, costUsd };
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Design intent classification failed, defaulting to specific_component",
      {
        model: CLASSIFIER_MODEL,
        prototypeId,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );

    // On error, default to specific_component (safer, faster path)
    return { intent: "specific_component", costUsd: undefined };
  }
}
