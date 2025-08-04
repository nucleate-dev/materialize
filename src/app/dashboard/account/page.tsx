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
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Rocket, Calendar, CreditCard, MessageSquare } from "lucide-react";
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

  const [currentSubscription, setCurrentSubscription] = useState<string>("");
  const [nextBillingDate, setNextBillingDate] = useState<Date>(new Date());
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [memberSince, setMemberSince] = useState<Date>(new Date());
  const [scheduledForCancellation, setScheduledForCancellation] =
    useState<boolean>(false);
  const [messageCount, setMessageCount] = useState<number>(0);
  const [loadingUsageCount, setLoadingUsageCount] = useState<boolean>(true);

  useEffect(() => {
    async function fetchCurrentSubscription() {
      // Set user info from Supabase Auth user
      if (user.user) {
        setEmail(user.user.email || "");
        setName(user.user.user_metadata?.full_name || user.user.user_metadata?.first_name + " " + user.user.user_metadata?.last_name || "");
        setMemberSince(new Date(user.user.created_at));
      }

      // Fetch subscription data
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.user?.id);
      
      if (error) {
        console.log("error: ", error);
        // Set default subscription if no subscription found
        setCurrentSubscription(ProductKeys.FREE_SUBSCRIPTION);
        return;
      }

      if (data && data.length > 0) {
        setNextBillingDate(new Date(data[0].current_period_end * 1000));
        switch (data[0].plan_id) {
          case ProductKeys.FREE_SUBSCRIPTION:
            setCurrentSubscription(ProductKeys.FREE_SUBSCRIPTION);
            break;
          case ProductKeys.PRO_SUBSCRIPTION:
            setCurrentSubscription(ProductKeys.PRO_SUBSCRIPTION);
            break;
          case ProductKeys.TEAM_SUBSCRIPTION:
            setCurrentSubscription(ProductKeys.TEAM_SUBSCRIPTION);
            break;
          default:
            setCurrentSubscription(ProductKeys.FREE_SUBSCRIPTION);
            break;
        }
        setScheduledForCancellation(data[0]?.scheduled_for_cancellation);
      } else {
        // No subscription found, set free as default
        setCurrentSubscription(ProductKeys.FREE_SUBSCRIPTION);
      }
    }

    if (user.user && user.userIsLoading === false) {
      fetchCurrentSubscription();
    }
  }, [user.user, user.userIsLoading]);

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
  }, [user.user?.id, currentPeriodStart, currentPeriodEnd, loadingSubscriptionData]);

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

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">
          Account
        </h2>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Personal Information Card */}
        <div className="lg:col-span-2">
          <Card className="bg-background/80 backdrop-blur-sm border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Full Name
                  </Label>
                  <Input
                    id="fullName"
                    value={name}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="emailAddress"
                    className="flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    Email Address
                  </Label>
                  <Input
                    id="emailAddress"
                    type="email"
                    value={email}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Membership Details Card */}
        <div className="lg:col-span-1">
          <Card className="bg-background/80 backdrop-blur-sm border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Membership Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">
                  Member since
                </p>
                <p className="font-semibold">
                  {memberSince?.toLocaleDateString()}
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="currentPlan"
                  className="flex items-center gap-2"
                >
                  <Rocket className="w-4 h-4" />
                  Current Plan
                </Label>
                <Input
                  id="currentPlan"
                  value={currentSubscription}
                  disabled
                  className="bg-muted font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="billingDate"
                  className="flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  {scheduledForCancellation
                    ? "Membership ends on"
                    : "Next billing date"}
                </Label>
                <Input
                  id="billingDate"
                  value={`${nextBillingDate?.getMonth() + 1}/${nextBillingDate?.getDate()}/${nextBillingDate?.getFullYear()}`}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="messageUsage"
                  className="flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Messages Used (Current Period)
                </Label>
                <Input
                  id="messageUsage"
                  value={
                    loadingUsageCount
                      ? "Loading..."
                      : `${messageCount}/${messageLimit}`
                  }
                  disabled
                  className="bg-muted"
                />
              </div>

              <Separator />

              <Button
                onClick={() => {
                  handleRedirectToStripeCustomerPortal(
                    user.user?.id ?? "",
                    router,
                  );
                }}
                className="w-full"
              >
                Manage Subscription
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default AccountSettings;
