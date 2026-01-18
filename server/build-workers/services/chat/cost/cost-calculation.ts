/**
 * Cost calculation utilities for API usage tracking.
 *
 * These functions convert dollar costs to credits using different pricing formulas.
 * Each function is versioned to maintain backwards compatibility if pricing changes.
 */

/**
 * Version 1 of the cost calculation function.
 *
 * Converts USD cost to credits using the formula: credits = cost / 0.12
 * This means $0.12 = 1 credit, or ~8.33 credits per dollar.
 *
 * @param totalCostUsd - The total cost in USD from the API response
 * @returns The number of credits used (rounded to 2 decimal places), or undefined if cost is not available
 */
export function costFunctionV1(
  totalCostUsd: number | undefined,
): number | undefined {
  return totalCostUsd !== undefined
    ? Math.round((totalCostUsd / 0.12) * 100) / 100
    : undefined;
}

export function costFunctionV2(
  totalCostUsd: number | undefined,
): number | undefined {
  return totalCostUsd !== undefined
    ? Math.round((totalCostUsd / 0.19) * 100) / 100
    : undefined;
}

export function costFunctionV3(
  totalCostUsd: number | undefined,
): number | undefined {
  return totalCostUsd !== undefined
    ? Math.round((totalCostUsd / 0.15) * 100) / 100
    : undefined;
}

/**
 * Name of the current cost function being used.
 * This should be stored in the database alongside the credits/cost to track
 * which pricing formula was used for historical records.
 */
export const CURRENT_COST_FUNCTION_NAME = "costFunctionV3";

/**
 * Provider/model specific cost metadata for the Vercel AI SDK backed models.
 * This map is intentionally explicit to avoid surprises when new models appear.
 * If a model is missing here, cost reporting should be treated as unknown/unsupported.
 */
export const VERCEL_MODEL_COSTS_USD: Record<
  string,
  { inputUsdPer1M?: number; outputUsdPer1M?: number }
> = {
  "gpt-5.1-codex-mini": {
    inputUsdPer1M: 0.25,
    outputUsdPer1M: 2,
  },
  "gpt-5.1-codex": {
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 10,
  },
  "gemini-3-pro-preview": {
    inputUsdPer1M: 2,
    outputUsdPer1M: 12,
  },
  "gemini-2.5-flash": {
    inputUsdPer1M: 0.3,
    outputUsdPer1M: 2.5,
  },
  "gemini-3-pro-image-preview": {
    inputUsdPer1M: 2, // $2.00 per 1M input tokens (text/image)
    outputUsdPer1M: 12, // $12.00 per 1M output tokens (text/thinking)
  },
};

/**
 * Image generation pricing for Gemini models.
 * These are per-image costs, not token-based.
 */
export const GEMINI_IMAGE_COST_USD = {
  perImage1K2K: 0.134, // $0.134 per 1K/2K image
  perImage4K: 0.24, // $0.24 per 4K image
};
