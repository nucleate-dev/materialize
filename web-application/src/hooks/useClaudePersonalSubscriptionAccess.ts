import { supabase } from "@/ClientConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSubscriptionAccess } from "./useSubscriptionAccess";

interface ClaudePersonalSubscriptionAccessResult {
  isEligible: boolean;
  hasClaudeToken: boolean;
  loading: boolean;
}

/**
 * Determines whether the user can connect their personal Claude subscription and
 * whether a valid OAuth token already exists for them.
 *
 * The flow is available only for free or plus plans. When eligible, this hook
 * also checks if a row exists in the `user_claude_tokens` table for the user.
 */
export function useClaudePersonalSubscriptionAccess(): ClaudePersonalSubscriptionAccessResult {
  const { userPlan, user, loadingSubscriptionData } = useSubscriptionAccess();
  const logger = useProductLogger();

  const userId = user?.id ?? null;
  const isEligible = userPlan === "free" || userPlan === "plus";
  const tokenQueryEnabled = Boolean(userId && isEligible);

  const tokenQuery = useQuery({
    queryKey: ["claude-personal-token", userId],
    enabled: tokenQueryEnabled,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_claude_tokens")
        .select("id")
        .eq("user_id", userId as string)
        .eq("is_valid", true)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        logger.debug("warn", "Failed to fetch Claude token metadata", {
          error: error.message,
          code: error.code,
        });
      }

      return Boolean(data);
    },
  });

  const loadingTokenData = tokenQueryEnabled
    ? tokenQuery.isPending
    : false;

  const hasClaudeToken = tokenQueryEnabled
    ? Boolean(tokenQuery.data)
    : false;

  return useMemo(
    () => ({
      isEligible,
      hasClaudeToken,
      loading: loadingSubscriptionData || loadingTokenData,
    }),
    [hasClaudeToken, isEligible, loadingSubscriptionData, loadingTokenData],
  );
}
