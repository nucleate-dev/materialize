export enum NavigationTabNames {
  DASHBOARD = "Dashboard",
  SETTINGS = "Settings",
}

export const ProductKeys = Object.freeze({
  FREE_SUBSCRIPTION: "free",
  TEAM_SUBSCRIPTION: "team",
  PRO_SUBSCRIPTION: "pro",
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
