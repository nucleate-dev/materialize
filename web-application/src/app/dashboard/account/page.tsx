"use client";

import { supabase } from "@/ClientConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CreditLimits } from "@/lib/types/serverAPITypes";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { handleRedirectToStripeCustomerPortal } from "@/lib/utils/payments/SubscriptionManagementUtils";
import {
  fetchUserCreditGrantBalances,
  fetchOverageCredits,
  formatGrantType,
  formatBillingPeriod,
  calculateUsagePercentage,
  CreditGrantBalance,
} from "@/lib/utils/credits/CreditUtils";
import {
  AlertCircle,
  Calendar,
  CreditCard,
  Crown,
  Mail,
  MessageSquare,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function AccountSettings() {
  const logger = useProductLogger();
  const user = useUser();
  const router = useRouter();
  const {
    userPlan,
    currentPeriodStart,
    currentPeriodEnd,
    loadingSubscriptionData,
  } = useSubscriptionAccess();

  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [memberSince, setMemberSince] = useState<Date>(new Date());
  const [creditsUsed, setCreditsUsed] = useState<number>(0);
  const [creditGrants, setCreditGrants] = useState<CreditGrantBalance[]>([]);
  const [overageCredits, setOverageCredits] = useState<number>(0);
  const [loadingUsageCount, setLoadingUsageCount] = useState<boolean>(true);
  const [isProcessingUpgrade, setIsProcessingUpgrade] =
    useState<boolean>(false);

  useEffect(() => {
    // Set user info from Supabase Auth user
    if (user.user) {
      setEmail(user.user.email || "");
      setName(
        user.user.user_metadata?.full_name ||
          user.user.user_metadata?.first_name +
            " " +
            user.user.user_metadata?.last_name ||
          "",
      );
      setMemberSince(new Date(user.user.created_at));
    }
  }, [user.user]);

  // Fetch credits used from all unexpired grants
  useEffect(() => {
    async function fetchCreditsUsed() {
      if (!user.user?.id || loadingSubscriptionData) return;

      setLoadingUsageCount(true);
      try {
        if (userPlan === "free") {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          );
          const { data: freeUsageRows, error: freeUsageError } = await supabase
            .from("api_usage")
            .select("credits_used")
            .eq("user_id", user.user.id)
            .eq("is_free_tier", true)
            .gte("created_at", startOfMonth.toISOString())
            .lte("created_at", endOfMonth.toISOString());

          if (freeUsageError) {
            logger.debug("error", "Error fetching credits:", {
              error: freeUsageError.message,
            });
            setCreditsUsed(0);
            return;
          }

          const totalUsed =
            freeUsageRows?.reduce(
              (sum, row) => sum + (row.credits_used || 0),
              0,
            ) ?? 0;

          setCreditsUsed(totalUsed);
          return;
        }

        // Fetch individual credit grant balances and overage credits
        const [grants, overage] = await Promise.all([
          fetchUserCreditGrantBalances(supabase, user.user.id),
          fetchOverageCredits(supabase, user.user.id),
        ]);

        setCreditGrants(grants);
        setOverageCredits(overage);

        // Calculate total credits used across all grants
        const totalUsed = grants.reduce(
          (sum, grant) => sum + grant.credits_used,
          0,
        );

        setCreditsUsed(totalUsed);
      } catch (error) {
        logger.debug("error", "Error fetching credits:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        setCreditsUsed(0);
      } finally {
        setLoadingUsageCount(false);
      }
    }

    fetchCreditsUsed();
  }, [user.user?.id, loadingSubscriptionData, logger, userPlan]);

  // Calculate credit limit based on subscription plan
  const getCreditLimit = () => {
    switch (userPlan as string) {
      case "free":
        return CreditLimits.FREE;
      case "plus":
        return CreditLimits.PLUS;
      case "pro":
        return CreditLimits.PRO;
      case "max":
        return CreditLimits.MAX;
      case "team":
        return CreditLimits.TEAM;
      default:
        return CreditLimits.FREE;
    }
  };

  const creditLimit = getCreditLimit();
  const currentSubscription = (userPlan as string) || "free";

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan.toLowerCase()) {
      case "max":
        return "default"; // Highest tier gets primary badge
      case "pro":
        return "default";
      case "plus":
        return "default";
      case "team":
        return "secondary";
      default:
        return "outline"; // Free tier
    }
  };

  const getUsagePercentage = () => {
    return creditLimit > 0 ? (creditsUsed / creditLimit) * 100 : 0;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleUpgradeClick = async (targetPlan: string) => {
    try {
      setIsProcessingUpgrade(true);
      await handleCheckout(targetPlan, router);
      // Keep processing state for 2 seconds to account for Stripe redirect delay
      setTimeout(() => {
        setIsProcessingUpgrade(false);
      }, 2000);
    } catch (error) {
      logger.debug("error", "Error starting checkout:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      setIsProcessingUpgrade(false);
    }
  };

  // Get the next tier upgrade option
  const getUpgradeOption = () => {
    switch (currentSubscription) {
      case "free":
        return {
          tier: "plus",
          label: "Upgrade to Plus",
        };
      case "plus":
      case "pro":
      default:
        return null;
    }
  };

  const upgradeOption = getUpgradeOption();

  return (
    <div className="container mx-auto py-6 space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Account Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your account information and subscription
          </p>
        </div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Account</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Profile Header Card */}
      <Card className="border-0 shadow-md">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {getInitials(name || "U")}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-semibold">{name || "User"}</h2>
                <Badge
                  variant={getPlanBadgeVariant(currentSubscription)}
                  className="capitalize"
                >
                  {currentSubscription === "pro" && (
                    <Crown className="w-3 h-3 mr-1" />
                  )}
                  {currentSubscription}
                </Badge>
              </div>
              <p className="text-muted-foreground flex items-center">
                <Mail className="w-4 h-4 mr-2" />
                {email}
              </p>
              <p className="text-sm text-muted-foreground flex items-center">
                <Calendar className="w-4 h-4 mr-2" />
                Member since{" "}
                {memberSince?.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CreditCard className="w-5 h-5" />
            <span>Subscription Management</span>
          </CardTitle>
          <CardDescription>
            Manage your subscription, billing, and payment methods
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <p className="font-medium capitalize">
                {currentSubscription} Plan
              </p>
              <p className="text-sm text-muted-foreground">
                {currentSubscription === "free"
                  ? "Free forever with basic features"
                  : `${creditLimit} credits per billing cycle`}
              </p>
            </div>
            <Badge
              variant={getPlanBadgeVariant(currentSubscription)}
              className="capitalize"
            >
              {currentSubscription === "pro" && (
                <Crown className="w-3 h-3 mr-1" />
              )}
              Active
            </Badge>
          </div>

          {currentSubscription !== "free" && (
            <>
              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Billing Information</h4>
                <div className="grid gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Current period ends:
                    </span>
                    <span className="font-medium">
                      {currentPeriodEnd?.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Member since:</span>
                    <span className="font-medium">
                      {memberSince?.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-3">
            {upgradeOption && (
              <Button
                onClick={() => handleUpgradeClick(upgradeOption.tier)}
                className="w-full"
                size="lg"
                disabled={isProcessingUpgrade}
              >
                {isProcessingUpgrade ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Crown className="w-4 h-4 mr-2" />
                    {upgradeOption.label}
                  </>
                )}
              </Button>
            )}

            {currentSubscription !== "free" && (
              <Button
                onClick={() => {
                  handleRedirectToStripeCustomerPortal(
                    user.user?.id ?? "",
                    router,
                  );
                }}
                className="w-full"
                size="lg"
                variant={upgradeOption ? "outline" : "default"}
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Subscription & Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5" />
            <span>Usage Statistics</span>
          </CardTitle>
          <CardDescription>
            Track your message usage for the current billing period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* For free tier, show simplified view */}
          {userPlan === "free" ? (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Credits Used</span>
                  <span className="text-sm text-muted-foreground">
                    {loadingUsageCount
                      ? "Loading..."
                      : `${creditsUsed} / ${creditLimit}`}
                  </span>
                </div>
                <Progress value={getUsagePercentage()} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span>{creditLimit} credits</span>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current period:</span>
                  <span className="font-medium">
                    {currentPeriodStart?.toLocaleDateString()} -{" "}
                    {currentPeriodEnd?.toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Credits remaining:
                  </span>
                  <span className="font-medium">
                    {loadingUsageCount
                      ? "..."
                      : Math.max(0, creditLimit - creditsUsed)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* For paid users, show individual credit grants */}
              {loadingUsageCount ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  Loading credit grants...
                </div>
              ) : creditGrants.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No active credit grants found
                </div>
              ) : (
                <div className="space-y-6">
                  {creditGrants.map((grant, index) => {
                    const usagePercentage = calculateUsagePercentage(
                      grant.credits_used,
                      grant.credits_granted,
                    );
                    const billingPeriod = formatBillingPeriod(
                      grant.billing_period_start,
                      grant.billing_period_end,
                    );

                    return (
                      <div key={grant.id} className="space-y-3">
                        {index > 0 && <Separator />}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <span className="text-sm font-medium">
                                {formatGrantType(grant.grant_type)}
                              </span>
                              {billingPeriod && (
                                <p className="text-xs text-muted-foreground">
                                  {billingPeriod}
                                </p>
                              )}
                              {grant.grant_reason && (
                                <p className="text-xs text-muted-foreground">
                                  {grant.grant_reason}
                                </p>
                              )}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {grant.credits_used.toFixed(1)} /{" "}
                              {grant.credits_granted.toFixed(1)}
                            </span>
                          </div>
                          <Progress value={usagePercentage} className="h-2" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              {grant.credits_remaining.toFixed(1)} remaining
                            </span>
                            <span>
                              Expires{" "}
                              {new Date(grant.expires_at).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Overage section - show if there are overage credits */}
              {overageCredits > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                            Overage Credits
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Usage beyond available credits
                          </p>
                        </div>
                        <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                          -{overageCredits.toFixed(1)}
                        </span>
                      </div>
                      <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-md">
                        <p className="text-xs text-orange-800 dark:text-orange-200">
                          These credits will be deducted from your next credit
                          grant
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Summary section */}
              <div className="grid gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Total credits used:
                  </span>
                  <span className="font-medium">{creditsUsed.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {overageCredits > 0
                      ? "Effective credits remaining:"
                      : "Total credits remaining:"}
                  </span>
                  <span
                    className={`font-medium ${
                      overageCredits > 0
                        ? "text-orange-600 dark:text-orange-400"
                        : ""
                    }`}
                  >
                    {(
                      creditGrants.reduce(
                        (sum, grant) => sum + grant.credits_remaining,
                        0,
                      ) - overageCredits
                    ).toFixed(1)}
                  </span>
                </div>
              </div>
            </>
          )}

          {(() => {
            // Calculate total remaining credits across all grants (accounting for overage)
            const totalRemainingCredits =
              userPlan === "free"
                ? Math.max(0, creditLimit - creditsUsed)
                : creditGrants.reduce(
                    (sum, grant) => sum + grant.credits_remaining,
                    0,
                  ) - overageCredits;

            const usagePercentage = getUsagePercentage();

            if (userPlan === "free") {
              if (totalRemainingCredits <= 0) {
                return (
                  <Alert className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800 dark:text-red-200">
                      {`You've exceeded your free plan limit (${creditsUsed.toFixed(1)}/${creditLimit} credits). Upgrade your plan to receive more credits.`}
                    </AlertDescription>
                  </Alert>
                );
              } else if (usagePercentage > 80) {
                return (
                  <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                      {`You've used ${Math.round(usagePercentage)}% of your monthly message limit.`}
                    </AlertDescription>
                  </Alert>
                );
              }
            } else {
              // For paid users, show overage alert if present
              if (overageCredits > 0 && totalRemainingCredits > 0) {
                return (
                  <Alert className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <AlertDescription className="text-orange-800 dark:text-orange-200">
                      You have {overageCredits.toFixed(1)} overage credits that
                      will be deducted from your next credit grant.
                    </AlertDescription>
                  </Alert>
                );
              }
              // Show alert only when all credits are exhausted (including overage)
              if (totalRemainingCredits <= 0) {
                return (
                  <Alert className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800 dark:text-red-200">
                      You&apos;ve used all available credits
                      {overageCredits > 0 &&
                        ` and have ${overageCredits.toFixed(1)} in overage`}
                      . Upgrade your plan to receive more credits.
                    </AlertDescription>
                  </Alert>
                );
              }
            }

            return null;
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

export default AccountSettings;
