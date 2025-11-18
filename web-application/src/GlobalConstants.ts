export enum NavigationTabNames {
  DASHBOARD = "Dashboard",
  SETTINGS = "Settings",
}

export const SubscriptionStatuses = Object.freeze({
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
});

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

// FLAGS

export const APPLY_CODE_IMMEDIATELY = true;
export const SHOW_WHITEBOARDS = false;
export const WAITLIST_MODE = false;
export const DEBUG_MODE = false;
export const ENABLE_ASSET_UPLOAD = true;
