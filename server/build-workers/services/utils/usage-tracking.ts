import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import type { Database } from "../../types/supabase.js";

export interface UsageTrackingResult {
  totalCreditsUsed: number;
}

/**
 * Records API usage in Supabase for Claude Code sessions with credit tracking
 * @param creditsUsed - The number of credits consumed by this operation (default 1.0)
 */
export async function trackApiUsageBuildWorker(
  supabase: SupabaseClient<Database>,
  userId: string,
  prototypeId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  log2: SystemLogger,
  creditsUsed: number = 1.0,
): Promise<UsageTrackingResult> {
  log2 = log2.child({
    function: "trackCodeUsage",
  });

  // ------------------------------------------------------------------------------------------------
  // 1. Track API usage in Supabase with credits
  // ------------------------------------------------------------------------------------------------
  await supabase.from("api_usage").insert({
    user_id: userId,
    prototype_id: prototypeId || null,
    credits_used: creditsUsed,
  });

  // ------------------------------------------------------------------------------------------------
  // 2. Get total credits used for the current billing period
  // ------------------------------------------------------------------------------------------------
  const periodStart = currentPeriodStart.toISOString();
  const periodEnd = currentPeriodEnd.toISOString();

  const { data: creditsData, error: creditsError } = await supabase
    .from("api_usage")
    .select("credits_used")
    .eq("user_id", userId)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  if (creditsError) {
    log2.consoleLogDevOnly(
      "error",
      "[trackCodeUsage] Error fetching credits used:",
      { creditsError },
    );
  }

  const totalCreditsUsed = creditsData?.reduce(
    (sum, row) => sum + row.credits_used,
    0,
  ) || 0;

  return {
    totalCreditsUsed,
  };
}
