/**
 * Product/Plan identifiers used across the application
 * These match the plan_id values in the subscriptions table
 */
export const ProductKeys = Object.freeze({
  FREE_SUBSCRIPTION: "free",
  PLUS_SUBSCRIPTION: "plus",
  PRO_SUBSCRIPTION: "pro",
  MAX_SUBSCRIPTION: "max",
  TEAM_SUBSCRIPTION: "team",
});

/**
 * Credit limits per subscription plan (per billing period)
 * Credits reset at the start of each billing period and do not roll over
 */
export const CreditLimits = Object.freeze({
  FREE: 15,
  PLUS: 100,
  PRO: 250,
  MAX: 1000,
  TEAM: 10000,
});
