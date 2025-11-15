import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import type { Database } from "../../types/supabase.js";

export interface UsageTrackingResult {
  updatedMessageCount: number;
  totalCreditsUsed: number;
}

/**
 * Records API usage in Supabase for Claude Code sessions
 *
 * SECURITY NOTE: This function does NOT handle Stripe integration directly.
 * Build workers have user terminal access, so Stripe credentials should NEVER
 * be available here. Instead, we notify the control plane to handle Stripe.
 *
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
  // 2. Get updated message count and total credits used for the current billing period
  // ------------------------------------------------------------------------------------------------
  const periodStart = currentPeriodStart.toISOString();
  const periodEnd = currentPeriodEnd.toISOString();

  const { count: newCount, error: countError } = await supabase
    .from("api_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  if (countError) {
    log2.consoleLogDevOnly(
      "error",
      "[trackCodeUsage] Error fetching updated message count:",
      { countError },
    );
  }

  const updatedMessageCount = newCount || 0;

  // Get total credits used in this period
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

  // ------------------------------------------------------------------------------------------------
  // 3. Notify control plane to handle Stripe meter events
  // ------------------------------------------------------------------------------------------------
  // TODO: Create endpoint in control plane to handle Stripe meter events for Pro users
  // The endpoint should:
  // - Accept: userId, prototypeId, orchestrationToken
  // - Validate the orchestration token
  // - Fetch user tier and stripe customer ID from database
  // - Send Stripe meter event if user is Pro
  //
  // Example call (to be implemented):
  // if (orchestrationToken) {
  //   try {
  //     const serverEndpoint = process.env.MATERIALIZE_SERVER_ENDPOINT;
  //     await axios.post(
  //       `${serverEndpoint}/orchestration/track-usage`,
  //       { user_id: userId, prototype_id: prototypeId },
  //       {
  //         headers: {
  //           'x-orchestration-token': orchestrationToken,
  //           'Content-Type': 'application/json',
  //         },
  //         timeout: 5000,
  //       }
  //     );
  //   } catch (error) {
  //     log2.error(error, '[trackCodeUsage] Failed to notify control plane for Stripe tracking');
  //   }
  // }

  return {
    updatedMessageCount,
    totalCreditsUsed,
  };
}
