import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { VERCEL_MODEL_COSTS_USD } from "./cost-calculation.js";

/**
 * Classification result indicating whether user wants to design/create UI vs standard chat
 */
export type DesignIntent = "design_mode" | "standard_mode";

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
const CLASSIFIER_PROMPT = `You are a classifier that determines if a user wants to DESIGN or BUILD user interface elements, or if they just have a general question or logic request.

Classify the user's request as either:
- "design_mode": User wants to create, modify, or design UI elements. This applies to FULL APPS, SPECIFIC SCREENS, OR SINGLE COMPONENTS (buttons, cards, inputs, etc).
- "standard_mode": User has a general question, debugging request, explanation request, or pure logic change with no visual component.

Examples of "design_mode" (REQUIRES DESIGN THOUGHT):
- "Build me a fitness tracking app" (Full App)
- "Create a login screen" (Screen)
- "Add a profile card" (Component)
- "Make a beautiful button" (Component)
- "Redesign this page to look modern" (Modification)
- "Change the colors to be dark mode" (Modification)

Examples of "standard_mode" (NO DESIGN THOUGHT REQUIRED):
- "Why is my build failing?"
- "Explain how useEffect works"
- "Fix the bug in the calculation function"
- "Add a console.log here"
- "Refactor this code to be cleaner" (Logic refactor)

Respond with ONLY one word: either "design_mode" or "standard_mode". No explanation, no punctuation, just the classification.`;

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
 * Classifies user intent to determine if they want strict design mode or standard mode.
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
    if (classificationText.includes("design_mode")) {
      intent = "design_mode";
    } else if (classificationText.includes("standard_mode")) {
      intent = "standard_mode";
    } else {
      // Default to standard_mode if unclear (safer default - less intrusive)
      logger.warn(
        "Design intent classifier returned unexpected result, defaulting to standard_mode",
        {
          classificationText,
          prototypeId,
        },
      );
      intent = "standard_mode";
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
      "Design intent classification failed, defaulting to standard_mode",
      {
        model: CLASSIFIER_MODEL,
        prototypeId,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );

    // On error, default to standard_mode (safer path)
    return { intent: "standard_mode", costUsd: undefined };
  }
}
