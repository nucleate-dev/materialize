import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/ClientConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { CreditLimits } from "@/lib/types/serverAPITypes";
import {
  CreditGrantBalance,
  fetchOverageCredits,
  fetchUserCreditGrantBalances,
} from "@/lib/utils/credits/CreditUtils";

interface CreditUsageState {
  creditsUsed: number;
  creditLimit: number;
  totalAvailableCredits: number; // Total credits available from all unexpired grants (for paid users)
  creditsRemaining: number;
  usagePercentage: number;
  creditGrants: CreditGrantBalance[];
  overageCredits: number;
  loading: boolean;
  hasReachedLimit: boolean;
}

interface CreditUsageHook extends CreditUsageState {
  refetch: () => Promise<void>;
  updateRemainingBalance: (remaining: number) => void;
  updateCreditsUsed: (used: number) => void;
  updateCreditState: (updates: Partial<CreditUsageState>) => void;
}

/**
 * Hook to manage and track user credit usage
 * Handles both free tier (monthly usage) and paid users (credit grants)
 *
 * @returns Credit usage state and actions for refetching or updating
 */
export function useCreditUsage(): CreditUsageHook {
  const logger = useProductLogger();
  const { user, userIsLoading, userPlan, loadingSubscriptionData } = useSubscriptionAccess();

  const [state, setState] = useState<CreditUsageState>({
    creditsUsed: 0,
    creditLimit: 0,
    totalAvailableCredits: 0,
    creditsRemaining: 0,
    usagePercentage: 0,
    creditGrants: [],
    overageCredits: 0,
    loading: true,
    hasReachedLimit: false,
  });

  /**
   * Calculate credit limit based on user plan
   */
  const getCreditLimit = useCallback((plan: string): number => {
    switch (plan) {
      case "free":
        return CreditLimits.FREE;
      case "plus":
        return CreditLimits.PLUS;
      case "pro":
        return CreditLimits.PRO;
      case "max":
        return CreditLimits.MAX;
      case "team":
        return CreditLimits.TEAM;
      default:
        return CreditLimits.FREE;
    }
  }, []);

  /**
   * Fetch credit usage data from backend
   */
  const fetchCreditUsage = useCallback(async () => {
    if (!user?.id || loadingSubscriptionData) return;

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const creditLimit = getCreditLimit(userPlan as string);

      // FREE TIER: Query api_usage table for current month
      if (userPlan === "free") {
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

        const { data: freeUsageRows, error: freeUsageError } = await supabase
          .from("api_usage")
          .select("credits_used")
          .eq("user_id", user.id)
          .eq("is_free_tier", true)
          .gte("created_at", startOfMonth.toISOString())
          .lte("created_at", endOfMonth.toISOString());

        if (freeUsageError) {
          logger.debug("error", "Error fetching free tier credits:", {
            error: freeUsageError.message,
          });
          setState({
            creditsUsed: 0,
            creditLimit,
            totalAvailableCredits: creditLimit,
            creditsRemaining: creditLimit,
            usagePercentage: 0,
            creditGrants: [],
            overageCredits: 0,
            loading: false,
            hasReachedLimit: false,
          });
          return;
        }

        const totalUsed =
          freeUsageRows?.reduce(
            (sum, row) => sum + (row.credits_used || 0),
            0,
          ) ?? 0;
        const remaining = Math.max(creditLimit - totalUsed, 0);
        const usagePercentage =
          creditLimit > 0 ? (totalUsed / creditLimit) * 100 : 0;

        setState({
          creditsUsed: totalUsed,
          creditLimit,
          totalAvailableCredits: creditLimit,
          creditsRemaining: remaining,
          usagePercentage,
          creditGrants: [],
          overageCredits: 0,
          loading: false,
          hasReachedLimit: remaining <= 0,
        });
        return;
      }

      // PAID USERS: Fetch credit grants and overage
      const [grants, overage] = await Promise.all([
        fetchUserCreditGrantBalances(supabase, user.id),
        fetchOverageCredits(supabase, user.id),
      ]);

      const totalUsed = grants.reduce(
        (sum, grant) => sum + grant.credits_used,
        0,
      );
      const totalRemaining = grants.reduce(
        (sum, grant) => sum + grant.credits_remaining,
        0,
      );

      // Calculate total available credits from all unexpired grants
      const totalAvailable = totalUsed + totalRemaining;

      // Usage percentage should be based on total available credits, not plan limit
      const usagePercentage =
        totalAvailable > 0 ? (totalUsed / totalAvailable) * 100 : 0;

      setState({
        creditsUsed: totalUsed,
        creditLimit, // Keep the plan limit (e.g., 200 for Plus monthly)
        totalAvailableCredits: totalAvailable, // Total from all unexpired grants
        creditsRemaining: totalRemaining,
        usagePercentage,
        creditGrants: grants,
        overageCredits: overage,
        loading: false,
        hasReachedLimit: totalRemaining <= 0,
      });
    } catch (error) {
      logger.debug("error", "Error fetching credit usage:", {
        error: error instanceof Error ? error.message : String(error),
      });

      const creditLimit = getCreditLimit(userPlan as string);
      setState({
        creditsUsed: 0,
        creditLimit,
        totalAvailableCredits: creditLimit,
        creditsRemaining: creditLimit,
        usagePercentage: 0,
        creditGrants: [],
        overageCredits: 0,
        loading: false,
        hasReachedLimit: false,
      });
    }
  }, [user?.id, userPlan, loadingSubscriptionData, logger, getCreditLimit]);

  /**
   * Directly update the remaining balance
   * Useful for WebSocket/SSE updates from backend
   */
  const updateRemainingBalance = useCallback((remaining: number) => {
    setState((prev) => ({
      ...prev,
      creditsRemaining: remaining,
      creditsUsed: prev.creditLimit - remaining,
      usagePercentage:
        prev.creditLimit > 0
          ? ((prev.creditLimit - remaining) / prev.creditLimit) * 100
          : 0,
      hasReachedLimit: remaining <= 0,
    }));
  }, []);

  /**
   * Directly update the credits used
   * Useful for real-time updates after actions
   */
  const updateCreditsUsed = useCallback((used: number) => {
    setState((prev) => {
      const remaining = Math.max(prev.creditLimit - used, 0);
      const usagePercentage =
        prev.creditLimit > 0 ? (used / prev.creditLimit) * 100 : 0;

      return {
        ...prev,
        creditsUsed: used,
        creditsRemaining: remaining,
        usagePercentage,
        hasReachedLimit: remaining <= 0,
      };
    });
  }, []);

  /**
   * Flexible partial state update
   * Allows updating multiple fields at once
   */
  const updateCreditState = useCallback(
    (updates: Partial<CreditUsageState>) => {
      setState((prev) => {
        const newState = { ...prev, ...updates };

        // Recalculate derived fields if needed
        if (updates.creditsUsed !== undefined || updates.creditLimit !== undefined) {
          const used = updates.creditsUsed ?? newState.creditsUsed;
          const limit = updates.creditLimit ?? newState.creditLimit;

          newState.creditsRemaining = Math.max(limit - used, 0);
          newState.usagePercentage = limit > 0 ? (used / limit) * 100 : 0;
          newState.hasReachedLimit = newState.creditsRemaining <= 0;
        }

        return newState;
      });
    },
    [],
  );

  // Fetch credit usage on mount and when dependencies change
  useEffect(() => {
    fetchCreditUsage();
  }, [fetchCreditUsage]);

  // Listen for custom credit update events
  useEffect(() => {
    const handleCreditUpdate = () => {
      fetchCreditUsage();
    };

    window.addEventListener("credits-updated", handleCreditUpdate);

    return () => {
      window.removeEventListener("credits-updated", handleCreditUpdate);
    };
  }, [fetchCreditUsage]);

  return {
    ...state,
    refetch: fetchCreditUsage,
    updateRemainingBalance,
    updateCreditsUsed,
    updateCreditState,
  };
}
