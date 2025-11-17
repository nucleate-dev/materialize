import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types/supabase";

export interface CreditGrantBalance {
  id: string;
  grant_type: string;
  grant_reason: string | null;
  credits_granted: number;
  credits_used: number;
  credits_remaining: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
  expires_at: string;
  created_at: string;
}

/**
 * Fetches all active credit grant balances for a user
 * Returns individual grant details sorted by expiration date (FIFO consumption order)
 */
export async function fetchUserCreditGrantBalances(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CreditGrantBalance[]> {
  const nowIso = new Date().toISOString();

  const { data: balances, error } = await supabase
    .from("credit_grant_balances")
    .select(
      "id, grant_type, grant_reason, credits_granted, credits_remaining, billing_period_start, billing_period_end, expires_at, created_at",
    )
    .eq("user_id", userId)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true }); // FIFO order

  if (error) {
    // Return empty array on error - caller should handle logging
    return [];
  }

  // Calculate credits_used for each grant and filter out invalid entries
  return (balances || [])
    .filter(
      (balance): balance is typeof balance & { id: string } =>
        balance.id !== null &&
        balance.grant_type !== null &&
        balance.credits_granted !== null &&
        balance.credits_remaining !== null &&
        balance.expires_at !== null &&
        balance.created_at !== null,
    )
    .map(
      (balance): CreditGrantBalance => ({
        id: balance.id,
        grant_type: balance.grant_type!,
        grant_reason: balance.grant_reason,
        credits_granted: balance.credits_granted!,
        credits_remaining: balance.credits_remaining!,
        billing_period_start: balance.billing_period_start,
        billing_period_end: balance.billing_period_end,
        expires_at: balance.expires_at!,
        created_at: balance.created_at!,
        credits_used: balance.credits_granted! - balance.credits_remaining!,
      }),
    );
}

/**
 * Formats a grant type for display
 */
export function formatGrantType(grantType: string): string {
  switch (grantType) {
    case "subscription":
      return "Subscription Credits";
    case "bonus":
      return "Bonus Credits";
    case "promotional":
      return "Promotional Credits";
    case "onboarding":
      return "Welcome Credits";
    default:
      return "Credits";
  }
}

/**
 * Formats billing period for display
 */
export function formatBillingPeriod(
  billingPeriodStart: string | null,
  billingPeriodEnd: string | null,
): string | null {
  if (!billingPeriodStart || !billingPeriodEnd) {
    return null;
  }

  const start = new Date(billingPeriodStart);
  const end = new Date(billingPeriodEnd);

  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

/**
 * Calculates the usage percentage for a credit grant
 */
export function calculateUsagePercentage(
  creditsUsed: number,
  creditsGranted: number,
): number {
  if (creditsGranted === 0) return 0;
  return Math.min((creditsUsed / creditsGranted) * 100, 100);
}
