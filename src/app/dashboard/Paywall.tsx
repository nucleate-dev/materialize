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
  const pricingTiers = [
    {
      name: "Free",
      productID: ProductKeys.FREE_SUBSCRIPTION,
      price: "$0",
      period: "/month",
      description: "Perfect for getting started with prototyping",
      features: [
        "10 messages per month",
        "Basic React Native components",
        "Infinite canvas access",
        "Code export",
        "Community support",
      ],
      cta: "Get Started",
      popular: false,
    },
    {
      name: "Pro",
      productID: ProductKeys.PRO_SUBSCRIPTION,
      price: "$20",
      period: "/month",
      description: "Ideal for professional developers and teams",
      features: [
        "100 messages included",
        "Pay-per-message scaling:",
        "• 101-300: $0.15/message",
        "• 301-600: $0.10/message",
        "• 600+: $0.07/message",
        "Advanced AI components",
        "Priority support",
        "Team collaboration",
        "Custom templates",
      ],
      cta: "Start Pro Trial",
      popular: true,
    },
  ];

  return (
    <div className="flex items-center justify-center min-h-screen container mx-auto text-center">
      <div className="container mx-auto text-center max-w-6xl px-6">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">Choose Your Plan</h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12">
          Start free and scale as you grow. Pay only for what you use with transparent, developer-friendly pricing.
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {pricingTiers.map((tier, index) => (
            <PricingCard key={index} {...tier} theme="light" />
          ))}
        </div>

        {/* Usage Examples */}
        <div className="mb-12">
          <h3 className="text-2xl font-bold mb-8">Usage Examples</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-gray-50 border rounded-2xl p-6">
              <div className="text-2xl font-bold text-gray-900 mb-2">150 messages</div>
              <div className="text-gray-600 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-600">$20 + $7.50 = $27.50</div>
              <div className="text-sm text-gray-500 mt-2">100 included + 50 × $0.15</div>
            </div>
            <div className="bg-gray-50 border rounded-2xl p-6">
              <div className="text-2xl font-bold text-gray-900 mb-2">400 messages</div>
              <div className="text-gray-600 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-600">$20 + $40 = $60</div>
              <div className="text-sm text-gray-500 mt-2">100 included + 200×$0.15 + 100×$0.10</div>
            </div>
            <div className="bg-gray-50 border rounded-2xl p-6">
              <div className="text-2xl font-bold text-gray-900 mb-2">800 messages</div>
              <div className="text-gray-600 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-600">$20 + $84 = $104</div>
              <div className="text-sm text-gray-500 mt-2">Includes all tiers + 200×$0.07</div>
            </div>
          </div>
        </div>
        
        <Link
          href="#"
          onClick={() => {
            logout();
          }}
          className="inline-flex items-center justify-center rounded-full bg-primary py-4 px-10 text-center font-medium text-white hover:bg-opacity-90 lg:px-8 xl:px-10"
        >
          Logout
        </Link>
      </div>
    </div>
  );
}
