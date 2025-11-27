export const SUBSCRIPTION_ACCESS_QUERY_KEY = "subscription-access";

export const subscriptionAccessQueryKey = (userId?: string | null) => [
  SUBSCRIPTION_ACCESS_QUERY_KEY,
  userId ?? "anonymous",
];
