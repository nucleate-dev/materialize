"use client";

import Loader from "../../components/dashboard/Loader";
import { ProductKeys } from "@/GlobalConstants";
import { useHasSubscriptionAccess } from "@/lib/utils/payments/PaymentValidationUtils";
import { PricingCard } from "@/components/PricingCard";
import Link from "next/link";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";

export default function WithPaywall({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    hasBaseSubscriptionAccess,
    hasProSubscriptionAccess,
    loadingSubscriptionData,
  } = useHasSubscriptionAccess();
  if (loadingSubscriptionData) {
    return <Loader />;
  } else if (hasBaseSubscriptionAccess || hasProSubscriptionAccess) {
    return children;
  } else {
    return <Paywall />;
  }
}

function Paywall() {
  return (
    <div className="flex items-center justify-center min-h-screen container mx-auto text-center">
      <div className="container mx-auto text-center">
        <h2 className="text-4xl font-bold mb-8">Our Pricing</h2>
        <div className="flex justify-center flex-wrap grid-cols-3 gap-x-6">
          <PricingCard
            title="Basic Plan"
            price="$99"
            features={["Feature 1", "Feature 2", "Feature 3"]}
            popular={false}
            productKey={ProductKeys.BASE_SUBSCRIPTION}
          />
          <PricingCard
            title="Pro Plan"
            price="$129"
            features={["Feature 1", "Feature 2", "Feature 3", "Feature 4"]}
            popular={true} // Mark this plan as the most popular
            productKey={ProductKeys.PRO_SUBSCRIPTION}
          />
          <PricingCard
            title="Premium Plan"
            price="$250"
            features={[
              "Feature 1",
              "Feature 2",
              "Feature 3",
              "Feature 4",
              "Feature 5",
            ]}
            popular={false}
            productKey={ProductKeys.PRO_SUBSCRIPTION}
          />
        </div>
        <Link
          href="#"
          onClick={() => {
            logout();
          }}
          className="inline-flex items-center justify-center rounded-full bg-primary py-4 px-10 text-center font-medium text-white hover:bg-opacity-90 lg:px-8 xl:px-10 mt-12"
        >
          Logout
        </Link>
      </div>
    </div>
  );
}
