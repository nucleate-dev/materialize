"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ProductKeys } from "@/GlobalConstants";
import { useUser } from "@/hooks/useUser";
import { handleRedirectToStripeCustomerPortal } from "@/lib/utils/payments/SubscriptionManagementUtils";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mail,
  Calendar,
  CreditCard,
  MessageSquare,
  Settings,
  Crown,
  AlertCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/ClientConstants";

function AccountSettings() {
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
  const [messageCount, setMessageCount] = useState<number>(0);
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

  // Fetch message count for current billing period
  useEffect(() => {
    async function fetchMessageCount() {
      if (!user.user?.id || loadingSubscriptionData) return;

      setLoadingUsageCount(true);
      try {
        const { count, error } = await supabase
          .from("api_usage")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.user.id)
          .gte("created_at", currentPeriodStart.toISOString())
          .lte("created_at", currentPeriodEnd.toISOString());

        if (error) {
          console.error("Error fetching message count:", error);
          setMessageCount(0);
        } else {
          console.log("Fetched message count:", count);
          setMessageCount(count || 0);
        }
      } catch (error) {
        console.error("Error fetching message count:", error);
        setMessageCount(0);
      } finally {
        setLoadingUsageCount(false);
      }
    }

    fetchMessageCount();
  }, [
    user.user?.id,
    currentPeriodStart,
    currentPeriodEnd,
    loadingSubscriptionData,
  ]);

  // Calculate message limit based on subscription plan
  const getMessageLimit = () => {
    switch (userPlan) {
      case "free":
        return 15;
      case "pro":
        return 100;
      case "team":
        return 100;
      default:
        return 15;
    }
  };

  const messageLimit = getMessageLimit();

  // Convert userPlan to ProductKeys format
  const getCurrentSubscription = () => {
    switch (userPlan) {
      case "pro":
        return ProductKeys.PRO_SUBSCRIPTION;
      case "team":
        return ProductKeys.TEAM_SUBSCRIPTION;
      default:
        return ProductKeys.FREE_SUBSCRIPTION;
    }
  };

  const currentSubscription = getCurrentSubscription();

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan.toLowerCase()) {
      case ProductKeys.PRO_SUBSCRIPTION.toLowerCase():
        return "default";
      case ProductKeys.TEAM_SUBSCRIPTION.toLowerCase():
        return "secondary";
      default:
        return "outline";
    }
  };

  const getUsagePercentage = () => {
    return messageLimit > 0 ? (messageCount / messageLimit) * 100 : 0;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleUpgradeToProClick = async () => {
    try {
      setIsProcessingUpgrade(true);
      await handleCheckout(ProductKeys.PRO_SUBSCRIPTION, router);
      // Keep processing state for 2 seconds to account for Stripe redirect delay
      setTimeout(() => {
        setIsProcessingUpgrade(false);
      }, 2000);
    } catch (error) {
      console.error("Error starting checkout:", error);
      setIsProcessingUpgrade(false);
    }
  };

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
                  : `${messageLimit} messages per billing cycle`}
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

          {currentSubscription === ProductKeys.FREE_SUBSCRIPTION ? (
            <Button
              onClick={handleUpgradeToProClick}
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
                  Upgrade to Pro
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => {
                handleRedirectToStripeCustomerPortal(
                  user.user?.id ?? "",
                  router,
                );
              }}
              className="w-full"
              size="lg"
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Subscription & Billing
            </Button>
          )}
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
              <span className="text-sm font-medium">Messages Used</span>
              <span className="text-sm text-muted-foreground">
                {loadingUsageCount
                  ? "Loading..."
                  : `${messageCount} / ${messageLimit}`}
              </span>
            </div>
            <Progress value={getUsagePercentage()} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>{messageLimit} messages</span>
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
              <span className="text-muted-foreground">Messages remaining:</span>
              <span className="font-medium">
                {loadingUsageCount
                  ? "..."
                  : Math.max(0, messageLimit - messageCount)}
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
                      {`You've exceeded your free plan limit (${messageCount}/
                      ${messageLimit} messages). Upgrade to Pro to continue using
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
