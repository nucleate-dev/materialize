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
    const nowIso = new Date().toISOString();
    const { data: grants, error: grantsError } = await supabase
      .from("credit_grants")
      .select("id, credits_granted, expires_at")
      .eq("user_id", userId)
      .gt("expires_at", nowIso)
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

    const grantIds = grants.map(grant => grant.id);
    const usageMap = new Map<string, number>();

    if (grantIds.length > 0) {
      const { data: usageRows, error: usageError } = await supabase
        .from("api_usage")
        .select("credit_grant_id, credits_used")
        .eq("user_id", userId)
        .in("credit_grant_id", grantIds);

      if (usageError) {
        log2.error(usageError, "Error fetching api_usage for credits:", {
          functionName: "trackApiUsageBuildWorker",
          userId,
        });
        throw new Error(usageError.message);
      }

      usageRows?.forEach(row => {
        if (!row.credit_grant_id) return;
        const current = usageMap.get(row.credit_grant_id) || 0;
        usageMap.set(row.credit_grant_id, current + row.credits_used);
      });
    }

    const grantsWithRemaining = grants
      .map(grant => {
        const used = usageMap.get(grant.id) || 0;
        return {
          id: grant.id,
          credits_remaining: Math.max(0, grant.credits_granted - used),
        };
      })
      .filter(grant => grant.credits_remaining > 0);

    let creditsRemaining = creditsUsed;
    const consumedGrants: Array<{ grantId: string; creditsConsumed: number }> = [];

    for (const grant of grantsWithRemaining) {
      if (creditsRemaining <= 0) break;

      const creditsToConsume = Math.min(creditsRemaining, grant.credits_remaining);
      consumedGrants.push({
        grantId: grant.id,
        creditsConsumed: creditsToConsume,
      });

      creditsRemaining -= creditsToConsume;
    }

    if (creditsRemaining > 0) {
      const totalAvailable = grantsWithRemaining.reduce(
        (sum, g) => sum + g.credits_remaining,
        0,
      );
      log2.error("Insufficient credits available", {
        functionName: "trackApiUsageBuildWorker",
        userId,
        creditsRequested: creditsUsed,
        creditsAvailable: totalAvailable,
      });
      throw new Error(`Insufficient credits: need ${creditsUsed}, have ${totalAvailable}`);
    }

    // Insert api_usage records
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
    }

    const totalRemainingCredits = Math.max(
      0,
      grantsWithRemaining.reduce((sum, grant) => sum + grant.credits_remaining, 0) -
        creditsUsed,
    );

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
