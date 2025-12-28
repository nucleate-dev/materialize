"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  X,
  User,
  Settings,
  Calendar,
  CreditCard,
  Crown,
  Loader2,
  MessageSquare,
  AlertCircle,
  Check,
  Trash2,
  ExternalLink,
  Key,
  Zap,
} from "lucide-react";
import { useCustomUserRow } from "@/hooks/useCustomUserRow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/useUser";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useRouter } from "next/navigation";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { usePostHog } from "posthog-js/react";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { handleRedirectToStripeCustomerPortal } from "@/lib/utils/payments/SubscriptionManagementUtils";
import { formatGrantType } from "@/lib/utils/credits/CreditUtils";
import { cn } from "@/lib/classNames";
import { supabase } from "@/ClientConstants";

type SettingsTab = "profile" | "credits" | "claude";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SectionCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "bg-white dark:bg-[#141517] border border-black/5 dark:border-white/5 rounded-xl overflow-hidden shadow-sm dark:shadow-none",
      className,
    )}
  >
    {children}
  </div>
);

const SectionHeader = ({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <div className="px-6 py-5 border-b border-black/5 dark:border-white/5 flex items-start justify-between">
    <div className="space-y-1">
      <h3 className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-500 dark:text-[#8A8F98]" />}
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-600 dark:text-[#8A8F98]">
          {description}
        </p>
      )}
    </div>
  </div>
);

function ProfileTab() {
  const { userRow } = useCustomUserRow();
  const { user } = useUser();

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const memberSince = user?.created_at ? new Date(user.created_at) : new Date();

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            Profile
          </h1>
          <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
            Manage your profile information.
          </p>
        </div>

        {/* Profile Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-16 w-16 border border-border">
                {userRow?.avatar_url && (
                  <AvatarImage
                    src={userRow.avatar_url}
                    alt={userRow.name || "User"}
                  />
                )}
                <AvatarFallback className="text-lg font-medium">
                  {getInitials(userRow?.name || "U")}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1 flex-1">
                <h2 className="text-xl font-medium">
                  {userRow?.name || "User"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {userRow?.email}
                </p>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex items-center text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5 mr-2" />
              Member since{" "}
              {memberSince?.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClaudeConnectionTab() {
  const logger = useProductLogger();
  const { userPlan } = useSubscriptionAccess();
  const { activeTeam } = useActiveTeam();
  const { user } = useUser();
  const router = useRouter();

  const [isProcessingUpgrade, setIsProcessingUpgrade] =
    useState<boolean>(false);
  const [hasClaudeToken, setHasClaudeToken] = useState<boolean>(false);
  const [claudeTokenInput, setClaudeTokenInput] = useState<string>("");
  const [isSavingToken, setIsSavingToken] = useState<boolean>(false);
  const [isDeletingToken, setIsDeletingToken] = useState<boolean>(false);
  const [tokenSaveSuccess, setTokenSaveSuccess] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const currentSubscription = (userPlan as string) || "free";

  const handleUpgradeClick = async (targetPlan: string) => {
    try {
      setIsProcessingUpgrade(true);
      logger.log({
        event: "client_upgrade_checkout_clicked",
        properties: {
          source: "settings_dialog_claude",
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

  // Check if user has a Claude token
  const checkClaudeToken = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from("user_claude_tokens")
        .select("oauth_token, is_valid")
        .eq("user_id", user.id)
        .eq("is_valid", true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasClaudeToken(true);
      } else {
        setHasClaudeToken(false);
      }
    } catch (error) {
      logger.debug("error", "Error checking Claude token:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setHasClaudeToken(false);
    }
  };

  // Save Claude token
  const handleSaveClaudeToken = async () => {
    if (!user?.id || !claudeTokenInput.trim()) {
      setTokenError("Please enter a token");
      return;
    }

    setIsSavingToken(true);
    setTokenError(null);
    setTokenSaveSuccess(false);

    try {
      const { error } = await supabase.from("user_claude_tokens").upsert(
        {
          user_id: user.id,
          oauth_token: claudeTokenInput.trim(),
          token_type: "setup-token",
          is_valid: true,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) throw error;

      setTokenSaveSuccess(true);
      setClaudeTokenInput("");
      await checkClaudeToken();

      setTimeout(() => setTokenSaveSuccess(false), 3000);
    } catch (error) {
      logger.debug("error", "Error saving claude token", {
        error,
      });
      setTokenError(
        error instanceof Error ? error.message : "Failed to save token",
      );
    } finally {
      setIsSavingToken(false);
    }
  };

  // Delete Claude token
  const handleDeleteClaudeToken = async () => {
    if (!user?.id) return;

    setIsDeletingToken(true);
    setTokenError(null);

    try {
      const { error } = await supabase
        .from("user_claude_tokens")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      setHasClaudeToken(false);
    } catch (error) {
      logger.debug("error", "Error deleting claude token: ", {
        error,
      });
      setTokenError(
        error instanceof Error ? error.message : "Failed to delete token",
      );
    } finally {
      setIsDeletingToken(false);
    }
  };

  // Check for token on mount and when user changes
  useEffect(() => {
    void checkClaudeToken();
  }, [user?.id]);

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            Claude Connection
          </h1>
          <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
            Connect your Claude Pro or Max subscription for AI chat.
          </p>
        </div>

        {/* Claude Subscription Connection */}
        <SectionCard>
          <SectionHeader
            title="Claude Subscription"
            description="Connect your Claude Pro or Max subscription for AI chat"
            icon={Key}
          />
          <div className="p-6 space-y-6">
            {currentSubscription === "free" ? (
              /* Free Plan - Upgrade Required */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <Crown className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-purple-700 dark:text-purple-300 mb-1">
                      Upgrade Required
                    </p>
                    <p className="text-sm text-purple-600 dark:text-purple-400">
                      Connect your Claude Pro or Max subscription to use
                      unlimited AI chat. This feature is available for Plus
                      subscribers and above.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleUpgradeClick("plus")}
                  className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                  disabled={isProcessingUpgrade}
                >
                  {isProcessingUpgrade ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Crown className="w-4 h-4 mr-2" />
                  )}
                  Upgrade to Plus
                </Button>
              </div>
            ) : hasClaudeToken ? (
              /* Token Connected State */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-green-700 dark:text-green-300 mb-1">
                      Claude Subscription Connected
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Your AI chat will use your Claude Pro/Max subscription
                      instead of API credits.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleDeleteClaudeToken}
                    variant="outline"
                    disabled={isDeletingToken}
                    className="border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    {isDeletingToken ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              /* No Token State - Paid User */
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">
                      Connect Your Claude Subscription
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                      Use your Claude Pro or Max subscription for unlimited AI
                      chat (~10x cheaper than API credits).
                    </p>
                    <ol className="text-sm text-blue-600 dark:text-blue-400 space-y-1 ml-4 list-decimal">
                      <li>
                        Run{" "}
                        <code className="px-1.5 py-0.5 bg-blue-500/20 rounded font-mono text-xs">
                          claude setup-token
                        </code>{" "}
                        in your terminal
                      </li>
                      <li>Copy the token it gives you</li>
                      <li>Paste it below and click Save</li>
                    </ol>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Claude Token
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={claudeTokenInput}
                        onChange={(e) => setClaudeTokenInput(e.target.value)}
                        placeholder="Paste your token here"
                        className="flex-1 px-3 py-2 bg-white dark:bg-[#1A1B1E] border border-black/10 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                      />
                      <Button
                        onClick={handleSaveClaudeToken}
                        disabled={isSavingToken || !claudeTokenInput.trim()}
                        className="bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                      >
                        {isSavingToken ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Save Token"
                        )}
                      </Button>
                    </div>
                  </div>

                  {tokenSaveSuccess && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <Check className="w-4 h-4" />
                      Token saved successfully!
                    </div>
                  )}

                  {tokenError && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      {tokenError}
                    </div>
                  )}

                  <a
                    href="https://docs.anthropic.com/en/docs/agents/claude-cli"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Learn more about Claude Code CLI
                  </a>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function CreditsAndSubscriptionsTab() {
  const router = useRouter();
  const logger = useProductLogger();
  const { userPlan, currentPeriodEnd } = useSubscriptionAccess();
  const { activeTeam } = useActiveTeam();
  const creditUsage = useCreditUsage();

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
                    <Button
                      onClick={() => handleUpgradeClick(upgradeOption.tier)}
                      className="flex-1 bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                      disabled={isProcessingUpgrade}
                    >
                      {isProcessingUpgrade ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Crown className="w-4 h-4 mr-2" />
                      )}
                      {upgradeOption.label}
                    </Button>
                  )}

                  {currentSubscription !== "free" && (
                    <Button
                      onClick={handleManageBillingClick}
                      variant="outline"
                      disabled={isManagingBilling}
                      className="flex-1 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-900 dark:text-white"
                    >
                      {isManagingBilling ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Settings className="w-4 h-4 mr-2" />
                      )}
                      Manage Billing
                    </Button>
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
                        "relative p-5 rounded-xl border transition-all duration-200 group cursor-pointer",
                        pack.bestValue
                          ? "bg-white dark:bg-[#1A1B1E] border-purple-500/50 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)]"
                          : "bg-white dark:bg-[#141517] border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 shadow-sm dark:shadow-none",
                      )}
                      onClick={() => handleUpgradeClick(pack.id)}
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
                      <Button
                        className={cn(
                          "w-full h-8 text-xs",
                          pack.bestValue
                            ? "bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90"
                            : "bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10",
                        )}
                        disabled={isProcessingUpgrade}
                      >
                        {isProcessingUpgrade ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          "Purchase"
                        )}
                      </Button>
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

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { userRow } = useCustomUserRow();
  const posthog = usePostHog();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const isClaudeConnectionEnabled =
    posthog?.isFeatureEnabled("claude-code-cli-with-personal-token") ?? false;

  const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: "profile", label: userRow?.name || "Profile", icon: User },
    { id: "credits", label: "Credits and subscriptions", icon: CreditCard },
    ...(isClaudeConnectionEnabled
      ? [{ id: "claude" as const, label: "Claude connection", icon: Key }]
      : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60" />
        <DialogContent
          hideCloseButton
          className="fixed max-w-none w-[90vw] h-[90vh] p-0 border border-black/10 dark:border-white/10 rounded-lg flex bg-background"
        >
          {/* Dialog Sidebar */}
          <div className="w-64 border-r border-border bg-muted/30 flex flex-col">
            {/* Tabs */}
            <div className="flex-1 p-2">
              <SidebarMenu>
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <SidebarMenuItem key={tab.id}>
                      <SidebarMenuButton
                        isActive={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <Icon />
                        <span>{tab.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-auto relative">
            {/* Close button */}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-6 top-6 z-10"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>

            {/* Content */}
            <div className="h-full">
              {activeTab === "profile" && <ProfileTab />}
              {activeTab === "credits" && <CreditsAndSubscriptionsTab />}
              {activeTab === "claude" && <ClaudeConnectionTab />}
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
