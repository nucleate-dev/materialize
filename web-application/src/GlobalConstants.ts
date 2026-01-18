export enum NavigationTabNames {
  DASHBOARD = "Dashboard",
  SETTINGS = "Settings",
}

export const SubscriptionStatuses = Object.freeze({
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
});

// FLAGS

export const APPLY_CODE_IMMEDIATELY = true;
export const SHOW_WHITEBOARDS = false;
export const ENABLE_DESIGN_SYSTEM = false;
export const WAITLIST_MODE = false;
export const DEBUG_MODE = false;
export const ENABLE_ASSET_UPLOAD = true;

// MESSAGES

export const VIEWER_ROLE_RESTRICTION_MESSAGE =
  "You do not have edit privileges. Contact your team admin to upgrade your role.";
