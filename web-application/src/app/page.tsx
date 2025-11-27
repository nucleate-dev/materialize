"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { GridBackground } from "@/components/shared/GridComponent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePrototype } from "@/hooks/useCreatePrototype";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { setChatIntent } from "@/lib/utils/chatIntentUtils";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import {
  ArrowRightIcon,
  CheckIcon,
  CommandLineIcon,
  CpuChipIcon,
  SparklesIcon
} from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
      <GridBackground forceDarkMode />

      <div className="relative z-10">
        <PremiumHeader forceDarkMode />
        {/* Ensure PremiumHeader handles transparent backgrounds well, or wrap it */}

        <HeroSection />
        <FeaturesBentoGrid />
        <GallerySection />
        <PricingSection />
        <Footer />
      </div>
    </main>
  );
}

function HeroSection() {
  const logger = useProductLogger();
  const { createPrototype } = useCreatePrototype();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const router = useRouter();
  const { user } = useUser();

  const presetPrompts = {
    onboarding: "Create a React Native onboarding flow with 3 screens: welcome screen, features overview, and sign-up form",
    paywall: "Design a paywall screen with pricing tiers (Basic $9.99, Premium $19.99), feature comparison, and subscribe button",
    recipeApp: "Build a recipe app home screen with search bar, category filters, featured recipes carousel, and cards"
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

      const result = await createPrototype();

      if (result.data) {
        setChatIntent(result.data.prototype_id, content, false);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
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
    <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 px-6">
      <div className="container mx-auto max-w-5xl">

        {/* Hero Badge */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-white/70 backdrop-blur-md hover:bg-white/10 transition-colors cursor-default">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
            Coming Soon
            <ArrowRightIcon className="w-3 h-3 text-white/40" />
          </div>
        </div>

        {/* Hero Title */}
        <div className="text-center space-y-6 mb-12">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60 pb-2">
            Materialize is a tool for <br className="hidden md:block" />
            building beautiful apps.
          </h1>
          <p className="text-lg md:text-xl text-[#8A8F98] max-w-2xl mx-auto font-normal leading-relaxed">
            Build apps, prototypes, flows, and screens fast.<br className="hidden md:block" />
          </p>
        </div>

        {/* Input Interface (Linear "Ask" Style) */}
        <div className="max-w-3xl mx-auto relative group">
          {/* Glow Effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-blue-500/30 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>

          <div className="relative bg-[#141517] border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col transition-colors duration-200 focus-within:border-white/20 focus-within:bg-[#18191B]">
            <div className="px-4 pt-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 bg-white/10 rounded text-white/50">
                  <SparklesIcon className="w-4 h-4" />
                </div>
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
                  className="flex-1 bg-transparent text-lg text-white placeholder:text-white/30 border-none p-0 focus-visible:ring-0 resize-none min-h-[60px]"
                  rows={2}
                />
              </div>
            </div>

            <div className="px-4 pb-3 flex flex-col sm:flex-row sm:items-center gap-2 border-t border-white/5 mt-2 pt-2 bg-white/[0.02]">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0 order-2 sm:order-1">
                <span className="text-xs text-white/30 uppercase tracking-wider font-semibold shrink-0">Try:</span>
                <button onClick={() => handlePresetClick('onboarding')} className="text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors whitespace-nowrap shrink-0">Onboarding</button>
                <button onClick={() => handlePresetClick('paywall')} className="text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors whitespace-nowrap shrink-0">Paywall</button>
                <button onClick={() => handlePresetClick('recipeApp')} className="text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors whitespace-nowrap shrink-0">Recipe App</button>
              </div>

              <Button
                onClick={handleSend}
                disabled={!prompt.trim() || isLoading}
                size="sm"
                className="h-7 px-3 rounded-md bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold shrink-0 w-full sm:w-auto order-1 sm:order-2"
              >
                {isLoading ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom visual anchor */}
        <div className="mt-20 opacity-50 grayscale hover:grayscale-0 transition-all duration-700">
          <p className="text-center text-xs text-white/30 mb-6 uppercase tracking-widest font-semibold">Powering next-gen builders</p>
          {/* You could add logo strip here */}
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

function FeaturesBentoGrid() {
  return (
    <section className="py-24 bg-[#0B0C0E] relative border-t border-white/5">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
            Made to build beautiful apps fast
          </h2>
          <p className="text-xl text-[#8A8F98] max-w-2xl">
            Materialize is shaped by the practices and principles that distinguish world-class product teams from the rest.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="group relative h-[480px] rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-10" />

            {/* Visual Placeholder - abstract code lines */}
            <div className="absolute inset-0 flex items-center justify-center opacity-40 group-hover:opacity-60 transition-opacity duration-500">
              <div className="w-full h-full opacity-20"></div>
              <CommandLineIcon className="w-32 h-32 text-indigo-500/20" />
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
              <h3 className="text-2xl font-medium text-white mb-2">Built for beauty</h3>
              <p className="text-[#8A8F98] leading-relaxed">
                Start with a prompt. AI generates complete React Native apps you can export and ship instantly.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="group relative h-[480px] rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-10" />

            {/* Visual Placeholder - Speed/Motion */}
            <div className="absolute inset-0 flex items-center justify-center opacity-40 group-hover:opacity-60 transition-opacity duration-500">
              <div className="absolute top-1/4 right-0 w-64 h-1 bg-gradient-to-l from-blue-500/50 to-transparent transform -rotate-12"></div>
              <div className="absolute top-1/3 right-10 w-48 h-1 bg-gradient-to-l from-blue-500/30 to-transparent transform -rotate-12"></div>
              <CpuChipIcon className="w-32 h-32 text-blue-500/20" />
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
              <h3 className="text-2xl font-medium text-white mb-2">Designed to move fast</h3>
              <p className="text-[#8A8F98] leading-relaxed">
                Chat with and edit your app in real-time.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="group relative h-[480px] rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-10" />

            {/* Visual Placeholder - Perfection/UI */}
            <div className="absolute inset-0 flex items-center justify-center opacity-40 group-hover:opacity-60 transition-opacity duration-500">
              <div className="grid grid-cols-2 gap-2 transform rotate-6">
                <div className="w-12 h-12 rounded bg-white/5 border border-white/10"></div>
                <div className="w-12 h-12 rounded bg-white/5 border border-white/10"></div>
                <div className="w-12 h-12 rounded bg-white/5 border border-white/10"></div>
                <div className="w-12 h-12 rounded bg-white/10 border border-white/20"></div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
              <h3 className="text-2xl font-medium text-white mb-2">Crafted to perfection</h3>
              <p className="text-[#8A8F98] leading-relaxed">
                Import your design tokens, components, assets, and instructions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GallerySection() {
  const EXAMPLES = [
    {
      name: "Flight Tracker",
      iframeSrc: "https://2eb2bc6a-4fe7-4595-a5a5-447af2542522.render.materializeui.com",
      publicLink: "https://materializeui.com/project/2eb2bc6a-4fe7-4595-a5a5-447af2542522"
    },
    {
      name: "Flight Tracker",
      iframeSrc: "https://2eb2bc6a-4fe7-4595-a5a5-447af2542522.render.materializeui.com",
      publicLink: "https://materializeui.com/project/2eb2bc6a-4fe7-4595-a5a5-447af2542522"
    },
    {
      name: "Flight Tracker",
      iframeSrc: "https://2eb2bc6a-4fe7-4595-a5a5-447af2542522.render.materializeui.com",
      publicLink: "https://materializeui.com/project/2eb2bc6a-4fe7-4595-a5a5-447af2542522"
    }
  ];

  return (
    <section className="py-24 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h2 className="text-3xl font-medium text-white mb-2">Built with Materialize</h2>
            <p className="text-[#8A8F98]">Explore what others are building.</p>
          </div>
          <Button variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-full text-sm h-8">
            View all examples
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {EXAMPLES.map((example, index) => (
            <a
              key={index}
              href={example.publicLink}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex flex-col gap-3 cursor-pointer"
            >
              <div className="aspect-[9/16] bg-[#141517] border border-white/10 rounded-2xl overflow-hidden relative transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-hover:shadow-white/5">
                <iframe
                  src={example.iframeSrc}
                  className="w-full h-full border-0 pointer-events-none"
                  title={example.name}
                  loading="lazy"
                />

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
                  <div className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-full transform scale-90 group-hover:scale-100 transition-transform duration-200">
                    View Project
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-base font-medium text-white/90 leading-tight truncate">{example.name}</h3>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const router = useRouter();

  const handleGetStarted = (productKey: string) => {
    handleCheckout(productKey, router);
  };

  const pricingPlans = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "For trying out Materialize",
      features: ["5 free projects", "15 free messages", "Fork projects for free"],
      cta: "Get Started",
      highlighted: false,
      productKey: "free",
    },
    {
      name: "Plus",
      price: "$25",
      period: "per month",
      description: "For everyone",
      features: ["Everything in Free", "100 credits a month included", "Additional credit packs available", "Unlimited projects", "Unlimited folders", "View, edit, and export Code"],
      cta: "Upgrade to Plus",
      highlighted: true,
      productKey: "plus",
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "For large teams",
      features: ["Everything in Pro", "Dedicated support", "Team collaboration", "SSO & Security", "Custom SLA"],
      cta: "Contact Sales",
      highlighted: false,
      productKey: "max",
    },
  ];

  return (
    <section className="py-32 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-medium text-white mb-4">Simple pricing</h2>
          <p className="text-[#8A8F98]">Start for free, scale as you grow.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pricingPlans.map((plan, index) => (
            <div
              key={index}
              className={`relative p-6 rounded-2xl flex flex-col ${plan.highlighted
                ? "bg-[#141517] border border-indigo-500/50 shadow-[0_0_40px_-10px_rgba(99,102,241,0.15)]"
                : "bg-transparent border border-white/10"
                }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
                  Sale
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-lg font-medium text-white">{plan.name}</h3>
                <p className="text-sm text-[#8A8F98] mt-1 h-10">{plan.description}</p>
              </div>

              <div className="mb-8 flex items-baseline gap-1">
                <span className="text-4xl font-medium text-white">{plan.price}</span>
                {plan.price !== "$0" && <span className="text-[#8A8F98] text-sm">{plan.period !== "" && "/"}{plan.period}</span>}
              </div>

              <Button
                onClick={() => handleGetStarted(plan.productKey)}
                className={`w-full h-10 rounded-full text-sm font-medium transition-all mb-8 ${plan.highlighted
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white/5 text-white hover:bg-white/10 border border-white/10"
                  }`}
              >
                {plan.cta}
              </Button>

              <div className="space-y-3 mt-auto">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-[#8A8F98]">
                    <CheckIcon className="w-4 h-4 text-white/40" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 border-t border-white/5 bg-[#0B0C0E] text-sm">
      <div className="container mx-auto px-6 max-w-6xl flex flex-col md:flex-row justify-between items-center text-[#8A8F98] gap-6">
        <div className="flex gap-6">
          <span className="hover:text-white cursor-pointer transition-colors">Twitter</span>
          <span className="hover:text-white cursor-pointer transition-colors">GitHub</span>
          <span className="hover:text-white cursor-pointer transition-colors">Discord</span>
        </div>
        <div className="flex gap-6">
          <span className="hover:text-white cursor-pointer transition-colors">Privacy</span>
          <span className="hover:text-white cursor-pointer transition-colors">Terms</span>
          <span>© 2025 Materialize Inc.</span>
        </div>
      </div>
    </footer>
  );
}
