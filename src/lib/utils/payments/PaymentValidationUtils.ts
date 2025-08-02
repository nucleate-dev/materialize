import { useEffect, useState } from "react";
import { useUser } from "../auth/SupabaseAuthUtils";
import { ProductKeys, SubscriptionStatuses } from "@/GlobalConstants";
import { supabase } from "@/ClientConstants";

/**
 * A custom hook that fetches and determines the current user's subscription status.
 * It provides flags for base or pro access, past-due subscriptions and free tier users.
 *
 * @returns {Object} - An object containing:
 *  - `hasTeamSubscriptionAccess`: Whether the user has an active team/base subscription.
 *  - `hasActiveProSubscription`: Whether the user has an active pro subscription.
 *  - `hasPastDueSubscription`: Whether the user's latest subscription is in a past_due state.
 *  - `isOnFreeTier`: Whether the user has no subscription and is on the free tier.
 *  - `loadingSubscriptionData`: Whether the subscription data is still being loaded.
 *
 * This hook performs the following steps:
 *  1. Retrieves the current user using the `useUser` hook.
 *  2. Fetches the user's subscription information from the `subscriptions` table in the Supabase database, sorted by `updated_at` in descending order to get the latest subscription.
 *  3. Determines the subscription plan based on the plan ID:
 *     - If no valid subscription is found, the user is considered on the free tier.
 *     - If the status is `PAST_DUE`, `hasPastDueSubscription` is set to `true`.
 *     - If the status is `ACTIVE`, the plan is inspected to determine whether
 *       `hasTeamSubscriptionAccess` or `hasActiveProSubscription` should be set to `true`.
 *  4. Updates the state and sets `loadingSubscriptionData` to `false` once the data is loaded.
 *
 * Dependencies:
 *  - The hook will re-fetch the subscription information whenever `user.user` or `user.userIsLoading` state changes.
 *
 * @example
 * const {
 *   hasTeamSubscriptionAccess,
 *   hasActiveProSubscription,
 *   hasPastDueSubscription,
 *   isOnFreeTier,
 *   loadingSubscriptionData,
 * } = useHasSubscriptionAccess();
 *
 * if (loadingSubscriptionData) {
 *   // Show a loading spinner
 * } else if (hasActiveProSubscription) {
 *   // User has an active pro subscription
 * }
 */
export function useHasSubscriptionAccess() {
  const user = useUser();
  const [hasTeamSubscriptionAccess, setHasTeamSubscriptionAccess] =
    useState<boolean>(false);
  const [hasActiveProSubscription, setHasActiveProSubscription] =
    useState<boolean>(false);
  const [hasPastDueSubscription, setHasPastDueSubscription] =
    useState<boolean>(false);
  const [isOnFreeTier, setIsOnFreeTier] = useState<boolean>(false);
  const [loadingSubscriptionData, setLoadingSubscriptionData] =
    useState<boolean>(true);

  useEffect(() => {
    async function fetchSubscriptionInformation() {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.user?.id)
        .order("updated_at", {
          ascending: false,
        });
      if (error) {
        setLoadingSubscriptionData(false);
        return;
      }
      console.log("fetched subscription");
      if (data === null || data.length === 0) {
        setIsOnFreeTier(true);
        setLoadingSubscriptionData(false);
        return;
      }

      const latestSubscription = data[0];
      const status = latestSubscription.status;
      const plan = latestSubscription.plan_id;

      // reset all flags
      setHasTeamSubscriptionAccess(false);
      setHasActiveProSubscription(false);
      setHasPastDueSubscription(false);
      setIsOnFreeTier(false);

      switch (status) {
        case SubscriptionStatuses.PAST_DUE:
          setHasPastDueSubscription(true);
          break;
        case SubscriptionStatuses.ACTIVE:
          switch (plan) {
            case ProductKeys.TEAM_SUBSCRIPTION:
              setHasTeamSubscriptionAccess(true);
              break;
            case ProductKeys.PRO_SUBSCRIPTION:
              setHasActiveProSubscription(true);
              break;
            default:
              setIsOnFreeTier(true);
              break;
          }
          break;
        default:
          setIsOnFreeTier(true);
          break;
      }

      setLoadingSubscriptionData(false);
    }
    if (user.user && user.userIsLoading === false) {
      fetchSubscriptionInformation();
    }
  }, [user.user, user.userIsLoading]);

  return {
    hasTeamSubscriptionAccess,
    hasActiveProSubscription,
    hasPastDueSubscription,
    isOnFreeTier,
    loadingSubscriptionData,
  };
}
