"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CreditCard,
  Crown,
  Loader2,
  MessageSquare,
  AlertCircle,
  Settings,
  Zap,
} from "lucide-react";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useRouter } from "next/navigation";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { handleRedirectToStripeCustomerPortal } from "@/lib/utils/payments/SubscriptionManagementUtils";
import { formatGrantType } from "@/lib/utils/credits/CreditUtils";
import { cn } from "@/lib/classNames";
import { SectionCard, SectionHeader } from "./SettingsHelpers";

export function CreditsAndSubscriptionsTab() {
  const router = useRouter();
  const logger = useProductLogger();
  const { userPlan, currentPeriodEnd } = useSubscriptionAccess();
  const { activeTeam, currentUserMembership } = useActiveTeam();
  const creditUsage = useCreditUsage();

  // Check if current user is owner or admin
  const isOwnerOrAdmin =
    currentUserMembership?.role === "owner" ||
    currentUserMembership?.role === "admin";

  const [isProcessingUpgrade, setIsProcessingUpgrade] =
    useState<boolean>(false);
  const [isManagingBilling, setIsManagingBilling] = useState<boolean>(false);

  const currentSubscription = (userPlan as string) || "free";

  const handleUpgradeClick = async (targetPlan: string) => {
    try {
      setIsProcessingUpgrade(true);
      logger.log({
        event: "client_upgrade_checkout_clicked",
        properties: {
          source: "settings_dialog",
          plan: targetPlan,
        },
      });
      if (activeTeam?.id) {
        await handleCheckout(targetPlan, router, activeTeam.id);
      }
      setTimeout(() => setIsProcessingUpgrade(false), 2000);
    } catch (error) {
      logger.debug("error", "Error starting checkout:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setIsProcessingUpgrade(false);
    }
  };

  const handleManageBillingClick = async () => {
    if (!activeTeam?.id) {
      alert("We couldn't find your active team. Please refresh and try again.");
      return;
    }
    try {
      setIsManagingBilling(true);
      await handleRedirectToStripeCustomerPortal(activeTeam.id, router);
    } catch (error) {
      logger.debug("error", "Error opening billing portal:", {
        error: error instanceof Error ? error.message : String(error),
      });
      alert("Unable to open billing portal right now. Please try again later.");
    } finally {
      setIsManagingBilling(false);
    }
  };

  const getUpgradeOption = () => {
    switch (currentSubscription) {
      case "free":
        return { tier: "plus", label: "Upgrade to Plus" };
      case "plus":
      case "pro":
      default:
        return null;
    }
  };

  const upgradeOption = getUpgradeOption();

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            Credits and Subscriptions
          </h1>
          <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
            Manage your subscription and credit usage.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="space-y-8 lg:col-span-2">
            {/* Subscription Management */}
            <SectionCard>
              <SectionHeader
                title="Subscription"
                description="Manage your plan and billing details"
                icon={CreditCard}
              />
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900 dark:text-white capitalize">
                      {currentSubscription} Plan
                    </p>
                    <p className="text-sm text-gray-600 dark:text-[#8A8F98]">
                      {currentSubscription === "free"
                        ? "Free forever"
                        : `${creditUsage.creditLimit} credits / month`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    Active
                  </div>
                </div>

                {currentSubscription !== "free" && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="p-3 rounded bg-gray-50 dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                      <p className="text-gray-600 dark:text-[#8A8F98] mb-1 text-xs">
                        Current Period Ends
                      </p>
                      <p className="text-gray-900 dark:text-white font-medium">
                        {currentPeriodEnd?.toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="p-3 rounded bg-gray-50 dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                      <p className="text-gray-600 dark:text-[#8A8F98] mb-1 text-xs">
                        Billing Cycle
                      </p>
                      <p className="text-gray-900 dark:text-white font-medium">
                        Monthly
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {upgradeOption && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex-1">
                            <Button
                              onClick={() => handleUpgradeClick(upgradeOption.tier)}
                              className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                              disabled={isProcessingUpgrade || !isOwnerOrAdmin}
                            >
                              {isProcessingUpgrade ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <Crown className="w-4 h-4 mr-2" />
                              )}
                              {upgradeOption.label}
                            </Button>
                          </div>
                        </TooltipTrigger>
                        {!isOwnerOrAdmin && (
                          <TooltipContent>
                            <p>Only owners and admins can purchase</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {currentSubscription !== "free" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex-1">
                            <Button
                              onClick={handleManageBillingClick}
                              variant="outline"
                              disabled={isManagingBilling || !isOwnerOrAdmin}
                              className="w-full border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-900 dark:text-white"
                            >
                              {isManagingBilling ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Settings className="w-4 h-4 mr-2" />
                              )}
                              Manage Billing
                            </Button>
                          </div>
                        </TooltipTrigger>
                        {!isOwnerOrAdmin && (
                          <TooltipContent>
                            <p>Only owners and admins can manage billing</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* Usage Stats */}
            <SectionCard>
              <SectionHeader
                title="Usage Statistics"
                description="Track your AI generation usage"
                icon={MessageSquare}
              />
              <div className="p-6 space-y-6">
                {/* Main Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-900 dark:text-white">
                      Credits Used
                    </span>
                    <span className="text-gray-600 dark:text-[#8A8F98]">
                      {creditUsage.creditsUsed.toFixed(1)} /{" "}
                      {creditUsage.totalAvailableCredits.toFixed(1)}
                    </span>
                  </div>
                  <Progress
                    value={creditUsage.usagePercentage}
                    className="h-2 bg-black/10 dark:bg-white/10"
                  />
                </div>

                {/* Overage Alert */}
                {creditUsage.overageCredits > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-200 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium mb-0.5">
                        Overage Limit Reached
                      </p>
                      <p className="text-orange-600/90 dark:text-orange-200/70 text-xs">
                        You have {creditUsage.overageCredits.toFixed(1)} overage
                        credits that will be deducted from your next grant.
                      </p>
                    </div>
                  </div>
                )}

                {/* Grant Details (For Paid Users) */}
                {userPlan !== "free" &&
                  !creditUsage.loading &&
                  creditUsage.creditGrants.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-black/5 dark:border-white/5">
                      <p className="text-xs font-medium text-gray-600 dark:text-[#8A8F98] uppercase tracking-wider">
                        Active Grants
                      </p>
                      {creditUsage.creditGrants.map((grant) => (
                        <div
                          key={grant.id}
                          className="text-sm flex justify-between items-center"
                        >
                          <div>
                            <div className="text-gray-900 dark:text-white">
                              {formatGrantType(grant.grant_type)}
                            </div>
                            <div className="text-gray-600 dark:text-[#8A8F98] text-xs">
                              Expires{" "}
                              {new Date(grant.expires_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-gray-900 dark:text-white">
                              {grant.credits_remaining.toFixed(1)} remaining
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </SectionCard>
          </div>

          {/* Right Column: Top Ups (Only Paid) */}
          {userPlan !== "free" && (
            <div className="space-y-8">
              <div className="sticky top-8">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
                  Top Up Credits
                </h3>
                <div className="space-y-4">
                  {[
                    { credits: 100, price: 25, id: "credit_pack_100" },
                    {
                      credits: 500,
                      price: 110,
                      id: "credit_pack_500",
                      bestValue: true,
                    },
                    { credits: 1000, price: 200, id: "credit_pack_1000" },
                  ].map((pack) => (
                    <div
                      key={pack.id}
                      className={cn(
                        "relative p-5 rounded-xl border transition-all duration-200 group",
                        pack.bestValue
                          ? "bg-white dark:bg-[#1A1B1E] border-purple-500/50 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)]"
                          : "bg-white dark:bg-[#141517] border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 shadow-sm dark:shadow-none",
                      )}
                    >
                      {pack.bestValue && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-purple-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full border border-purple-400">
                          Best Value
                        </div>
                      )}
                      <div className="flex justify-between items-baseline mb-2">
                        <h4 className="text-gray-900 dark:text-white font-medium">
                          {pack.credits} Credits
                        </h4>
                        <span className="text-xl font-semibold text-gray-900 dark:text-white">
                          ${pack.price}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-[#8A8F98] mb-4">
                        <span>Never expires</span>
                        <span>
                          ${(pack.price / pack.credits).toFixed(2)} / credit
                        </span>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Button
                                onClick={() => handleUpgradeClick(pack.id)}
                                className={cn(
                                  "w-full h-8 text-xs",
                                  pack.bestValue
                                    ? "bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                                    : "bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10",
                                )}
                                disabled={isProcessingUpgrade || !isOwnerOrAdmin}
                              >
                                {isProcessingUpgrade ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  "Purchase"
                                )}
                              </Button>
                            </div>
                          </TooltipTrigger>
                          {!isOwnerOrAdmin && (
                            <TooltipContent>
                              <p>Only owners and admins can purchase</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
