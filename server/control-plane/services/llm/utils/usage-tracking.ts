import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase.js";
import type { SystemLogger } from "../../../loggers/SystemLogger.js";

export interface UsageTrackingResult {
  totalRemainingCredits: number;
  success: boolean;
  error?: string;
}

export interface UsageMetadata {
  provider?: string;
  model?: string;
  requestType?: "completion" | "image_generation";
  inputTokens?: number;
  outputTokens?: number;
}

export async function trackLLMUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
  teamId: string,
  creditsUsed: number,
  logger: SystemLogger,
  metadata?: UsageMetadata,
): Promise<UsageTrackingResult> {
  const localLogger = logger.child({
    function: "trackLLMUsage",
    userId,
    teamId,
    creditsUsed,
    ...metadata,
  });

  try {
    // Call the consume_credits_teams RPC (same as build-workers)
    // Use empty string for prototype_id since LLM calls are not tied to a specific prototype
    const { data, error: rpcError } = await supabase.rpc("consume_credits_teams", {
      p_team_id: teamId,
      p_prototype_id: "", // Empty string for non-prototype calls
      p_credits: creditsUsed,
    });

    if (rpcError) {
      localLogger.error(rpcError, "consume_credits_teams RPC failed");

      // Fallback: insert directly into api_usage table
      const { error: insertError } = await supabase.from("api_usage").insert({
        user_id: userId,
        prototype_id: null,
        credits_used: creditsUsed,
        credit_grant_id: null,
        is_free_tier: false,
        team_id: teamId,
      });

      if (insertError) {
        localLogger.error(insertError, "Failed to insert into api_usage fallback");
      }

      return {
        totalRemainingCredits: 0,
        success: false,
        error: rpcError.message,
      };
    }

    const payload = data?.[0];
    return {
      totalRemainingCredits: payload?.total_remaining ?? 0,
      success: payload?.success ?? false,
    };
  } catch (error) {
    localLogger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Exception in trackLLMUsage",
    );
    return {
      totalRemainingCredits: 0,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface CreditCheckResult {
  hasCredits: boolean;
  remaining: number;
}

export async function checkCreditsAvailable(
  supabase: SupabaseClient<Database>,
  userId: string,
  teamId: string,
  logger: SystemLogger,
): Promise<CreditCheckResult> {
  const localLogger = logger.child({
    function: "checkCreditsAvailable",
    userId,
    teamId,
  });

  try {
    // Query credit_grant_balances for unexpired grants
    const nowIso = new Date().toISOString();
    const { data: balances, error } = await supabase
      .from("credit_grant_balances")
      .select("credits_remaining")
      .eq("team_id", teamId)
      .gt("expires_at", nowIso);

    if (error) {
      localLogger.error(error, "Error checking credit balances");
      return { hasCredits: false, remaining: 0 };
    }

    const totalRemaining =
      balances?.reduce((sum, b) => sum + (b.credits_remaining || 0), 0) ?? 0;

    return {
      hasCredits: totalRemaining > 0,
      remaining: totalRemaining,
    };
  } catch (error) {
    localLogger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Exception in checkCreditsAvailable",
    );
    return { hasCredits: false, remaining: 0 };
  }
}
