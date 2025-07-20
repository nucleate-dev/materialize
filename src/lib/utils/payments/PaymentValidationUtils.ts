import { useEffect, useState } from "react";
import { useUser } from "../auth/SupabaseAuthUtils";
import { ProductKeys, SubscriptionStatuses, supabase } from "@/GlobalConstants";

/**
 * A custom hook that fetches and determines whether the current user has access to a base or pro subscription.
 * It also tracks the loading state while fetching subscription data.
 *
 * @returns {Object} - An object containing:
 *  - `hasBaseSubscriptionAccess`: A boolean indicating whether the user has access to the base subscription.
 *  - `hasProSubscriptionAccess`: A boolean indicating whether the user has access to the pro subscription.
 *  - `loadingSubscriptionData`: A boolean indicating whether the subscription data is still being loaded.
 *
 * This hook performs the following steps:
 *  1. Retrieves the current user using the `useUser` hook.
 *  2. Fetches the user's subscription information from the `subscriptions` table in the Supabase database, sorted by `updated_at` in descending order to get the latest subscription.
 *  3. Determines the subscription plan based on the plan ID:
 *     - If no valid subscription is found, or the status is not `ACTIVE`, both `hasBaseSubscriptionAccess` and `hasProSubscriptionAccess` are set to `false`.
 *     - If the plan ID matches the base subscription, `hasBaseSubscriptionAccess` is set to `true`.
 *     - If the plan ID matches the pro subscription, `hasProSubscriptionAccess` is set to `true`.
 *  4. Updates the state (`hasBaseSubscriptionAccess`, `hasProSubscriptionAccess`) and sets `loadingSubscriptionData` to `false` once the data is loaded.
 *
 * Dependencies:
 *  - The hook will re-fetch the subscription information whenever `user.user` or `user.userIsLoading` state changes.
 *
 * @example
 * const {
 *   hasBaseSubscriptionAccess,
 *   hasProSubscriptionAccess,
 *   loadingSubscriptionData,
 * } = useHasSubscriptionAccess();
 *
 * if (loadingSubscriptionData) {
 *   // Show a loading spinner
 * } else if (hasProSubscriptionAccess) {
 *   // User has pro subscription access
 * }
 */
export function useHasSubscriptionAccess() {
  const user = useUser();
  const [hasBaseSubscriptionAccess, setHasBaseSubscriptionAccess] =
    useState<boolean>(false);
  const [hasProSubscriptionAccess, setHasProSubscriptionAccess] =
    useState<boolean>(false);
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
      if (
        data === null ||
        data.length === 0 ||
        data[0].status !== SubscriptionStatuses.ACTIVE
      ) {
        setHasBaseSubscriptionAccess(false);
        setHasProSubscriptionAccess(false);
        setLoadingSubscriptionData(false);
        return;
      }
      const plan = data[0].plan_id;
      switch (plan) {
        case ProductKeys.BASE_SUBSCRIPTION:
          setHasBaseSubscriptionAccess(true);
          break;
        case ProductKeys.PRO_SUBSCRIPTION:
          setHasProSubscriptionAccess(true);
          break;
        default:
          setHasBaseSubscriptionAccess(false);
          setHasProSubscriptionAccess(false);
          break;
      }
      setLoadingSubscriptionData(false);
    }
    if (user.user && user.userIsLoading === false) {
      fetchSubscriptionInformation();
    }
  }, [user.user, user.userIsLoading]);

  return {
    hasBaseSubscriptionAccess,
    hasProSubscriptionAccess,
    loadingSubscriptionData,
  };
}
