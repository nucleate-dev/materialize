"use client";

import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { useRouter } from "next/navigation";

export function PricingCard({
  title,
  price,
  features,
  popular,
  productKey,
}: {
  title: string;
  price: string;
  features: string[];
  popular: boolean;
  productKey: string;
}) {
  const router = useRouter();
  return (
    <div
      className={`flex flex-col p-8 bg-white rounded-lg shadow-md transition-transform transform hover:scale-105 ${
        popular ? "border-2 border-purple-500" : "border"
      }`}
    >
      {popular && (
        <span className="px-3 py-1 bg-purple-500 text-white rounded-full text-sm font-semibold mb-3 inline-block">
          Most Popular
        </span>
      )}
      <div className="flex-grow">
        <h3 className="text-2xl font-bold text-gray-800 mb-4">{title}</h3>
        <p className="text-4xl font-extrabold text-gray-900 mb-8">{price}</p>
        <ul className="mb-8 space-y-4">
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
      </div>
      <div className="mt-auto">
        <a
          onClick={() => {
            handleCheckout(productKey, router);
          }}
          className="block w-full py-3 px-6 bg-purple-500 text-white text-center rounded-lg font-semibold hover:bg-purple-600 transition-colors"
        >
          Choose Plan
        </a>
      </div>
    </div>
  );
}
