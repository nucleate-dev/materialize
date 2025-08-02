"use client";

import Breadcrumb from "@/components/dashboard/Breadcrumbs/Breadcrumb";
import { ProductKeys, supabase } from "@/GlobalConstants";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { handleRedirectToStripeCustomerPortal } from "@/lib/utils/payments/SubscriptionManagementUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { User, Phone, Mail, Rocket, Calendar, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function AccountSettings() {
  const user = useUser();
  const router = useRouter();

  const [currentSubscription, setCurrentSubscription] = useState<string>("");
  const [nextBillingDate, setNextBillingDate] = useState<Date>(new Date());
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [memberSince, setMemberSince] = useState<Date>(new Date());
  const [scheduledForCancellation, setScheduledForCancellation] =
    useState<boolean>(false);

  useEffect(() => {
    async function fetchCurrentSubscription() {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.user?.id);
      if (error) {
        // handle error
        console.log("error: ", error);
        return;
      }

      const { data: userData, error: userFetchError } = await supabase
        .from("users")
        .select("*")
        .eq("user_id", user.user?.id)
        .single();
      if (userFetchError) {
        // handle error
        console.log("error: ", error);
        return;
      }
      setName(userData?.name);
      setEmail(userData?.email);
      setPhoneNumber(userData?.phone_number);
      setMemberSince(new Date(userData?.created_at));
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
    }

    if (user.user && user.userIsLoading === false) {
      fetchCurrentSubscription();
    }
  }, [user.user, user.userIsLoading]);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <Breadcrumb pageName="Account" />
      
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <Label htmlFor="phoneNumber" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </Label>
                  <Input
                    id="phoneNumber"
                    value={phoneNumber}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailAddress" className="flex items-center gap-2">
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
                <p className="text-sm text-muted-foreground mb-1">Member since</p>
                <p className="font-semibold">{memberSince?.toLocaleDateString()}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentPlan" className="flex items-center gap-2">
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
                <Label htmlFor="billingDate" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {scheduledForCancellation ? "Membership ends on" : "Next billing date"}
                </Label>
                <Input
                  id="billingDate"
                  value={`${nextBillingDate?.getMonth() + 1}/${nextBillingDate?.getDate()}/${nextBillingDate?.getFullYear()}`}
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
