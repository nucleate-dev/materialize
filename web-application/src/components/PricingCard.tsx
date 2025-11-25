"use client";

import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { CheckIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";

export interface PricingCardProps {
  title?: string;
  name?: string; // Support both title and name for backward compatibility
  price: string;
  period?: string;
  description?: string;
  features: string[];
  popular: boolean;
  productKey?: string;
  productID?: string; // Support both productKey and productID
  cta?: string;
  ctaStyle?: string;
  theme?: "light" | "dark"; // Theme prop to switch between light and dark styles
}

export function PricingCard({
  title,
  name,
  price,
  period,
  description,
  features,
  popular,
  productKey,
  productID,
  cta = "Choose Plan",
  ctaStyle,
  theme = "light",
}: PricingCardProps) {
  const router = useRouter();
  const cardTitle = title || name || "";
  const productId = productKey || productID || "";

  if (theme === "dark") {
    // Dark theme for main landing page
    return (
      <div className="group relative">
        {/* Popular Badge */}
        {popular && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
              Sale
            </div>
          </div>
        )}

        {/* Hover Glow Effect */}
        <div
          className={`absolute inset-0 ${popular ? "bg-gradient-to-r from-purple-600/20 to-pink-600/20" : "bg-gradient-to-r from-blue-600/20 to-cyan-600/20"} opacity-0 group-hover:opacity-100 rounded-3xl blur-xl transition-opacity duration-500`}
        ></div>

        {/* Card */}
        <div
          className={`relative bg-gradient-to-br from-white/10 to-white/5 border ${popular ? "border-purple-500/30" : "border-white/10"} rounded-3xl p-8 hover:border-white/30 transition-all duration-500 backdrop-blur-xl group-hover:transform group-hover:scale-105 h-full`}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-white mb-2">{cardTitle}</h3>
            <div className="flex items-baseline justify-center gap-1 mb-4">
              <span className="text-5xl font-black text-white">{price}</span>
              {period && (
                <span className="text-gray-400 text-lg">{period}</span>
              )}
            </div>
            {description && <p className="text-gray-300">{description}</p>}
          </div>

          {/* Features */}
          <div className="flex-1 space-y-4">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                </div>
                <span
                  className={`text-gray-300 ${feature.startsWith("•") ? "text-sm ml-4" : ""}`}
                >
                  {feature}
                </span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="pt-6">
            <button
              className={`w-full py-4 px-6 rounded-2xl font-semibold transition-all duration-300 hover:scale-105 shadow-lg ${ctaStyle || "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"}`}
              onClick={() => handleCheckout(productId, router)}
            >
              {cta}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Light theme for paywall and other components
  return (
    <div
      className={`flex flex-col p-8 bg-white rounded-lg shadow-md transition-transform transform hover:scale-105 ${popular ? "border-2 border-purple-500" : "border"
        }`}
    >
      {popular && (
        <span className="px-3 py-1 bg-purple-500 text-white rounded-full text-sm font-semibold mb-3 inline-block">
          Sale
        </span>
      )}
      <div className="flex flex-col h-full">
        <h3 className="text-2xl font-bold text-gray-800 mb-4">{cardTitle}</h3>
        <p className="text-4xl font-extrabold text-gray-900 mb-8">{price}</p>
        <ul className="flex-1 space-y-4">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center">
              <svg
                className="w-6 h-6 text-purple-500 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 00-1.414 0L7 13.586 4.707 11.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l9-9a1 1 0 000-1.414z"
                  clipRule="evenodd"
                ></path>
              </svg>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <div className="pt-6">
          <button
            onClick={() => {
              handleCheckout(productId, router);
            }}
            className="block w-full py-3 px-6 bg-purple-500 text-white text-center rounded-lg font-semibold hover:bg-purple-600 transition-colors cursor-pointer"
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  );
}
