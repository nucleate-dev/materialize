/**
 * Credit limits per subscription plan (per billing period)
 * Credits reset at the start of each billing period and do not roll over
 */
export const CreditLimits = Object.freeze({
  FREE: 15,
  PLUS: 30,
  PRO: 250,
  MAX: 1000,
  TEAM: 35,
});
