import { useEffect, useState } from "react";
import { useUser } from "../auth/SupabaseAuthUtils";
import { SubscriptionStatuses } from "@/GlobalConstants";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/database.types";

type SubscriptionPlanType = Database["public"]["Enums"]["subscription_plan_type"];

/**
 * A custom hook that fetches and determines the current user's subscription plan.
 * Returns a single string representing the user's current active plan.
 *
 * @returns {Object} - An object containing:
 *  - `userPlan`: The current active subscription plan ("free", "team", "pro")
 *  - `loadingSubscriptionData`: Whether the subscription data is still being loaded.
 *
 * This hook performs the following steps:
 *  1. Retrieves the current user using the `useUser` hook.
 *  2. Fetches the user's active subscription information from the `subscriptions` table in the Supabase database, sorted by `updated_at` in descending order to get the latest active subscription.
 *  3. Determines the subscription plan based on the plan ID:
 *     - If no active subscription is found, returns "free".
 *     - If an active subscription exists, returns the plan_id from the database.
 *  4. Updates the state and sets `loadingSubscriptionData` to `false` once the data is loaded.
 *
 * Dependencies:
 *  - The hook will re-fetch the subscription information whenever `user.user` or `user.userIsLoading` state changes.
 *
 * @example
 * const { userPlan, loadingSubscriptionData } = useHasSubscriptionAccess();
 *
 * if (loadingSubscriptionData) {
 *   // Show a loading spinner
 * } else if (userPlan === "pro") {
 *   // User has a pro subscription
 * } else if (userPlan === "team") {
 *   // User has a team subscription
 * } else {
 *   // User is on free tier
 * }
 */
export function useHasSubscriptionAccess() {
  const user = useUser();
  const [userPlan, setUserPlan] = useState<SubscriptionPlanType>("free");
  const [loadingSubscriptionData, setLoadingSubscriptionData] = useState<boolean>(true);

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
        console.error("Error fetching subscription:", error);
        setUserPlan("free");
        setLoadingSubscriptionData(false);
        return;
      }
      
      console.log("fetched subscription");
      
      if (data === null || data.length === 0) {
        // No active subscription found, user is on free tier
        setUserPlan("free");
        setLoadingSubscriptionData(false);
        return;
      }

      const latestSubscription = data[0];
      const plan = latestSubscription.plan_id;

      // User has an active subscription, use the plan from database
      if (plan) {
        setUserPlan(plan);
      } else {
        // Fallback to free if no plan is found
        setUserPlan("free");
      }

      setLoadingSubscriptionData(false);
    }
    
    if (user.user && user.userIsLoading === false) {
      fetchSubscriptionInformation();
    }
  }, [user.user, user.userIsLoading]);

  return {
    userPlan,
    loadingSubscriptionData,
  };
}
