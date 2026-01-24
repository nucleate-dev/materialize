/**
 * Credit calculation utilities for OAuth token users.
 *
 * OAuth users pay Anthropic directly via their Claude Pro/Max subscription,
 * so we charge a minimal flat fee for platform usage rather than token-based pricing.
 */

import { SystemLogger } from "../../../loggers/SystemLogger.js";

/**
 * Credit tier definition based on prompt length.
 */
export interface OAuthCreditTier {
  maxLength: number;
  credits: number;
}

/**
 * Credit tiers based on prompt length for OAuth token users.
 * Most prompts (90%+) will be short and charged 0.1 credits.
 */
const OAUTH_CREDIT_TIERS: OAuthCreditTier[] = [
  { maxLength: 500, credits: 0.1 }, // Short prompts (most common)
  { maxLength: 2000, credits: 0.15 }, // Medium prompts
  { maxLength: 5000, credits: 0.2 }, // Long prompts
  { maxLength: Infinity, credits: 0.3 }, // Very long prompts
];

/**
 * Name of the OAuth cost function for tracking purposes.
 * Stored in the database alongside credits to identify the pricing formula used.
 */
export const OAUTH_COST_FUNCTION_NAME = "oauth_flat_fee_v1";

/**
 * Calculate credits for OAuth token users based on prompt length.
 *
 * @param promptLength - Length of the user's prompt in characters
 * @param logger - Optional logger for debugging
 * @returns Credits to charge (between 0.1 and 0.3)
 */
export function calculateOAuthCredits(
  promptLength: number,
  _logger?: SystemLogger,
): number {
  for (const tier of OAUTH_CREDIT_TIERS) {
    if (promptLength <= tier.maxLength) {
      // logger?.consoleLogDevOnly("info", "Calculated OAuth credits", {
      //   promptLength,
      //   credits: tier.credits,
      //   tier: tier.maxLength === Infinity ? "very_long" : `<=${tier.maxLength}`,
      // });
      return tier.credits;
    }
  }

  // Fallback (should never reach here due to Infinity tier)
  return 0.3;
}

/**
 * Extract prompt length from query data for credit calculation.
 * Handles both simple string prompts and content arrays with text/image blocks.
 *
 * @param data - Query data containing prompt or content
 * @returns Total length of text content in characters
 */
export function getPromptLengthFromQueryData(data: {
  prompt?: string;
  content?: Array<{ type: string; text?: string }>;
}): number {
  // If simple prompt string
  if (data.prompt) {
    return data.prompt.length;
  }

  // If content array, sum up text content lengths
  if (Array.isArray(data.content)) {
    return data.content
      .filter((block) => block.type === "text" && block.text)
      .reduce((sum, block) => sum + (block.text?.length ?? 0), 0);
  }

  return 0;
}
