import { supabase } from "@/ClientConstants";
import { SubscriptionStatuses } from "@/GlobalConstants";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { subscriptionAccessQueryKey } from "@/lib/react-query/queryKeys";
import { Database } from "@/lib/types/supabase";
import { useQuery } from "@tanstack/react-query";

type SubscriptionPlanType =
  Database["public"]["Enums"]["subscription_plan_type"];
type SubscriptionAccessResult = {
  userPlan: SubscriptionPlanType;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

/**
 * Helper function to get the start and end of the current month
 * @returns Object with startOfMonth and endOfMonth Date objects
 */
function getCurrentMonthPeriod() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { startOfMonth, endOfMonth };
}

function getFreeTierAccess(): SubscriptionAccessResult {
  const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
  return {
    userPlan: "free",
    currentPeriodStart: startOfMonth,
    currentPeriodEnd: endOfMonth,
  };
}

async function fetchSubscriptionAccess(
  userId: string,
  logger: ReturnType<typeof useProductLogger>,
): Promise<SubscriptionAccessResult> {
  const freeTierAccess = getFreeTierAccess();
  try {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", SubscriptionStatuses.ACTIVE)
      .lte("current_period_start", nowInSeconds)
      .gte("current_period_end", nowInSeconds)
      .order("updated_at", {
        ascending: false,
      });

    if (error) {
      logger.debug("error", "Error fetching subscription:", {
        ...error,
      });
      return freeTierAccess;
    }

    if (!data || data.length === 0) {
      return freeTierAccess;
    }

    const latestSubscription = data[0];
    const plan = latestSubscription.plan_id as SubscriptionPlanType | null;

    if (!plan) {
      return freeTierAccess;
    }

    if (
      latestSubscription.current_period_start &&
      latestSubscription.current_period_end
    ) {
      const periodStart = latestSubscription.current_period_start * 1000;
      const periodEnd = latestSubscription.current_period_end * 1000;
      const now = Date.now();

      if (periodStart <= now && now <= periodEnd) {
        return {
          userPlan: plan,
          currentPeriodStart: new Date(periodStart),
          currentPeriodEnd: new Date(periodEnd),
        };
      }

      return freeTierAccess;
    }

    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    return {
      userPlan: plan,
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
    };
  } catch (error) {
    logger.debug("error", "Error fetching subscription:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return freeTierAccess;
  }
}

/**
 * A custom hook that fetches and determines the current user's subscription plan and billing period.
 * Returns subscription plan and current period dates.
 *
 * @returns {Object} - An object containing:
 *  - `userPlan`: The current active subscription plan ("free", "team", "pro")
 *  - `loadingSubscriptionData`: Whether the subscription data is still being loaded.
 *  - `currentPeriodStart`: Start of the current billing period (Date object)
 *  - `currentPeriodEnd`: End of the current billing period (Date object)
 *
 * This hook performs the following steps:
 *  1. Retrieves the current user using the `useUser` hook.
 *  2. Fetches the user's active subscription information from the `subscriptions` table in the Supabase database, sorted by `updated_at` in descending order to get the latest active subscription.
 *  3. Determines the subscription plan and billing period:
 *     - If no active subscription is found, returns "free" with current month as billing period.
 *     - If an active subscription exists, returns the plan_id and actual billing period from Stripe.
 *  4. For free users, the billing period is set to the current calendar month.
 *  5. Updates the state and sets `loadingSubscriptionData` to `false` once the data is loaded.
 *
 * Dependencies:
 *  - The hook will re-fetch the subscription information whenever `user.user` or `user.userIsLoading` state changes.
 *
 * @example
 * const { userPlan, loadingSubscriptionData, currentPeriodStart, currentPeriodEnd } = useSubscriptionAccess();
 *
 * if (loadingSubscriptionData) {
 *   // Show a loading spinner
 * } else if (userPlan === "pro") {
 *   // User has a pro subscription
 * } else if (userPlan === "team") {
 *   // User has a team subscription
 * } else {
 *   // User is on free tier (billing period = current month)
 * }
 */
export function useSubscriptionAccess() {
  const userState = useUser();
  const logger = useProductLogger();
  const userId = userState.user?.id;
  const queryEnabled = Boolean(userId) && userState.userIsLoading === false;

  const subscriptionQuery = useQuery({
    queryKey: subscriptionAccessQueryKey(userId),
    queryFn: () => fetchSubscriptionAccess(userId as string, logger),
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 5,
  });

  const subscriptionData = subscriptionQuery.data ?? getFreeTierAccess();
  const loadingSubscriptionData =
    userState.userIsLoading ||
    (queryEnabled ? subscriptionQuery.isPending : false);

  return {
    userPlan: subscriptionData.userPlan,
    loadingSubscriptionData,
    currentPeriodStart: subscriptionData.currentPeriodStart,
    currentPeriodEnd: subscriptionData.currentPeriodEnd,
    user: userState.user,
    userIsLoading: userState.userIsLoading,
  };
}
