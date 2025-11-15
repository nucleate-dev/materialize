import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import type { Database } from "../../types/supabase.js";

export interface UsageTrackingResult {
  totalRemainingCredits: number;
}

/**
 * Records API usage in Supabase with FIFO credit consumption
 * @param creditsUsed - The number of credits consumed by this operation (default 1.0)
 */
export async function trackApiUsageBuildWorker(
  supabase: SupabaseClient<Database>,
  userId: string,
  prototypeId: string,
  log2: SystemLogger,
  creditsUsed: number = 1.0,
): Promise<UsageTrackingResult> {
  log2 = log2.child({
    function: "trackCodeUsage",
  });

  try {
    let creditsRemaining = creditsUsed;
    const consumedGrants: Array<{ grantId: string; creditsConsumed: number }> = [];

    // Find all available credit grants ordered by expiration (FIFO)
    const { data: grants, error: grantsError } = await supabase
      .from("credit_grants")
      .select("id, credits_remaining, expires_at")
      .eq("user_id", userId)
      .gt("credits_remaining", 0)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });

    if (grantsError) {
      log2.error(grantsError, "Error fetching credit grants:", {
        functionName: "trackApiUsageBuildWorker",
        userId,
      });
      throw new Error(grantsError.message);
    }

    if (!grants || grants.length === 0) {
      log2.error("No available credit grants found for user", {
        functionName: "trackApiUsageBuildWorker",
        userId,
      });
      throw new Error("No available credits");
    }

    // Consume credits from grants using FIFO order
    for (const grant of grants) {
      if (creditsRemaining <= 0) break;

      const creditsToConsume = Math.min(creditsRemaining, grant.credits_remaining);
      consumedGrants.push({
        grantId: grant.id,
        creditsConsumed: creditsToConsume,
      });

      creditsRemaining -= creditsToConsume;
    }

    // Check if we have enough credits
    if (creditsRemaining > 0) {
      const totalAvailable = grants.reduce((sum, g) => sum + g.credits_remaining, 0);
      log2.error("Insufficient credits available", {
        functionName: "trackApiUsageBuildWorker",
        userId,
        creditsRequested: creditsUsed,
        creditsAvailable: totalAvailable,
      });
      throw new Error(`Insufficient credits: need ${creditsUsed}, have ${totalAvailable}`);
    }

    // Insert api_usage records and update credit_grants
    for (const { grantId, creditsConsumed } of consumedGrants) {
      // Insert usage record linked to the grant
      const { error: insertError } = await supabase
        .from("api_usage")
        .insert({
          user_id: userId,
          prototype_id: prototypeId || null,
          credits_used: creditsConsumed,
          credit_grant_id: grantId,
        });

      if (insertError) {
        log2.error(insertError, "Error inserting api_usage record:", {
          functionName: "trackApiUsageBuildWorker",
          userId,
          grantId,
        });
        throw new Error(insertError.message);
      }

      // Update credits_remaining on the grant
      const grant = grants.find(g => g.id === grantId);
      if (!grant) continue;

      const newCreditsRemaining = grant.credits_remaining - creditsConsumed;

      const { error: updateError } = await supabase
        .from("credit_grants")
        .update({ credits_remaining: newCreditsRemaining })
        .eq("id", grantId);

      if (updateError) {
        log2.error(updateError, "Error updating credit_grant:", {
          functionName: "trackApiUsageBuildWorker",
          userId,
          grantId,
        });
        throw new Error(updateError.message);
      }
    }

    // Calculate total remaining credits
    const { data: allGrants } = await supabase
      .from("credit_grants")
      .select("credits_remaining")
      .eq("user_id", userId)
      .gt("credits_remaining", 0)
      .gt("expires_at", new Date().toISOString());

    const totalRemainingCredits = allGrants?.reduce(
      (sum, g) => sum + g.credits_remaining,
      0,
    ) || 0;

    return {
      totalRemainingCredits,
    };
  } catch (error) {
    log2.error(error, "Exception in trackApiUsageBuildWorker:", {
      functionName: "trackApiUsageBuildWorker",
      userId,
    });
    throw error;
  }
}
