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
import { CreditLimits, ProductKeys } from "@/GlobalConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { handleRedirectToStripeCustomerPortal } from "@/lib/utils/payments/SubscriptionManagementUtils";
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
        const nowIso = new Date().toISOString();
        const { data: balances, error: balancesError } = await supabase
          .from("credit_grant_balances")
          .select("credits_granted, credits_remaining")
          .eq("user_id", user.user.id)
          .gt("expires_at", nowIso);

        if (balancesError) {
          logger.debug("error", "Error fetching credits:", {
            error: balancesError.message,
          });
          setCreditsUsed(0);
          return;
        }

        const totalGranted = balances?.reduce(
          (sum, balance) => sum + (balance.credits_granted || 0),
          0,
        ) || 0;
        const totalRemaining =
          balances?.reduce(
            (sum, balance) => sum + (balance.credits_remaining || 0),
            0,
          ) || 0;
        const totalUsed = totalGranted - totalRemaining;

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
  }, [
    user.user?.id,
    loadingSubscriptionData,
    logger,
  ]);

  // Calculate credit limit based on subscription plan
  const getCreditLimit = () => {
    switch (userPlan) {
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

  // Convert userPlan to ProductKeys format
  const getCurrentSubscription = () => {
    switch (userPlan) {
      case "pro":
        return ProductKeys.PRO_SUBSCRIPTION;
      case "plus":
        return ProductKeys.PLUS_SUBSCRIPTION;
      case "max":
        return ProductKeys.MAX_SUBSCRIPTION;
      case "team":
        return ProductKeys.TEAM_SUBSCRIPTION;
      default:
        return ProductKeys.FREE_SUBSCRIPTION;
    }
  };

  const currentSubscription = getCurrentSubscription();

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan.toLowerCase()) {
      case ProductKeys.MAX_SUBSCRIPTION.toLowerCase():
        return "default"; // Highest tier gets primary badge
      case ProductKeys.PRO_SUBSCRIPTION.toLowerCase():
        return "default";
      case ProductKeys.PLUS_SUBSCRIPTION.toLowerCase():
        return "secondary";
      case ProductKeys.TEAM_SUBSCRIPTION.toLowerCase():
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
      case ProductKeys.FREE_SUBSCRIPTION:
        return { tier: ProductKeys.PLUS_SUBSCRIPTION, label: "Upgrade to Plus" };
      case ProductKeys.PLUS_SUBSCRIPTION:
        return { tier: ProductKeys.PRO_SUBSCRIPTION, label: "Upgrade to Pro" };
      case ProductKeys.PRO_SUBSCRIPTION:
        return { tier: ProductKeys.MAX_SUBSCRIPTION, label: "Upgrade to Max" };
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
                  {currentSubscription === ProductKeys.PRO_SUBSCRIPTION && (
                    <Crown className="w-3 h-3 mr-1" />
                  )}
                  {currentSubscription.replace("_subscription", "")}
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
                {currentSubscription.replace("_subscription", "")} Plan
              </p>
              <p className="text-sm text-muted-foreground">
                {currentSubscription === ProductKeys.FREE_SUBSCRIPTION
                  ? "Free forever with basic features"
                  : `${creditLimit} credits per billing cycle`}
              </p>
            </div>
            <Badge
              variant={getPlanBadgeVariant(currentSubscription)}
              className="capitalize"
            >
              {currentSubscription === ProductKeys.PRO_SUBSCRIPTION && (
                <Crown className="w-3 h-3 mr-1" />
              )}
              Active
            </Badge>
          </div>

          {currentSubscription !== ProductKeys.FREE_SUBSCRIPTION && (
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

            {currentSubscription !== ProductKeys.FREE_SUBSCRIPTION && (
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
              <span className="text-muted-foreground">Credits remaining:</span>
              <span className="font-medium">
                {loadingUsageCount
                  ? "..."
                  : Math.max(0, creditLimit - creditsUsed)}
              </span>
            </div>
          </div>

          {(() => {
            const usagePercentage = getUsagePercentage();

            if (userPlan === "free") {
              if (usagePercentage >= 100) {
                return (
                  <Alert className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800 dark:text-red-200">
                      {`You've exceeded your free plan limit (${creditsUsed.toFixed(1)}/
                      ${creditLimit} credits). Upgrade to Pro to continue using
                      the service this period.`}
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
            } else if (userPlan === "pro" && usagePercentage >= 100) {
              return (
                <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                    {
                      "You've exceeded your included usage. You'll now be charged per message."
                    }
                  </AlertDescription>
                </Alert>
              );
            }

            return null;
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

export default AccountSettings;
