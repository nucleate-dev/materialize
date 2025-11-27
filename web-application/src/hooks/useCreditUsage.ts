"use client";

import { supabase } from "@/ClientConstants";
import { useUser } from "@/hooks/useUser";
import { CreditLimits } from "@/lib/types/serverAPITypes";
import {
  CreditGrantBalance,
  fetchOverageCredits,
  fetchUserCreditGrantBalances,
} from "@/lib/utils/credits/CreditUtils";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CreditUsageResult {
  creditsUsed: number;
  creditLimit: number;
  usagePercentage: number;
  creditGrants: CreditGrantBalance[];
  overageCredits: number;
  hasReachedLimit: boolean;
  error: Error | null;
}

/**
 * Non-hook function to fetch credit usage data
 * Can be used in non-React contexts or for one-time fetches
 */
export async function fetchCreditUsage(
  userId: string,
  userPlan: string,
): Promise<CreditUsageResult> {
  try {
    let creditsUsed = 0;
    let creditGrants: CreditGrantBalance[] = [];
    let overageCredits = 0;

    if (userPlan === "free") {
      // Free tier: calculate usage for current month
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
        .eq("user_id", userId)
        .eq("is_free_tier", true)
        .gte("created_at", startOfMonth.toISOString())
        .lte("created_at", endOfMonth.toISOString());

      if (freeUsageError) {
        throw freeUsageError;
      }

      creditsUsed =
        freeUsageRows?.reduce((sum, row) => sum + (row.credits_used || 0), 0) ??
        0;
    } else {
      // Paid tier: fetch credit grants and overage
      const [grants, overage] = await Promise.all([
        fetchUserCreditGrantBalances(supabase, userId),
        fetchOverageCredits(supabase, userId),
      ]);

      creditGrants = grants;
      overageCredits = overage;
      creditsUsed = grants.reduce((sum, grant) => sum + grant.credits_used, 0);
    }

    // Calculate credit limit based on plan
    const creditLimit = getCreditLimitForPlan(userPlan);

    // Calculate usage percentage
    const usagePercentage =
      creditLimit > 0 ? (creditsUsed / creditLimit) * 100 : 0;

    // Check if limit is reached
    const hasReachedLimit = creditsUsed >= creditLimit;

    return {
      creditsUsed,
      creditLimit,
      usagePercentage,
      creditGrants,
      overageCredits,
      hasReachedLimit,
      error: null,
    };
  } catch (error) {
    return {
      creditsUsed: 0,
      creditLimit: getCreditLimitForPlan(userPlan),
      usagePercentage: 0,
      creditGrants: [],
      overageCredits: 0,
      hasReachedLimit: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Helper function to get credit limit for a given plan
 */
function getCreditLimitForPlan(userPlan: string): number {
  switch (userPlan as string) {
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
}

/**
 * Hook to fetch and track credit usage with realtime updates
 * Automatically subscribes to relevant tables and refetches on changes
 */
export function useCreditUsage(userPlan: string) {
  const { user } = useUser();
  const userId = user?.id;

  const [data, setData] = useState<CreditUsageResult>({
    creditsUsed: 0,
    creditLimit: getCreditLimitForPlan(userPlan),
    usagePercentage: 0,
    creditGrants: [],
    overageCredits: 0,
    hasReachedLimit: false,
    error: null,
  });
  const [loading, setLoading] = useState(true);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Fetch credit usage data
  const fetchData = useCallback(async () => {
    if (!userId) return;

    try {
      const result = await fetchCreditUsage(userId, userPlan);
      setData(result);
      setLoading(false);
    } catch (error) {
      setData((prev) => ({
        ...prev,
        error: error instanceof Error ? error : new Error(String(error)),
      }));
      setLoading(false);
    }
  }, [userId, userPlan]);

  // Debounced refetch
  const debouncedRefetch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchData();
    }, 500);
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId, userPlan, fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupSubscription = async () => {
      try {
        if (userPlan === "free") {
          // Subscribe to api_usage table for free tier
          channel = supabase
            .channel(`credit_usage_${userId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "api_usage",
                filter: `user_id=eq.${userId}`,
              },
              () => {
                debouncedRefetch();
              },
            )
            .subscribe((status) => {
              if (status === "SUBSCRIBED") {
                retryCountRef.current = 0;
              } else if (
                status === "CHANNEL_ERROR" &&
                retryCountRef.current < maxRetries
              ) {
                retryCountRef.current++;
                setTimeout(() => {
                  setupSubscription();
                }, Math.pow(2, retryCountRef.current) * 1000);
              }
            });
        } else {
          // Subscribe to credit_grants table for paid tier
          channel = supabase
            .channel(`credit_usage_${userId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "credit_grants",
                filter: `user_id=eq.${userId}`,
              },
              () => {
                debouncedRefetch();
              },
            )
            .subscribe((status) => {
              if (status === "SUBSCRIBED") {
                retryCountRef.current = 0;
              } else if (
                status === "CHANNEL_ERROR" &&
                retryCountRef.current < maxRetries
              ) {
                retryCountRef.current++;
                setTimeout(() => {
                  setupSubscription();
                }, Math.pow(2, retryCountRef.current) * 1000);
              }
            });
        }
      } catch {
        // Silent retry on error
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          setTimeout(() => {
            setupSubscription();
          }, Math.pow(2, retryCountRef.current) * 1000);
        }
      }
    };

    setupSubscription();

    // Cleanup
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [userId, userPlan, debouncedRefetch]);

  return {
    ...data,
    loading,
  };
}
