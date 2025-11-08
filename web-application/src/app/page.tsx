"use client";
import { supabase } from "@/ClientConstants";
import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { setChatIntent } from "@/lib/utils/chatIntentUtils";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import {
  CheckBadgeIcon,
  PaperAirplaneIcon,
  Squares2X2Icon
} from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  return (
    <main className="relative bg-background overflow-hidden">
      {/* Premium Background */}
      <div className="absolute inset-0 bg-gradient-radial from-gray-100/20 via-background to-background dark:from-gray-600/8 dark:via-background dark:to-background"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJncmF5IiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+Cg==')] opacity-30 dark:opacity-10"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-foreground/5 dark:to-foreground/10"></div>

      <div className="relative z-10">
        <PremiumHeader />
        <HeroSection />
        <UseCasesSection />
        <GallerySection />
        <PricingSection />
        <MinimalDepthElements />
      </div>
    </main>
  );
}

function MinimalDepthElements() {
  return (
    <div className="fixed inset-0 z-0 motion-reduce:hidden">
      {/* Subtle depth orbs - smaller, slower, outside focal areas */}
      <div className="absolute top-1/3 -left-1/4 w-64 h-64 bg-gradient-to-r from-blue-100/10 to-emerald-100/10 dark:from-blue-900/5 dark:to-emerald-900/5 rounded-full blur-3xl animate-[drift_20s_ease-in-out_infinite]"></div>
      <div className="absolute bottom-1/3 -right-1/4 w-48 h-48 bg-gradient-to-r from-emerald-100/10 to-blue-100/10 dark:from-emerald-900/5 dark:to-blue-900/5 rounded-full blur-3xl animate-[drift_25s_ease-in-out_infinite_reverse]"></div>
    </div>
  );
}

function HeroSection() {
  const logger = useProductLogger();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const router = useRouter();
  const { user } = useUser();

  const presetPrompts = {
    onboarding: "Create a React Native onboarding flow with 3 screens: welcome screen with app logo and tagline, features overview with illustrations, and sign-up form with email/password inputs",
    paywall: "Design a React Native paywall screen with pricing tiers (Basic $9.99/month, Premium $19.99/month), feature comparison, and subscription buttons with payment integration",
    recipeApp: "Build a React Native recipe app home screen with search bar, category filters (Breakfast, Lunch, Dinner, Desserts), featured recipes carousel, and recipe cards with images and ratings"
  };

  const handlePresetClick = (presetKey: keyof typeof presetPrompts) => {
    setPrompt(presetPrompts[presetKey]);
  };

  const submitPrompt = async (message: string) => {
    const content = message.trim();
    if (!content || isLoading) return;

    setIsLoading(true);

    try {
      if (!user?.id) {
        setChatIntent(undefined, content, false);
        router.push("/login");
        return;
      }

      let result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      >;
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          return;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: "New Prototype",
            } as CreatePrototypeRequestBody),
          },
        );

        result = await response.json();
      } catch (error) {
        logger.debug("error", "Error creating prototype:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return;
      }

      if (result.data) {
        setChatIntent(result.data.prototype_id, content, false);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        setShowUpsellModal(true);
      } else {
        logger.debug("error", "Error creating prototype:", {
          error: result.error?.message,
        });
      }
    } catch (err) {
      logger.debug("error", "Error creating prototype:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    submitPrompt(prompt);
  };

  return (
    <section className="relative flex items-start justify-center pt-32 pb-16 bg-background">
      <div className="container mx-auto px-6 text-center relative z-20">

        {/* Main Heading with Gradient */}
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6 leading-[1.1] tracking-tight">
          <span className="bg-gradient-to-r from-foreground via-foreground/80 to-foreground bg-clip-text text-transparent">
            Materialize
          </span>
        </h1>

        {/* Animated Subtitle */}
        <p className="text-lg md:text-xl text-foreground/70 max-w-3xl mx-auto mb-12 leading-relaxed">
          Build mobile apps with AI.
        </p>

        {/* Prompt Input */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative flex items-end gap-3 bg-foreground/5 border border-foreground/20 rounded-3xl px-5 py-3 hover:border-foreground/30 focus-within:border-foreground/40 transition-all duration-200">
            <Textarea
              placeholder="Describe the mobile app you want to build..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isLoading}
              className="flex-1 bg-transparent text-lg text-foreground placeholder:text-foreground/40 outline-none resize-none min-h-[100px] max-h-[200px] disabled:opacity-50 disabled:cursor-not-allowed border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={3}
            />
            <Button
              onClick={handleSend}
              disabled={!prompt.trim() || isLoading}
              className="h-9 w-9 p-0 rounded-full bg-foreground hover:bg-foreground/90 disabled:bg-foreground/30 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : (
                <PaperAirplaneIcon className="w-4 h-4 text-background" />
              )}
            </Button>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <Button
            onClick={() => handlePresetClick("onboarding")}
            variant="outline"
            className="px-6 py-3 bg-white/5 border border-white/20 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
          >
            Onboarding Flow
          </Button>
          <Button
            onClick={() => handlePresetClick("paywall")}
            variant="outline"
            className="px-6 py-3 bg-white/5 border border-white/20 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
          >
            Paywall
          </Button>
          <Button
            onClick={() => handlePresetClick("recipeApp")}
            variant="outline"
            className="px-6 py-3 bg-white/5 border border-white/20 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
          >
            Recipe App
          </Button>
        </div>
      </div>

      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </section>
  );
}

