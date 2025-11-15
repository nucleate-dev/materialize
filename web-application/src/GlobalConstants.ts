export enum NavigationTabNames {
  DASHBOARD = "Dashboard",
  SETTINGS = "Settings",
}

export const ProductKeys = Object.freeze({
  FREE_SUBSCRIPTION: "free",
  PLUS_SUBSCRIPTION: "plus",
  PRO_SUBSCRIPTION: "pro",
  MAX_SUBSCRIPTION: "max",
  TEAM_SUBSCRIPTION: "team",
});

export const MessageLimits = Object.freeze({
  FREE: 15,
  PLUS: 50,
  PRO: 100,
  MAX: 500,
  TEAM: 100,
});

export const SubscriptionStatuses = Object.freeze({
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
});

// FLAGS

export const APPLY_CODE_IMMEDIATELY = true;
export const SHOW_WHITEBOARDS = false;
export const WAITLIST_MODE = false;
export const DEBUG_MODE = false;
export const ENABLE_ASSET_UPLOAD = true;
