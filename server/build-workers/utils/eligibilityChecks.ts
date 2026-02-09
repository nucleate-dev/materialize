import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../loggers/SystemLogger.js";
import type { Database } from "../types/supabase.js";
import { fetchUserPlan } from "./credit-checks.js";
import { team_allowlist_attach_personal_claude_subscriptions } from "../types/TeamLevelAllowlists.js";

export interface PersonalSubscriptionEligibilityParams {
  supabase: SupabaseClient<Database>;
  userId: string;
  teamId: string;
  logger: SystemLogger;
}

export async function isEligibleForPersonalClaudeSubscription({
  supabase,
  userId,
  teamId,
  logger,
}: PersonalSubscriptionEligibilityParams): Promise<{
  eligible: boolean;
  plan: string;
}> {
  const plan = await fetchUserPlan(supabase, userId, logger, teamId);
  if (plan === "plus" || plan === "team") {
    return { eligible: true, plan };
  } else {
    return {
      eligible:
        team_allowlist_attach_personal_claude_subscriptions.has(teamId),
      plan,
    };
  }
}