function UseCasesSection() {
  const useCases = [
    {
      title: "Vibe code apps from scratch",
      description: "Start with a prompt. AI generates complete React Native apps you can export and ship.",
      features: ["AI-powered code generation", "Full app scaffolding", "Export to React Native"],
    },
    {
      title: "Prototype components, screens, and flows seamlessly",
      description: "Design on an infinite canvas. Build components, screens, or multi-step flows in one workspace.",
      features: ["Infinite canvas workspace", "Multi-screen flows", "Component library"],
    },
    {
      title: "Bring your own design system",
      description: "Import your design tokens and components. Keep every prototype on-brand.",
      features: ["Custom design tokens", "Component integration", "Brand consistency"],
    },
  ];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="max-w-7xl mx-auto space-y-32">
          {useCases.map((useCase, index) => {
            const isReversed = index % 2 === 1;
            return (
              <div
                key={index}
                className={`flex flex-col ${isReversed ? "lg:flex-row-reverse" : "lg:flex-row"
                  } items-center gap-12 lg:gap-16`}
              >
                {/* Text Content */}
                <div className="flex-1 space-y-6">
                  <h2 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
                    {useCase.title}
                  </h2>
                  <p className="text-lg md:text-xl text-foreground/70 leading-relaxed">
                    {useCase.description}
                  </p>
                  <ul className="space-y-3">
                    {useCase.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-foreground/80">
                        <CheckBadgeIcon className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        <span className="text-base md:text-lg">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Screenshot Placeholder */}
                <div className="flex-1 w-full">
                  <div className="relative aspect-[4/3] rounded-2xl border-2 border-foreground/10 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 overflow-hidden shadow-2xl hover:shadow-3xl transition-shadow duration-300">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center space-y-3">
                        <Squares2X2Icon className="w-16 h-16 text-foreground/20 mx-auto" />
                        <p className="text-sm text-foreground/40 font-medium">
                          Screenshot placeholder
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const router = useRouter();
  const { user } = useUser();

  const handleGetStarted = (productKey: string) => {
    handleCheckout(productKey, router);
  };

  const pricingPlans = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "Perfect for trying out Materialize",
      features: [
        "3 projects",
        "Unlimited components",
        "Export to React Native",
        "Community support",
      ],
      cta: "Get Started",
      highlighted: false,
      productKey: "free",
    },
    {
      name: "Plus",
      price: "$20",
      period: "per month",
      description: "For individual creators",
      features: [
        "Unlimited projects",
        "Export to React Native",
        "Email support",
        "Custom design tokens",
      ],
      cta: "Upgrade to Plus",
      highlighted: false,
      productKey: "plus",
    },
    {
      name: "Pro",
      price: "$50",
      period: "per month",
      description: "For professionals and small teams",
      features: [
        "Everything in Plus",
        "Priority support",
        "Team collaboration",
        "Advanced integrations",
      ],
      cta: "Upgrade to Pro",
      highlighted: true,
      productKey: "pro",
    },
    {
      name: "Max",
      price: "$200",
      period: "per month",
      description: "For enterprises and large teams",
      features: [
        "Everything in Pro",
        "Dedicated support",
        "Custom SLA",
        "Advanced security",
        "White-label options",
      ],
      cta: "Upgrade to Max",
      highlighted: false,
      productKey: "max",
    },
  ];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Simple Pricing
            </h2>
            <p className="text-lg md:text-xl text-foreground/70 max-w-3xl mx-auto">
              Start free, upgrade when ready
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <div
                key={index}
                className={`relative rounded-2xl p-8 transition-all duration-300 ${plan.highlighted
                  ? "bg-foreground/5 border-2 border-foreground/30 shadow-2xl hover:shadow-3xl hover:-translate-y-2"
                  : "bg-background border-2 border-foreground/10 hover:border-foreground/20 hover:-translate-y-1"
                  }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center px-4 py-1 rounded-full text-sm font-semibold bg-foreground text-background">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Plan Name */}
                  <div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">
                      {plan.name}
                    </h3>
                    <p className="text-foreground/60">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-extrabold text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-foreground/60">/{plan.period}</span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 py-6 border-t border-foreground/10">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <CheckBadgeIcon className="w-5 h-5 text-foreground/70 flex-shrink-0" />
                        <span className="text-foreground/80">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  <Button
                    onClick={() => handleGetStarted(plan.productKey)}
                    className={`w-full py-6 text-lg font-semibold rounded-xl transition-all duration-200 ${plan.highlighted
                      ? "bg-foreground text-background hover:bg-foreground/90 shadow-lg"
                      : "bg-foreground/5 hover:bg-foreground/10 text-foreground border-2 border-foreground/20"
                      }`}
                  >
                    {plan.cta}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GallerySection() {
  const galleryItems = [
    { title: "Onboarding Flow", category: "Multi-screen Flow" },
    { title: "Premium Paywall", category: "Component" },
    { title: "Recipe App Home", category: "Screen" },
    { title: "Social Feed", category: "Screen" },
    { title: "Authentication Flow", category: "Multi-screen Flow" },
    { title: "Settings Screen", category: "Screen" },
    { title: "Chat Interface", category: "Screen" },
    { title: "Product Cards", category: "Component" },
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-background to-foreground/5 dark:to-foreground/10">
      <div className="container mx-auto px-6">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Gallery
            </h2>
            <p className="text-lg md:text-xl text-foreground/70 max-w-3xl mx-auto">
              Sample components, screens, and apps
            </p>
          </div>

          {/* Gallery Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {galleryItems.map((item, index) => (
              <div
                key={index}
                className="group relative bg-background border-2 border-foreground/10 rounded-2xl overflow-hidden hover:border-foreground/30 transition-all duration-300 cursor-pointer hover:shadow-xl hover:-translate-y-1"
              >
                {/* Image Placeholder */}
                <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Squares2X2Icon className="w-12 h-12 text-foreground/20 group-hover:text-foreground/40 transition-colors duration-300" />
                  </div>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                    <span className="text-white font-semibold text-sm">View Prototype</span>
                  </div>
                </div>

                {/* Card Info */}
                <div className="p-4 space-y-2">
                  <h3 className="text-lg font-bold text-foreground group-hover:text-foreground/80 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-foreground/60">
                    {item.category}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
