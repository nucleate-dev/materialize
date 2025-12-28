export const SUBSCRIPTION_ACCESS_QUERY_KEY = "subscription-access";

export const subscriptionAccessQueryKey = (teamId?: string | null) => [
  SUBSCRIPTION_ACCESS_QUERY_KEY,
  teamId ?? "anonymous",
];

export const CUSTOM_USER_ROW_QUERY_KEY = "custom-user-row";

export const customUserRowQueryKey = (userId?: string | null) => [
  CUSTOM_USER_ROW_QUERY_KEY,
  userId ?? "anonymous",
];
