import { useEffect, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { SubscriptionStatuses } from "@/GlobalConstants";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";

type SubscriptionPlanType =
  Database["public"]["Enums"]["subscription_plan_type"];

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
  const user = useUser();
  const logger = useProductLogger();
  const [userPlan, setUserPlan] = useState<SubscriptionPlanType>("free");
  const [loadingSubscriptionData, setLoadingSubscriptionData] =
    useState<boolean>(true);
  const [currentPeriodStart, setCurrentPeriodStart] = useState<Date>(
    new Date(),
  );
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<Date>(new Date());

  useEffect(() => {
    async function fetchSubscriptionInformation() {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.user?.id)
        .eq("status", SubscriptionStatuses.ACTIVE)
        .order("updated_at", {
          ascending: false,
        });

      if (error) {
        logger.debug("error", "Error fetching subscription:", {
          ...error,
        });
        setUserPlan("free");
        // Set free tier to current month period
        const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
        setCurrentPeriodStart(startOfMonth);
        setCurrentPeriodEnd(endOfMonth);
        setLoadingSubscriptionData(false);
        return;
      }

      if (data === null || data.length === 0) {
        // No active subscription found, user is on free tier
        setUserPlan("free");
        // Set free tier to current month period
        const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
        setCurrentPeriodStart(startOfMonth);
        setCurrentPeriodEnd(endOfMonth);
        setLoadingSubscriptionData(false);
        return;
      }

      const latestSubscription = data[0];
      const plan = latestSubscription.plan_id;

      // User has an active subscription, use the plan from database
      if (plan) {
        setUserPlan(plan);
        // Set subscription period from Stripe data (Unix timestamps in seconds)
        if (
          latestSubscription.current_period_start &&
          latestSubscription.current_period_end
        ) {
          setCurrentPeriodStart(
            new Date(latestSubscription.current_period_start * 1000),
          );
          setCurrentPeriodEnd(
            new Date(latestSubscription.current_period_end * 1000),
          );
        } else {
          // Fallback to current month if period data is missing
          const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
          setCurrentPeriodStart(startOfMonth);
          setCurrentPeriodEnd(endOfMonth);
        }
      } else {
        // Fallback to free if no plan is found
        setUserPlan("free");
        const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
        setCurrentPeriodStart(startOfMonth);
        setCurrentPeriodEnd(endOfMonth);
      }

      setLoadingSubscriptionData(false);
    }

    if (user.user && user.userIsLoading === false) {
      fetchSubscriptionInformation();
    }
  }, [user.user, user.userIsLoading, logger]);

  return {
    userPlan,
    loadingSubscriptionData,
    currentPeriodStart,
    currentPeriodEnd,
  };
}
