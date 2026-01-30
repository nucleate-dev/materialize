"use client";

import { Button } from "@/components/ui/button";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { ENABLE_DESIGN_SYSTEM } from "@/GlobalConstants";
import { Check, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * PRICING SECTION - Client Component
 * Interactive pricing cards with checkout functionality
 */
export default function PricingSection() {
  const router = useRouter();
  const logger = useProductLogger();
  const { activeTeam } = useActiveTeam();

  const handleGetStarted = (productKey: string) => {
    if (productKey !== "free") {
      logger.log({
        event: "client_upgrade_checkout_clicked",
        properties: { source: "landing_pricing_section", plan: productKey },
      });
    }
    if (activeTeam?.id) {
      handleCheckout(productKey, router, activeTeam.id);
    }
  };

  const pricingPlans = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "For trying out Nucleate",
      features: [
        "5 free projects",
        "15 free messages",
        "Fork projects for free",
      ],
      cta: "Get Started",
      highlighted: false,
      productKey: "free",
    },
    {
      name: "Plus",
      price: "$25",
      period: "per month",
      description: "For individuals",
      features: [
        "Everything in Free",
        "100 credits included",
        "Unlimited projects",
        "Export code",
        "1 free collaborator",
      ],
      cta: "Upgrade to Plus",
      highlighted: false,
      productKey: "plus",
    },
    {
      name: "Teams",
      price: "$35",
      period: "per seat/month",
      description: "For growing teams",
      features: [
        "Everything in Plus",
        ...(ENABLE_DESIGN_SYSTEM ? ["Shared design systems"] : []),
        "Live collaboration",
        "Internal tools",
        "Enterprise security",
      ],
      cta: "Start with Teams",
      highlighted: true,
      productKey: "teams",
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "For large organizations",
      features: [
        "Everything in Teams",
        "SSO & SAML",
        "Dedicated support",
        "Custom SLA",
        "Audit logs",
      ],
      cta: "Contact Sales",
      highlighted: false,
      productKey: "max",
    },
  ];

  return (
    <section className="py-32 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-6xl relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-medium text-foreground mb-4">
            Simple pricing
          </h2>
          <p className="text-muted-foreground">
            Start for free, scale as you grow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pricingPlans.map((plan, index) => (
            <div
              key={index}
              className={`relative p-8 rounded-3xl flex flex-col transition-all duration-300 hover:-translate-y-2 ${plan.highlighted ? "bg-card border border-primary/50 shadow-2xl shadow-primary/10" : "border border-border hover:border-border"}`}
            >
              {/* Featured plan glow */}
              {plan.highlighted && (
                <div className="absolute -inset-px bg-gradient-to-b from-primary/20 to-transparent rounded-3xl pointer-events-none opacity-40" />
              )}

              <div className="relative z-10">
                <div className="mb-8">
                  <h3 className="text-lg font-medium text-foreground">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 h-10">
                    {plan.description}
                  </p>
                </div>
                <div className="mb-8 flex items-baseline gap-1">
                  <span className="text-4xl font-medium text-foreground">
                    {plan.price}
                  </span>
                  {plan.price !== "$0" && plan.price !== "Custom" && (
                    <span className="text-muted-foreground text-sm">
                      /{plan.period}
                    </span>
                  )}
                </div>
                <div>
                  <Button
                    onClick={() => handleGetStarted(plan.productKey)}
                    className={`w-full h-11 rounded-full text-sm font-medium transition-all mb-8 hover:scale-102 active:scale-98 ${plan.highlighted ? "bg-foreground text-background hover:bg-foreground/90" : "bg-accent text-foreground hover:bg-accent border border-border"}`}
                  >
                    {plan.cta}
                  </Button>
                </div>
                <div className="space-y-4 mt-auto">
                  {plan.features.map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 text-sm text-muted-foreground"
                    >
                      <Check className="w-4 h-4 text-muted-foreground" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bring Your Own Claude Code */}
        <div className="mt-8 relative bg-gradient-to-br from-[#D97757]/10 via-card to-card border border-[#D97757]/20 rounded-2xl p-6 md:p-8 overflow-hidden hover:border-[#D97757]/40 transition-all group">
          {/* Subtle glow effect */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#D97757]/10 blur-[100px] rounded-full pointer-events-none opacity-15" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Left side - Icon and content */}
            <div className="flex items-start gap-4 flex-1">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-[#D97757]/20 rounded-xl flex items-center justify-center border border-[#D97757]/30 group-hover:bg-[#D97757]/30 transition-colors">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-6 h-6 text-[#D97757]"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M19.16 4.38H4.84V19.62H19.16V4.38ZM17.72 17.9L12 14.5L6.28 17.9V6.1H17.72V17.9Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-medium text-foreground mb-1">
                  Bring your own Claude Code
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Already have a Claude Code subscription? Connect it to
                  Nucleate for massive savings.{" "}
                  <span className="text-[#D97757]">Available on Plus.</span>
                </p>
              </div>
            </div>

            {/* Right side - Stats and benefits */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6">
              <div className="text-center sm:text-left">
                <div className="text-2xl md:text-3xl font-bold text-[#D97757] mb-0.5">
                  1000x
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  more usage
                </div>
              </div>
              <div className="hidden sm:block w-px h-10 bg-border"></div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-[#D97757] flex-shrink-0" />
                  <span>Use your subscription or ours</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-[#D97757] flex-shrink-0" />
                  <span>Fraction of the cost vs. competitors</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
