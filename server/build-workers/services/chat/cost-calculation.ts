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

/**
 * Name of the current cost function being used.
 * This should be stored in the database alongside the credits/cost to track
 * which pricing formula was used for historical records.
 */
export const CURRENT_COST_FUNCTION_NAME = "costFunctionV2";
