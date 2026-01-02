"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useCreatePrototype } from "@/hooks/useCreatePrototype";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { captureUTMParams } from "@/lib/utils/analytics/utmTracking";
import { setChatIntent } from "@/lib/utils/chatIntentUtils";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { CheckIcon, SparklesIcon } from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Box,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Layers,
  Layout,
  Lock,
  MessageCircle,
  Music2,
  Palette,
  Play,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Star,
  ThumbsDown,
  ThumbsUp,
  Tv,
  Users,
  X,
  Zap
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { Suspense, useEffect, useState } from "react";

type PrototypeFramework = Database["public"]["Enums"]["prototype_framework"];

const DEFAULT_FRAMEWORK: PrototypeFramework = "mobile_expo_react_native";
const PLATFORM_OPTIONS: Array<{
  value: PrototypeFramework;
  label: string;
}> = [
    { value: "web_nextjs_react", label: "Web" },
    { value: "mobile_expo_react_native", label: "Mobile" },
  ];

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B0C0E] flex items-center justify-center">
          <div className="text-white/50">Loading...</div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams) {
      captureUTMParams(searchParams);
    }
  }, [searchParams]);

  return (
    <main className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
      <GridBackground forceDarkMode />

      <div className="relative z-10">
        <PremiumHeader forceDarkMode />

        <HeroSection />

        {/* Build Your Own Way */}
        <BuildYourOwnWaySection />

        {/* Section 1: Coding Agents & Design Systems */}
        <AgentsSection />

        {/* Teams Features */}
        <TeamsSection />

        {/* Section 2: Use Cases & Project Gallery */}
        <UseCasesSection />

        {/* Section 3: Infrastructure & Scale */}
        <InfrastructureSection />

        <VariantsSection />

        <PricingSection />
        <FAQSection />
        <div className="dark">
          <Footer />
        </div>
      </div>
    </main>
  );
}

/**
 * HERO SECTION
 */
function HeroSection() {
  const logger = useProductLogger();
  const { createPrototype } = useCreatePrototype();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const posthog = usePostHog();
  const [framework, setFramework] = useState<PrototypeFramework>(DEFAULT_FRAMEWORK);

  const isWebPrototypeEnabled = posthog?.isFeatureEnabled("web-prototype-support") ?? false;

  const handleSend = async () => {
    const content = prompt.trim();
    if (!content || isLoading) return;

    setIsLoading(true);
    logger.log({
      event: "client_landing_prompt_submitted",
      properties: { has_user: Boolean(user?.id), framework, source: "landing_hero" },
    });

    try {
      if (!user?.id) {
        setChatIntent(undefined, content, false);
        router.push("/login");
        return;
      }

      const result = await createPrototype({ framework, creation_source: "landing_prompt" });

      if (result.data) {
        setChatIntent(result.data.prototype_id, content, false);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        setShowUpsellModal(true);
      }
    } catch (err) {
      logger.debug("error", "Error creating prototype", { error: err });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="relative min-h-[80vh] flex flex-col justify-center px-6 py-20">
      <div className="container mx-auto max-w-5xl w-full text-center">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60 pb-2 mb-6">
          Build your ideas <br className="hidden md:block" /> fast
        </h1>
        <p className="text-lg md:text-xl text-[#8A8F98] max-w-2xl mx-auto mb-12">
          Go from prompt to production-ready web and mobile apps in minutes.
        </p>

        <div className="max-w-3xl mx-auto relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-blue-500/30 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative bg-[#141517] border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col focus-within:border-white/20">
            <div className="px-4 pt-4 flex gap-3">
              <SparklesIcon className="w-5 h-5 text-white/30 mt-1" />
              <Textarea
                placeholder="Describe the app you want to build..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                className="flex-1 bg-transparent text-lg text-white placeholder:text-white/30 border-none p-0 focus-visible:ring-0 resize-none min-h-[80px]"
              />
            </div>
            <div className="px-4 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-white/5 mt-2 pt-2 bg-white/[0.02]">
              <div className="flex gap-4 items-center">
                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Try:</span>
                <button onClick={() => setPrompt("Onboarding flow")} className="text-xs text-white/50 hover:text-white">Onboarding</button>
                <button onClick={() => setPrompt("Crypto Dashboard")} className="text-xs text-white/50 hover:text-white">Dashboard</button>
              </div>
              <div className="flex items-center gap-2">
                {isWebPrototypeEnabled && (
                  <Select value={framework} onValueChange={(v) => setFramework(v as PrototypeFramework)}>
                    <SelectTrigger className="h-9 w-32 border-white/10 bg-white/5 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#141517] border-white/10">
                      {PLATFORM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Button onClick={handleSend} disabled={!prompt.trim() || isLoading} size="sm" className="bg-white text-black hover:bg-white/90">
                  {isLoading ? "Generating..." : "Generate"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ProPlanUpsellModal open={showUpsellModal} onOpenChange={setShowUpsellModal} reason="prototype_creation_limit_reached" />
    </section>
  );
}

/**
 * BUILD YOUR OWN WAY SECTION
 */
function BuildYourOwnWaySection() {
  return (
    <section className="py-20 px-6 bg-[#0B0C0E]">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-4">
            Build your own way
          </h2>
          <p className="text-[#8A8F98] max-w-xl mx-auto">
            Choose your platform and bring your own tools for maximum flexibility.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Web */}
          <div className="bg-[#141517] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all group">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 border border-blue-500/20">
              <Layout className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">Web</h3>
            <p className="text-sm text-[#8A8F98] leading-relaxed">
              Build responsive web apps with Next.js, React, and modern frameworks.
            </p>
          </div>

          {/* Mobile */}
          <div className="bg-[#141517] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all group">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/20">
              <Smartphone className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">Mobile</h3>
            <p className="text-sm text-[#8A8F98] leading-relaxed">
              Create native iOS and Android apps with Expo and React Native.
            </p>
          </div>

          {/* Shared Design Systems */}
          <div className="bg-[#141517] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all group">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4 border border-purple-500/20">
              <Palette className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">Shared Design Systems</h3>
            <p className="text-sm text-[#8A8F98] leading-relaxed">
              Maintain consistent branding across all platforms with shared components.
            </p>
          </div>
        </div>

        {/* Bring Your Own Claude Code - Large Box */}
        <div className="relative bg-gradient-to-br from-[#D97757]/10 via-[#141517] to-[#141517] border border-[#D97757]/20 rounded-2xl p-8 md:p-10 overflow-hidden hover:border-[#D97757]/40 transition-all">
          {/* Subtle glow effect */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#D97757]/10 blur-[100px] rounded-full pointer-events-none"></div>

          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center gap-8">
            {/* Left side - Icon and content */}
            <div className="flex items-start gap-6 flex-1">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-[#D97757]/20 rounded-xl flex items-center justify-center border border-[#D97757]/30">
                  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-[#D97757]" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" clipRule="evenodd" d="M19.16 4.38H4.84V19.62H19.16V4.38ZM17.72 17.9L12 14.5L6.28 17.9V6.1H17.72V17.9Z" fill="currentColor" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-medium text-white mb-2">
                  Bring your own Claude Code
                </h3>
                <p className="text-[#8A8F98] leading-relaxed max-w-xl">
                  Already have a Claude Code subscription? Connect it to Nucleate for massive savings.
                </p>
              </div>
            </div>

            {/* Right side - Stats and benefits */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 lg:gap-8">
              <div className="text-center sm:text-left">
                <div className="text-3xl md:text-4xl font-bold text-[#D97757] mb-1">1000x</div>
                <div className="text-xs text-white/50 uppercase tracking-wider">more usage</div>
              </div>
              <div className="hidden sm:block w-px h-12 bg-white/10"></div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <CheckCircle2 className="w-4 h-4 text-[#D97757] flex-shrink-0" />
                  <span>Use your subscription or ours</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/70">
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

/**
 * VARIANTS MEGA-SECTION
 */
function VariantsSection() {
  const [activeTab, setActiveTab] = useState("refreshes");

  const tabs = [
    {
      id: "refreshes",
      label: "Refreshes",
      icon: <Layout className="w-4 h-4" />,
    },
    { id: "states", label: "States", icon: <Layers className="w-4 h-4" /> },
    { id: "paywalls", label: "Paywalls", icon: <Lock className="w-4 h-4" /> },
    {
      id: "onboarding",
      label: "User Flows",
      icon: <Smartphone className="w-4 h-4" />,
    },
  ];

  return (
    <section className="py-24 bg-black border-y border-white/5 relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        <div className="text-center mb-16 max-w-4xl mx-auto">
          <Badge
            variant="outline"
            className="mb-4 border-white/10 bg-white/5 text-zinc-300"
          >
            Infinite Exploration
          </Badge>
          <h2 className="text-4xl md:text-6xl font-medium text-white mb-6">
            Instant Variants.
            <span className="text-zinc-500 block text-2xl md:text-3xl mt-4 font-normal">
              Explore more ideas in 10 minutes than your team could in 2 weeks.
            </span>
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-300 border ${activeTab === tab.id
                ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                : "bg-zinc-900/50 text-zinc-400 border-white/5 hover:bg-zinc-800 hover:text-white"
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="relative min-h-[600px] bg-[#0F1012] rounded-3xl border border-white/10 p-4 md:p-8 overflow-hidden shadow-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="h-full w-full"
            >
              {/* DEMO CONTENT BASED ON TAB */}
              {activeTab === "refreshes" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 h-full items-start justify-center">
                  {/* Variant 1: Modern Minimal */}
                  <div className="aspect-[9/16] bg-white rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 relative group">
                    <div className="absolute top-4 left-6 right-6 flex justify-between items-center z-10">
                      <div className="w-8 h-8 bg-black/5 rounded-full backdrop-blur-sm" />
                      <div className="w-8 h-8 bg-black/5 rounded-full backdrop-blur-sm" />
                    </div>
                    <div className="h-2/3 bg-zinc-100 relative">
                      <div className="w-full h-full object-cover bg-zinc-200" />
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-zinc-900 mb-1">
                        Midnight City
                      </h3>
                      <p className="text-zinc-500 text-sm mb-6">
                        M83 • Hurry Up, We&apos;re Dreaming
                      </p>
                      <div className="flex justify-between items-center gap-4">
                        <div className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center">
                          <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-black border-b-[5px] border-b-transparent ml-0.5" />
                        </div>
                        <div className="h-1 flex-1 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full w-1/3 bg-black" />
                        </div>
                        <div className="text-xs font-mono text-zinc-400">
                          1:24
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Variant A: Minimal
                    </div>
                  </div>

                  {/* Variant 2: Dark Brutalist */}
                  <div className="aspect-[9/16] bg-[#121212] rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 relative group">
                    <div className="p-6 h-full flex flex-col">
                      <div className="flex justify-between items-center mb-8">
                        <div className="text-white font-mono text-xs">
                          NOW PLAYING
                        </div>
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      </div>
                      <div className="w-full aspect-square border-2 border-white/20 rounded-none mb-8 relative">
                        <div className="w-full h-full object-cover grayscale opacity-60 bg-zinc-600" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full border border-white flex items-center justify-center">
                            <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-white border-b-[8px] border-b-transparent ml-1" />
                          </div>
                        </div>
                      </div>
                      <h3 className="text-3xl font-black text-white leading-none mb-2 mix-blend-difference">
                        MIDNIGHT
                        <br />
                        CITY
                      </h3>
                      <p className="text-zinc-500 font-mono text-xs uppercase">
                        M83 / Hurry Up, We&apos;re Dreaming
                      </p>
                      <div className="mt-auto pt-8 border-t border-white/10 flex justify-between items-end">
                        <div className="text-4xl font-mono text-white/20">
                          01
                        </div>
                        <div className="h-16 w-32 flex items-end gap-1">
                          {[40, 70, 30, 80, 50, 90, 20, 60].map((h, i) => (
                            <div
                              key={i}
                              className="flex-1 bg-white"
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-zinc-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Variant B: Brutalist
                    </div>
                  </div>

                  {/* Variant 3: Glassmorphism */}
                  <div className="aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative group">
                    <div className="absolute inset-0">
                      <div className="w-full h-full object-cover opacity-60 blur-xl scale-125 bg-indigo-500" />
                      <div className="absolute inset-0 bg-black/20" />
                    </div>
                    <div className="relative z-10 p-6 h-full flex flex-col justify-end">
                      <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl mb-8 border border-white/10">
                        <div className="w-full h-full object-cover bg-indigo-400" />
                      </div>
                      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          Midnight City
                        </h3>
                        <p className="text-white/60 text-xs mb-4">M83</p>
                        <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-4">
                          <div className="h-full w-2/3 bg-white shadow-[0_0_10px_white]" />
                        </div>
                        <div className="flex justify-between px-4">
                          <div className="w-6 h-6 text-white/60">
                            <div className="w-full h-full border-b-2 border-l-2 border-current rotate-45 translate-x-1" />
                          </div>
                          <div className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center shadow-lg">
                            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-black border-b-[4px] border-b-transparent ml-0.5" />
                          </div>
                          <div className="w-6 h-6 text-white/60">
                            <div className="w-full h-full border-b-2 border-r-2 border-current -rotate-45 -translate-x-1" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-4 left-0 right-0 text-center text-[10px] text-white/50 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Variant C: Glassmorphism
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "states" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center justify-center h-full p-8">
                  {/* Empty State */}
                  <div className="bg-zinc-50 rounded-3xl p-8 aspect-[9/16] max-h-[500px] flex flex-col items-center justify-center text-center shadow-lg relative group">
                    <div className="bg-white p-6 rounded-full shadow-sm mb-6 relative">
                      <div className="w-16 h-16 text-zinc-300">
                        <Box className="w-full h-full" strokeWidth={1} />
                      </div>
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        +
                      </div>
                    </div>
                    <h3 className="text-zinc-900 font-semibold text-lg mb-2">
                      No Projects Yet
                    </h3>
                    <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
                      Create your first project to start tracking your tasks.
                    </p>
                    <div className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium text-sm shadow-xl shadow-zinc-200">
                      New Project
                    </div>
                    <div className="absolute top-4 left-0 right-0 text-center text-[10px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Empty State
                    </div>
                  </div>

                  {/* Loading State */}
                  <div className="bg-[#0F1012] rounded-3xl border border-zinc-800 p-6 aspect-[9/16] max-h-[500px] flex flex-col relative overflow-hidden group">
                    <div className="flex items-center justify-between mb-8">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
                      <div className="w-24 h-4 bg-zinc-800 rounded animate-pulse" />
                    </div>
                    <div className="space-y-6">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex gap-4">
                          <div className="w-12 h-12 rounded-xl bg-zinc-800 animate-pulse shrink-0" />
                          <div className="flex-1 space-y-2 py-1">
                            <div className="w-3/4 h-3 bg-zinc-800 rounded animate-pulse" />
                            <div className="w-1/2 h-3 bg-zinc-800/50 rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0F1012] via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-4 left-0 right-0 text-center text-[10px] text-zinc-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Loading State
                    </div>
                  </div>

                  {/* Error State */}
                  <div className="bg-white rounded-3xl p-8 aspect-[9/16] max-h-[500px] flex flex-col items-center justify-center relative shadow-xl overflow-hidden group">
                    <div className="absolute top-0 inset-x-0 h-1 bg-red-500" />
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 text-red-500">
                      <div className="w-10 h-10 border-4 border-red-500 rounded-full border-t-transparent animate-spin absolute opacity-20" />
                      <X className="w-8 h-8" />
                    </div>
                    <h3 className="text-zinc-900 font-bold text-xl mb-2">
                      Connection Failed
                    </h3>
                    <p className="text-zinc-500 text-sm mb-8 text-center px-4">
                      We couldn&apos;t load your feed. Please check your
                      internet connection.
                    </p>
                    <button className="flex items-center gap-2 px-6 py-2.5 bg-red-50 text-red-600 rounded-full font-medium text-sm hover:bg-red-100 transition-colors">
                      <RefreshCw className="w-4 h-4" /> Try Again
                    </button>
                    <div className="absolute top-4 left-0 right-0 text-center text-[10px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Error State
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "paywalls" && (
                <div className="flex gap-8 justify-center h-full items-center p-8">
                  {/* Variant 1: Dark Mode / Value Prop (Gymverse Scale) */}
                  <div className="w-[300px] aspect-[9/19] bg-slate-900 rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    {/* Status Bar */}
                    <div className="px-6 py-4 flex justify-between items-center text-white text-[10px] font-bold">
                      <span>9:41</span>
                      <div className="flex gap-1">
                        <div className="w-3 h-3 bg-white rounded-full opacity-20" />
                        <div className="w-4 h-2.5 border border-white/50 rounded-[2px]" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col px-6 relative z-10">
                      <div className="absolute top-4 right-6 text-white/50">
                        <X className="w-6 h-6" />
                      </div>

                      <div className="mt-4 mb-2 flex justify-center">
                        <div className="px-2 py-1 rounded bg-white text-slate-900 text-[10px] font-bold uppercase tracking-wider">
                          PRO
                        </div>
                      </div>

                      <h3 className="text-2xl font-bold text-center text-white leading-tight mb-6">
                        Workouts Made
                        <br />
                        Simple Every Day
                      </h3>

                      {/* Social Proof */}
                      <div className="flex justify-center items-center gap-2 mb-8">
                        <div className="flex -space-x-2">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="w-6 h-6 rounded-full bg-slate-700 border border-slate-900"
                            />
                          ))}
                        </div>
                        <div className="text-[10px] text-slate-300">
                          <span className="font-bold text-white">150K+</span>{" "}
                          5-Star Reviews
                        </div>
                      </div>

                      {/* Benefits List */}
                      <div className="space-y-4 mb-8">
                        {[
                          "Always know what to do at the gym",
                          "Improve with every workout",
                          "Stay motivated and consistent",
                        ].map((item, i) => (
                          <div
                            key={i}
                            className="flex gap-3 text-sm text-slate-200"
                          >
                            <Zap className="w-5 h-5 text-white shrink-0 fill-white" />
                            <span className="text-xs font-medium">{item}</span>
                          </div>
                        ))}
                      </div>

                      {/* Pricing Cards */}
                      <div className="mt-auto space-y-3 mb-4">
                        <div className="relative p-4 rounded-xl border-2 border-white bg-slate-800/50 cursor-pointer">
                          <div className="absolute -top-3 right-4 bg-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded">
                            BEST VALUE
                          </div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white font-bold text-sm">
                              Yearly Plan
                            </span>
                            <span className="text-white font-bold text-sm">
                              $119.99
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded">
                              7-day free trial
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              only $10.00/mo
                            </span>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-white/10 bg-slate-800/20 cursor-pointer flex justify-between items-center">
                          <span className="text-white font-medium text-sm">
                            Monthly
                          </span>
                          <span className="text-white font-medium text-sm">
                            $19.99
                          </span>
                        </div>

                        <button className="w-full py-3.5 rounded-full bg-yellow-400 text-black font-bold text-sm shadow-lg hover:bg-yellow-300 transition-colors mt-2">
                          START MY FREE TRIAL
                        </button>
                        <p className="text-[9px] text-center text-slate-500 mt-2">
                          No Payment Now. Cancel Anytime.
                        </p>
                      </div>
                    </div>

                    {/* Background Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-900 opacity-90 pointer-events-none" />
                  </div>

                  {/* Variant 2: Light Mode / Green Timeline */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans z-10 scale-105">
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex justify-center items-center gap-2 mb-4 text-green-600">
                        <CheckCircle2 className="w-4 h-4 fill-green-600 text-white" />
                        <span className="text-xs font-bold">
                          One-time offer applied
                        </span>
                      </div>

                      <h3 className="text-xl font-black text-center text-slate-900 mb-8">
                        Start your 7-day
                        <br />
                        FREE trial
                      </h3>

                      {/* Timeline */}
                      <div className="relative pl-4 space-y-8 mb-8">
                        {/* Line */}
                        <div className="absolute left-[27px] top-4 bottom-8 w-1 bg-gradient-to-b from-indigo-500 via-indigo-300 to-green-400 rounded-full" />

                        <div className="relative flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white z-10 shrink-0 shadow-lg">
                            <Lock className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              Today
                            </div>
                            <div className="text-xs text-slate-500 leading-snug">
                              Get instant access and see how it changes your
                              life.
                            </div>
                          </div>
                        </div>

                        <div className="relative flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center text-white z-10 shrink-0 shadow-lg">
                            <Bell className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              Day 5
                            </div>
                            <div className="text-xs text-slate-500 leading-snug">
                              We&apos;ll remind you with a notification that
                              your trial is ending.
                            </div>
                          </div>
                        </div>

                        <div className="relative flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white z-10 shrink-0 shadow-lg">
                            <Star className="w-4 h-4 fill-white" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              Day 7
                            </div>
                            <div className="text-xs text-slate-500 leading-snug">
                              You will be charged on Oct 17. Cancel anytime
                              before.
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Satisfaction */}
                      <div className="bg-slate-50 p-3 rounded-lg flex gap-3 items-center mb-auto">
                        <ShieldCheck className="w-8 h-8 text-green-500 fill-green-100" />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            100% Satisfaction Guaranteed
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Full refund anytime, no questions asked.
                          </div>
                        </div>
                      </div>

                      {/* Footer Price & CTA */}
                      <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">
                          Unlimited free access for 7 days, then
                        </p>
                        <p className="text-xs text-slate-900 font-bold mb-4">
                          <span className="line-through text-slate-400 font-normal">
                            $69.99
                          </span>{" "}
                          $39.99 per year{" "}
                          <span className="text-green-600">(save 43%)</span>
                        </p>

                        <button className="w-full py-4 rounded-xl bg-green-500 text-white font-bold text-base shadow-xl shadow-green-200 hover:bg-green-600 transition-colors">
                          Start my free trial now
                        </button>
                        <p className="text-[10px] text-slate-400 mt-3">
                          Skip this one-time offer
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Variant 3: Clean / Red CTA */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    <div className="p-6 flex flex-col h-full">
                      <div className="text-center mt-6 mb-8">
                        <h3 className="text-xl font-bold text-slate-900">
                          How does trial work?
                        </h3>
                      </div>

                      {/* Timeline Clean */}
                      <div className="relative pl-2 mb-8 space-y-6">
                        <div className="absolute left-[19px] top-2 bottom-6 w-0.5 bg-green-100" />

                        <div className="flex gap-4 relative">
                          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white shrink-0 z-10 border-4 border-white shadow-sm">
                            <Lock className="w-4 h-4" />
                          </div>
                          <div className="pt-1">
                            <div className="text-sm font-bold text-slate-900">
                              Today
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Unlock premium access. You don&apos;t have to pay
                              anything.
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-4 relative">
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white shrink-0 z-10 mx-1">
                            <Bell className="w-4 h-4" />
                          </div>
                          <div className="pt-1">
                            <div className="text-sm font-bold text-slate-900">
                              Day 5
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Get a notification reminder.
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-4 relative">
                          <div className="w-8 h-8 bg-white border-2 border-green-500 rounded-full flex items-center justify-center text-green-500 shrink-0 z-10 mx-1">
                            <Star className="w-4 h-4" />
                          </div>
                          <div className="pt-1">
                            <div className="text-sm font-bold text-slate-900">
                              Day 7
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Subscription starts. Cancel easily before this
                              date.
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-center mb-6">
                        <p className="text-xs text-slate-500">
                          Subscription starts at{" "}
                          <span className="font-bold text-slate-900">
                            $14.99 per month
                          </span>
                        </p>
                      </div>

                      {/* Toggle */}
                      <div className="bg-slate-100 p-4 rounded-xl flex justify-between items-center mb-6">
                        <span className="text-xs font-medium text-slate-700">
                          Unlock trial and reminder
                        </span>
                        <div className="w-10 h-6 bg-slate-300 rounded-full relative">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                        </div>
                      </div>

                      <div className="mt-auto">
                        <button className="w-full py-4 rounded-full bg-red-500 text-white font-bold text-sm shadow-xl shadow-red-100 hover:bg-red-600 transition-colors mb-3">
                          SUBSCRIBE NOW
                        </button>
                        <div className="flex justify-center">
                          <button className="text-[10px] font-bold text-slate-900">
                            Restore purchases
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 text-center mt-4 leading-relaxed">
                          Subscriptions renew automatically. Cancel at least 24
                          hours before the end.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "onboarding" && (
                <div className="flex gap-8 justify-center h-full items-center p-8">
                  {/* Screen 1: Survey (Source) */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    <div className="px-6 pt-2 pb-4">
                      <div className="flex items-center gap-4 mb-6">
                        <ChevronLeft className="w-6 h-6 text-slate-900" />
                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="w-1/4 h-full bg-slate-900" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 leading-tight mb-6">
                        Where did you hear about us?
                      </h3>
                    </div>

                    <div className="flex-1 px-4 overflow-y-auto no-scrollbar space-y-3 pb-20">
                      <div className="p-4 bg-slate-950 rounded-2xl flex items-center gap-4 text-white shadow-lg">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 flex items-center justify-center">
                          <Camera className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-medium text-sm">Instagram</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                          <Music2 className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-medium text-sm">TikTok</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                          <Tv className="w-4 h-4 text-slate-600" />
                        </div>
                        <span className="font-medium text-sm">TV</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                          <Users className="w-4 h-4 text-slate-600" />
                        </div>
                        <span className="font-medium text-sm">
                          Friend or family
                        </span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                          <MessageCircle className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-medium text-sm">Facebook</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                        <span className="font-medium text-sm">Youtube</span>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent">
                      <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl">
                        Continue
                      </button>
                    </div>
                  </div>

                  {/* Screen 2: Binary Choice (Experience) */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans scale-105 z-10">
                    <div className="px-6 pt-2 pb-4">
                      <div className="flex items-center gap-4 mb-6">
                        <ChevronLeft className="w-6 h-6 text-slate-900" />
                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="w-1/3 h-full bg-slate-900" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 leading-tight mb-2">
                        Have you tried other calorie tracking apps?
                      </h3>
                    </div>

                    <div className="flex-1 px-6 flex flex-col justify-center gap-4 -mt-20">
                      <div className="p-5 bg-black rounded-2xl flex items-center gap-4 text-white shadow-xl ring-2 ring-black ring-offset-2">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                          <ThumbsDown className="w-5 h-5 text-black" />
                        </div>
                        <span className="font-bold text-lg">No</span>
                      </div>
                      <div className="p-5 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900 opacity-60">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                          <ThumbsUp className="w-5 h-5 text-slate-900" />
                        </div>
                        <span className="font-bold text-lg">Yes</span>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl">
                        Continue
                      </button>
                      <div className="w-32 h-1 bg-slate-200 mx-auto mt-4 rounded-full" />
                    </div>
                  </div>

                  {/* Screen 3: Chart (Potential) */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    <div className="px-6 pt-2 pb-4">
                      <div className="flex items-center gap-4 mb-6">
                        <ChevronLeft className="w-6 h-6 text-slate-900" />
                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="w-1/2 h-full bg-slate-900" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 leading-tight mb-2">
                        You have great potential to crush your goal
                      </h3>
                    </div>

                    <div className="px-6 mt-4">
                      <div className="bg-slate-50 rounded-3xl p-6 relative overflow-hidden">
                        <h4 className="font-semibold text-slate-900 mb-6">
                          Your weight transition
                        </h4>

                        <div className="h-40 relative w-full">
                          {/* Chart Lines */}
                          <div className="absolute inset-x-0 bottom-8 h-px bg-slate-200 border-t border-dashed border-slate-300" />
                          <div className="absolute inset-x-0 bottom-24 h-px bg-slate-200 border-t border-dashed border-slate-300" />

                          {/* SVG Curve */}
                          <svg
                            className="absolute inset-0 w-full h-full overflow-visible"
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient
                                id="chartGradient"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#D4A373"
                                  stopOpacity="0.2"
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#D4A373"
                                  stopOpacity="0"
                                />
                              </linearGradient>
                            </defs>
                            <path
                              d="M 10 120 Q 80 110 120 70 T 230 20"
                              fill="none"
                              stroke="#A98467"
                              strokeWidth="2.5"
                            />
                            <path
                              d="M 10 120 Q 80 110 120 70 T 230 20 V 150 H 10 Z"
                              fill="url(#chartGradient)"
                            />

                            {/* Point 1 */}
                            <circle
                              cx="10"
                              cy="120"
                              r="4"
                              fill="white"
                              stroke="#333"
                              strokeWidth="2"
                            />
                            {/* Point 2 */}
                            <circle
                              cx="120"
                              cy="70"
                              r="4"
                              fill="white"
                              stroke="#333"
                              strokeWidth="2"
                            />
                            {/* Point 3 (Trophy) */}
                            <circle cx="230" cy="20" r="14" fill="#D4A373" />
                          </svg>
                          {/* Trophy Icon Overlay */}
                          <div className="absolute right-[1px] top-[9px]">
                            <Star className="w-3 h-3 text-white fill-white" />
                          </div>

                          {/* X Axis */}
                          <div className="absolute bottom-0 left-0 text-[10px] font-medium text-slate-500">
                            3 Days
                          </div>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
                            7 Days
                          </div>
                          <div className="absolute bottom-0 right-0 text-[10px] font-medium text-slate-500">
                            30 Days
                          </div>
                        </div>

                        <div className="mt-6 text-xs text-slate-500 leading-relaxed">
                          Based on historical data, weight gain is usually
                          delayed at first, but after 7 days, you can reach your
                          goal quickly!
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl">
                        Continue
                      </button>
                      <div className="w-32 h-1 bg-slate-200 mx-auto mt-4 rounded-full" />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/**
 * SECTION 1: INFRASTRUCTURE (Bento)
 */
function InfrastructureSection() {
  return (
    <section className="py-24 px-6 border-t border-white/5 bg-[#0B0C0E]">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-20">
          <Badge variant="outline" className="mb-4 border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
            Enterprise Grade
          </Badge>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight mb-6">
            Everything you need to scale <br /> <span className="text-white/40">Built in.</span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Stop stitching together platforms. Nucleate gives you enterprise-grade backend infrastructure including hosting, databases, integrations and more.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[240px]">
          {/* Databases - Wide Card */}
          <div className="md:col-span-8 md:row-span-2 bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-white/20 transition-all">
            <div className="relative z-10 flex flex-col h-full">
              <div className="mb-auto">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-6 border border-blue-500/20">
                  <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <h3 className="text-2xl font-medium mb-3 text-white">Integrated with your own database</h3>
                <p className="text-zinc-400 max-w-md text-sm leading-relaxed">
                  Connect to your existing database or automatic integration with Supabase with one-click.
                </p>
              </div>

              {/* Database Visual */}
              <div className="mt-8 relative h-64 w-full bg-[#0B0C0E] rounded-xl border border-white/5 overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_24px]"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full max-w-sm space-y-3 p-6 font-mono text-xs">
                    <div className="flex gap-8 text-zinc-500 border-b border-white/5 pb-2">
                      <span className="w-24">id</span>
                      <span className="w-32">user_email</span>
                      <span className="flex-1">status</span>
                    </div>
                    {[
                      { id: "user_2xJ89...", email: "alex@example.com", status: "active", color: "text-emerald-400" },
                      { id: "user_9kL22...", email: "sarah@design.io", status: "pro", color: "text-purple-400" },
                      { id: "user_1mN44...", email: "mike@startup.co", status: "offline", color: "text-zinc-500" },
                    ].map((row, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 + 0.2 }}
                        className="flex gap-8 items-center"
                      >
                        <span className="w-24 text-zinc-400">{row.id}</span>
                        <span className="w-32 text-zinc-300">{row.email}</span>
                        <span className={`flex-1 ${row.color} px-2 py-0.5 bg-white/5 rounded w-fit`}>{row.status}</span>
                      </motion.div>
                    ))}
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="h-6 w-32 bg-blue-500/20 rounded animate-pulse"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* User Auth - Tall Card */}
          <div className="md:col-span-4 md:row-span-2 bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-white/20 transition-all">
            <div className="relative z-10 h-full flex flex-col">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 border border-emerald-500/20">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-medium mb-3 text-white">Auth & User Management</h3>
              <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                Enterprise-ready authentication with social logins, MFA, and user management built-in.
              </p>

              <div className="mt-auto relative">
                <div className="bg-[#0B0C0E] border border-white/5 rounded-2xl p-4 shadow-2xl">
                  <div className="flex gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500" />
                    <div>
                      <div className="h-2 w-24 bg-white/10 rounded mb-2" />
                      <div className="h-2 w-16 bg-white/10 rounded" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-8 w-full bg-white/5 rounded border border-white/5 flex items-center px-3 text-[10px] text-zinc-500">Sign in with Google</div>
                    <div className="h-8 w-full bg-white/5 rounded border border-white/5 flex items-center px-3 text-[10px] text-zinc-500">Sign in with GitHub</div>
                  </div>
                </div>
                {/* Floating Elements */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -top-6 -right-2 bg-[#1A1B1E] p-2 rounded-lg border border-emerald-500/30 text-emerald-400 shadow-xl"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </motion.div>
              </div>
            </div>
            {/* Background Gradient */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 blur-[80px]" />
          </div>

          {/* Hosting */}
          <div className="md:col-span-5 md:row-span-1 bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-white/20 transition-all">
            <div className="flex flex-col h-full justify-between relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-medium text-white mb-1">Global Edge Hosting</h3>
                  <p className="text-zinc-500 text-xs">Deploy instantly to 35+ regions</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] text-zinc-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> us-east
                </div>
                <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] text-zinc-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> eu-west
                </div>
                <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] text-zinc-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> asia-pac
                </div>
              </div>
            </div>
            <div className="absolute right-0 bottom-0 w-64 h-64 bg-green-500/5 blur-[80px]" />
          </div>

          {/* SEO Performance */}
          <div className="md:col-span-4 md:row-span-1 bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-white/20 transition-all flex items-center gap-6">
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" className="text-white/5" fill="none" />
                <motion.circle
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  cx="40" cy="40" r="36"
                  stroke="#3B82F6" strokeWidth="6"
                  fill="none"
                  strokeDasharray="1000"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-2xl font-bold text-white">100</span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-white mb-1">Perfect SEO</h3>
              <p className="text-zinc-500 text-xs leading-relaxed">
                Server-side rendering and automatic meta tags ensure you rank #1.
              </p>
            </div>
          </div>

          {/* Analytics */}
          <div className="md:col-span-3 md:row-span-1 bg-[#141517] border border-white/10 rounded-3xl p-6 flex flex-col justify-center relative overflow-hidden text-center group hover:border-white/20 transition-all">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent" />
            <BarChart3 className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
            <h3 className="text-white font-medium">Built-in Analytics</h3>
            <p className="text-zinc-500 text-xs mt-1">Privacy focused</p>
          </div>
        </div>

        <div className="mt-20 pt-10 border-t border-white/5 text-center">
          <p className="text-lg font-medium text-zinc-400 max-w-2xl mx-auto">
            Nucleate gives you everything you need inside one familiar interface—no extra accounts, no steep learning curve.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * SECTION 2: CODING AGENTS (Bento)
 */
function AgentsSection() {
  return (
    <section className="py-24 px-6 bg-[#0B0C0E]">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-medium tracking-tight mb-4">
            Empowering product builders <br /> <span className="text-white/40">with the most powerful coding agents</span>
          </h2>
          <p className="text-[#8A8F98] max-w-2xl mx-auto">
            Nucleate does the heavy lifting for you, so you can focus on your vision instead of fighting errors.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Agent Switcher */}
          <div className="bg-[#141517] border border-white/10 rounded-3xl p-8 flex flex-col md:flex-row gap-8 items-center">
            <div className="flex-1">
              <h3 className="text-lg font-medium mb-3">Always the best, without switching tools</h3>
              <p className="text-sm text-[#8A8F98] leading-relaxed">
                Nucleate integrates the frontier coding agents from the AI labs directly inside one familiar visual interface.
                No more AI anxiety or juggling multiple platforms.
              </p>
            </div>
            <div className="w-full md:w-64 bg-black/40 border border-white/5 rounded-2xl p-2 space-y-1">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-[#D97757]/20 rounded flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-[#D97757]" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.5 19C19.9853 19 22 16.9853 22 14.5C22 12.132 20.177 10.211 17.86 10.015C17.472 6.64 14.628 4 11.12 4C7.23 4 4.09 6.84 3.56 10.6C1.55 11.16 0 13.06 0 15.5C0 18.5376 2.46243 21 5.5 21H17.5C19.9853 21 22 18.9853 22 16.5C22 14.0147 19.9853 12 17.5 12" fill="currentColor" fillOpacity="0" />
                      <path d="M12 4C14 4 15.8 4.8 17 6.1C18.2 4.8 20 4 22 4C24.2 4 26 5.8 26 8C26 10.2 24.2 12 22 12C21.4 12 20.8 11.9 20.3 11.7C19.8 13.6 18.1 15 16 15H8C5.8 15 4 13.2 4 11C4 8.8 5.8 7 8 7C8.6 7 9.1 7.1 9.6 7.4C10.2 5.4 12 4 14 4" fill="currentColor" style={{ display: 'none' }} />
                      <g transform="translate(4,4) scale(0.66)">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM4.5 9.5H19.5V14.5H4.5V9.5Z" fill="currentColor" />
                      </g>
                      {/* Anthropic Logo Reconstruction */}
                      <path fillRule="evenodd" clipRule="evenodd" d="M19.16 4.38H4.84V19.62H19.16V4.38ZM17.72 17.9L12 14.5L6.28 17.9V6.1H17.72V17.9Z" fill="currentColor" />
                    </svg>
                  </div>
                  <span className="text-sm">Claude Code</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 opacity-40">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-white" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.28 9.82a5.98 5.98 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.51-2.9A6.06 6.06 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9 6.06 6.06 0 0 0 10.29-2.18 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.1Zm-9 11.23a4.05 4.05 0 0 1-3.6-2.31l.14-.14 3.42-5.91h2.93l-2.07 7.7a4.07 4.07 0 0 1-.82.66Zm5.94-3.58a4.06 4.06 0 0 1-3.37 1.25l-2.07-7.7 5.09-2.93.9 3.06a4.07 4.07 0 0 1-.55 6.32Zm-4.82-13.3a4.05 4.05 0 0 1 3.6 2.31l-.14.15-3.42 5.9h-2.93l2.08-7.7a4.07 4.07 0 0 1 .81-.66Zm-5.94 3.58a4.06 4.06 0 0 1 3.37-1.25l2.07 7.7-5.09 2.93-.9-3.06a4.07 4.07 0 0 1 .55-6.32ZM3.1 11.45A4.06 4.06 0 0 1 8.24 9l-2.07 7.7h-3.95l-.15-.43a4.07 4.07 0 0 1 1.03-4.82Zm17.8 1.1a4.06 4.06 0 0 1-5.14 2.44l2.07-7.7h3.95l.15.43a4.07 4.07 0 0 1-1.03 4.83Z" fill="currentColor" />
                    </svg>
                  </div>
                  <span className="text-sm">Codex</span>
                </div>
                <span className="text-[10px] uppercase font-bold text-white/40">coming soon</span>
              </div>
              <div className="flex items-center justify-between p-3 opacity-40">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-blue-400" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L14.4 9.6C14.7 10.5 15.5 11.3 16.4 11.6L24 14L16.4 16.4C15.5 16.7 14.7 17.5 14.4 18.4L12 26L9.6 18.4C9.3 17.5 8.5 16.7 7.6 16.4L0 14L7.6 11.6C8.5 11.3 9.3 10.5 9.6 9.6L12 2Z" fill="currentColor" transform="translate(0, -2) scale(0.9)" />
                      <path d="M18 18L19.2 21.6C19.35 22.05 19.95 22.05 20.1 21.6L21.3 18L24.9 16.8C25.35 16.65 25.35 16.05 24.9 15.9L21.3 14.7L20.1 11.1C19.95 10.65 19.35 10.65 19.2 11.1L18 14.7L14.4 15.9C13.95 16.05 13.95 16.65 14.4 16.8L18 18Z" fill="currentColor" transform="translate(0, 0) scale(0.8)" opacity="0.6" />
                    </svg>
                  </div>
                  <span className="text-sm">Gemini</span>
                </div>
                <span className="text-[10px] uppercase font-bold text-white/40">coming soon</span>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[#141517] border border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
              <span className="text-6xl font-bold mb-2">98%</span>
              <span className="text-sm text-white/60 uppercase font-bold tracking-widest mb-4">less errors</span>
              <p className="text-sm text-white/70 max-w-sm leading-relaxed">
                Nucleate automatically tests, refactors, and iterates reducing errors so you keep building instead of fixing.
              </p>
            </div>
            <div className="bg-[#141517] border border-white/10 rounded-3xl p-8 flex flex-col relative overflow-hidden min-h-[300px]">
              <div className="relative z-10 mb-8">
                <h3 className="text-lg font-bold text-white mb-3">Build big without breaking</h3>
                <p className="text-sm text-white/70 leading-relaxed">
                  Nucleate handles projects 1,000 times larger than before. Its improved built-in context management can handle complexity and keep your projects running smoothly.
                </p>
              </div>

              {/* Visual */}
              <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#141517] to-transparent z-10"></div>
              <div className="absolute bottom-0 left-4 right-4 h-48 opacity-50 flex gap-2 transform translate-y-12">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-t-lg"></div>
                <div className="flex-[2] bg-white/5 border border-white/10 rounded-t-lg relative flex items-center justify-center">
                  <span className="text-5xl font-bold text-white/20">1000x</span>
                </div>
                <div className="flex-1 bg-white/5 border border-white/10 rounded-t-lg"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Design System Card */}
        <div className="bg-gradient-to-b from-[#141517] to-black border border-white/10 rounded-3xl p-12 overflow-hidden relative group">
          <div className="text-center mb-12">
            <div className="flex justify-center gap-1 mb-6">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <div className="w-2 h-2 rounded-full bg-pink-500"></div>
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            </div>
            <h3 className="text-3xl font-medium mb-4">Build with <span className="text-indigo-400">your</span> design system</h3>
            <p className="text-[#8A8F98]">Stop building from scratch. Start building on-brand.</p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 items-center opacity-80 group-hover:opacity-100 transition-opacity">
            <div className="space-y-6">
              <div className="flex gap-4 items-center">
                <div className="w-10 h-6 bg-white/5 rounded-full relative border border-white/10">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-indigo-500 rounded-full"></div>
                </div>
                <div className="flex gap-2">
                  <div className="w-4 h-4 bg-indigo-500 rounded-sm"></div>
                  <div className="w-4 h-4 border border-white/20 rounded-sm"></div>
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-xs font-mono text-white/40">
                .button {'{'} <br />
                &nbsp;&nbsp;radius: 12px;<br />
                &nbsp;&nbsp;shadow: var(--lg);<br />
                {'}'}
              </div>
            </div>
            <div className="flex justify-center gap-4">
              <div className="w-16 h-16 bg-teal-400 rounded-xl"></div>
              <div className="w-16 h-16 bg-indigo-600 rounded-xl"></div>
              <div className="w-16 h-16 bg-orange-300 rounded-xl"></div>
            </div>
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Headline Lg</h1>
              <h2 className="text-xl font-semibold opacity-60">Headline Md</h2>
              <h3 className="text-lg opacity-40">Headline Sm</h3>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * TEAMS SECTION
 */
function TeamsSection() {
  return (
    <section className="py-24 px-6 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-medium text-white/70 uppercase tracking-widest">Built for Teams</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-medium tracking-tight mb-4">
            Build together <span className="text-white/40">in real-time</span>
          </h2>
          <p className="text-[#8A8F98] max-w-2xl mx-auto">
            Live collaboration, shared design systems, and internal tools for teams of any size.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Live Collaboration Card */}
          <div className="bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
            <div className="relative z-10 mb-8">
              <h3 className="text-lg font-bold text-white mb-3">Real-time collaboration</h3>
              <p className="text-sm text-white/70 leading-relaxed">
                See teammates&apos; cursors, chat in-context, and build together simultaneously.
              </p>
            </div>
            {/* Visual: Multiple cursors with avatars */}
            <div className="relative h-32">
              <div className="absolute left-8 top-4 flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">S</div>
                <div className="w-0 h-0 border-l-[6px] border-l-indigo-500 border-y-[4px] border-y-transparent"></div>
              </div>
              <div className="absolute right-12 top-12 flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center text-[10px] font-bold text-white">A</div>
                <div className="w-0 h-0 border-l-[6px] border-l-pink-500 border-y-[4px] border-y-transparent"></div>
              </div>
              <div className="absolute left-1/3 bottom-4 flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white">M</div>
                <div className="w-0 h-0 border-l-[6px] border-l-emerald-500 border-y-[4px] border-y-transparent"></div>
              </div>
              {/* Chat bubble */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="absolute right-4 bottom-8 bg-white/10 backdrop-blur rounded-lg px-3 py-2 text-xs text-white/80"
              >
                Looks great!
              </motion.div>
            </div>
          </div>

          {/* Shared Design Systems Card */}
          <div className="bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
            <div className="relative z-10 mb-8">
              <h3 className="text-lg font-bold text-white mb-3">One design system, every project</h3>
              <p className="text-sm text-white/70 leading-relaxed">
                Create and share component libraries, color palettes, and typography across your team&apos;s projects.
              </p>
            </div>
            {/* Visual: Design system components */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <div className="w-4 h-4 rounded bg-indigo-500"></div>
                <span className="text-xs text-white/60">Primary</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <div className="w-4 h-4 rounded bg-pink-500"></div>
                <span className="text-xs text-white/60">Accent</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <Box className="w-4 h-4 text-white/40" />
                <span className="text-xs text-white/60">Button</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <Layout className="w-4 h-4 text-white/40" />
                <span className="text-xs text-white/60">Card</span>
              </div>
              <div className="mt-4 w-full text-center">
                <span className="text-xs text-white/40">Shared across 12 projects</span>
              </div>
            </div>
          </div>

          {/* Internal Tools Card */}
          <div className="bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
            <div className="relative z-10 mb-8">
              <h3 className="text-lg font-bold text-white mb-3">Internal tools in minutes</h3>
              <p className="text-sm text-white/70 leading-relaxed">
                Build dashboards, admin panels, and workflows for your team without engineering sprints.
              </p>
            </div>
            {/* Visual: Admin dashboard mockup */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded">INTERNAL</div>
                <span className="text-xs text-white/40">Team Dashboard</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 rounded p-2">
                  <div className="text-lg font-bold text-white">248</div>
                  <div className="text-[10px] text-white/40">Active users</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-lg font-bold text-white">12</div>
                  <div className="text-[10px] text-white/40">Projects</div>
                </div>
                <div className="bg-white/5 rounded p-2">
                  <div className="text-lg font-bold text-white">99%</div>
                  <div className="text-[10px] text-white/40">Uptime</div>
                </div>
              </div>
            </div>
          </div>

          {/* Team Management Card */}
          <div className="bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
            <div className="relative z-10 mb-8">
              <h3 className="text-lg font-bold text-white mb-3">Scale from 2 to 200</h3>
              <p className="text-sm text-white/70 leading-relaxed">
                Workspaces, permissions, SSO, and audit logs. Enterprise-ready from day one.
              </p>
            </div>
            {/* Visual: Team members with roles */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">JD</div>
                <div className="flex-1">
                  <div className="text-sm text-white">Jane Doe</div>
                  <div className="text-[10px] text-white/40">Owner</div>
                </div>
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-xs font-bold text-white">AS</div>
                <div className="flex-1">
                  <div className="text-sm text-white">Alex Smith</div>
                  <div className="text-[10px] text-white/40">Admin</div>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3 opacity-60">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-xs font-bold text-white">+5</div>
                <div className="flex-1">
                  <div className="text-sm text-white/60">5 more members...</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * SECTION 3: USE CASES (Roles & Gallery)
 */
/**
 * SECTION 3: USE CASES (Roles & Gallery)
 */
function UseCasesSection() {
  const categories = [
    { label: "Landing page", icon: <Layout className="w-4 h-4 text-pink-500" />, color: "from-pink-500/20" },
    { label: "Dashboard", icon: <BarChart3 className="w-4 h-4 text-blue-500" />, color: "from-blue-500/20" },
    { label: "Mobile", icon: <Smartphone className="w-4 h-4 text-orange-500" />, color: "from-orange-500/20" },
    { label: "Portfolio", icon: <Palette className="w-4 h-4 text-teal-500" />, color: "from-teal-500/20" },
    { label: "E-commerce", icon: <ShoppingBag className="w-4 h-4 text-purple-500" />, color: "from-purple-500/20" },
    { label: "Productivity", icon: <Zap className="w-4 h-4 text-yellow-500" />, color: "from-yellow-500/20" },
  ];

  return (
    <section className="py-24 px-6 border-t border-white/5 bg-[#0B0C0E]">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-6xl font-medium tracking-tight mb-6">
            Whatever your role <br /> <span className="text-white/40">Nucleate gives you superpowers</span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
            From idea to live product, Nucleate adapts to the way you work turning every vision into something real & fast.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-24">
          {/* Product Managers - Large Card */}
          <RoleCard
            title="Product Managers"
            desc="Go from insight to prototype instantly. Visualize requirements and get team buy-in faster than ever."
            gradient="from-indigo-500/10 to-blue-500/5"
            border="hover:border-indigo-500/30"
            className="md:col-span-2"
            ui={
              <div className="relative h-full w-full flex flex-col justify-center px-8">
                <div className="flex items-center gap-8 mb-4">
                  <div className="flex-1 space-y-3 opacity-50 scale-95 origin-right">
                    <div className="h-2 w-2/3 bg-white/10 rounded-full" />
                    <div className="h-2 w-full bg-white/10 rounded-full" />
                    <div className="h-2 w-1/2 bg-white/10 rounded-full" />
                  </div>
                  <div className="text-zinc-500">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                  <div className="flex-1 bg-[#0B0C0E] border border-white/10 rounded-lg p-3 shadow-xl">
                    <div className="flex gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-red-500/50" />
                      <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                      <div className="w-2 h-2 rounded-full bg-green-500/50" />
                    </div>
                    <div className="flex item-center justify-center py-2">
                      <div className="w-8 h-8 rounded bg-indigo-500/20 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-indigo-400" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 px-2">
                  <span>PRD Document</span>
                  <span>Interactive Prototype</span>
                </div>
              </div>
            }
          />

          {/* Agencies - Large Card */}
          <RoleCard
            title="Agencies"
            desc="Multiply your impact: deliver more projects, faster, without scaling headcount."
            gradient="from-orange-500/10 to-rose-500/5"
            border="hover:border-orange-500/30"
            className="md:col-span-2"
            ui={
              <div className="relative w-full h-full flex flex-col justify-center items-center px-4">
                <div className="flex gap-4 relative">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="w-20 h-28 bg-[#1A1B1E] border border-white/10 rounded-xl shadow-lg relative flex flex-col items-center justify-center p-2"
                      style={{
                        transform: `rotate(${i % 2 === 0 ? 0 : 3}deg) translateY(${i % 2 === 0 ? 0 : -5}px)`,
                        zIndex: i
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-white/5 mb-3" />
                      <div className="w-12 h-1.5 bg-white/10 rounded-full mb-1" />
                      <div className="w-8 h-1.5 bg-white/5 rounded-full" />
                      {i === 3 && (
                        <div className="absolute -top-3 -right-3 w-6 h-6 bg-green-500 rounded-full border-4 border-[#1A1B1E] flex items-center justify-center shadow-lg">
                          <CheckIcon className="w-3 h-3 text-black stroke-[3px]" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-zinc-400 font-mono tracking-wide">3 PROJECTS SHIPPED</span>
                </div>
              </div>
            }
          />

          {/* Marketers - Expanded to 2 Cols */}
          <RoleCard
            title="Marketers"
            desc="Spin up high-performing landing pages with SEO built-in, no devs needed."
            gradient="from-pink-500/10 to-purple-500/5"
            border="hover:border-pink-500/30"
            className="md:col-span-2"
            ui={
              <div className="relative h-full w-full flex items-center justify-center gap-6 px-4">
                {/* Google Search Result Mock */}
                <div className="flex-1 bg-[#1A1B1E] rounded-lg border border-white/10 p-4 max-w-[240px] shadow-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full bg-pink-500/20 flex items-center justify-center text-[8px] text-pink-500">Ad</div>
                    <div className="h-1.5 w-24 bg-white/10 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-3/4 bg-blue-400/20 rounded-sm" />
                    <div className="h-1.5 w-full bg-white/5 rounded-full" />
                    <div className="h-1.5 w-2/3 bg-white/5 rounded-full" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <div className="px-2 py-1 rounded bg-white/5 border border-white/5 flex items-center gap-1">
                      <Star className="w-2 h-2 text-yellow-500 fill-yellow-500" />
                      <span className="text-[8px] text-white/50">4.9</span>
                    </div>
                    <div className="px-2 py-1 rounded bg-green-500/10 border border-green-500/20 flex items-center gap-1">
                      <span className="text-[8px] text-green-400">98/100 SEO</span>
                    </div>
                  </div>
                </div>

                {/* Graph */}
                <div className="hidden md:flex flex-col items-center justify-end h-24 gap-1">
                  <div className="flex items-end gap-1 h-16">
                    <motion.div initial={{ height: 10 }} whileInView={{ height: 40 }} transition={{ delay: 0.2 }} className="w-4 bg-pink-500/20 rounded-t-sm" />
                    <motion.div initial={{ height: 15 }} whileInView={{ height: 50 }} transition={{ delay: 0.3 }} className="w-4 bg-pink-500/40 rounded-t-sm" />
                    <motion.div initial={{ height: 12 }} whileInView={{ height: 60 }} transition={{ delay: 0.4 }} className="w-4 bg-pink-500/60 rounded-t-sm" />
                    <motion.div initial={{ height: 20 }} whileInView={{ height: 80 }} transition={{ delay: 0.5 }} className="w-4 bg-pink-500 rounded-t-sm relative">
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-white text-pink-600 text-[8px] font-bold px-1 rounded shadow-sm">+40%</div>
                    </motion.div>
                  </div>
                </div>
              </div>
            }
          />

          {/* Designers - Large Card */}
          <RoleCard
            title="Designers"
            desc="Turn your Figma files into pixel-perfect reality instantly. No more handoff friction."
            gradient="from-purple-500/10 to-pink-500/5"
            border="hover:border-purple-500/30"
            className="md:col-span-2"
            ui={
              <div className="relative h-full w-full flex items-center justify-center gap-4 md:gap-8 px-4">
                {/* Figma Side */}
                <div className="w-24 h-32 border-2 border-purple-500/20 rounded-lg bg-[#1A1B1E] relative flex flex-col items-center justify-center gap-2 overflow-hidden shadow-lg group-hover:border-purple-500/40 transition-colors">
                  <div className="absolute top-0 left-0 w-full h-4 bg-white/5 border-b border-white/5 flex items-center px-2 gap-1">
                    <div className="w-1 h-1 rounded-full bg-white/20" />
                    <div className="w-1 h-1 rounded-full bg-white/20" />
                  </div>
                  <Palette className="w-6 h-6 text-purple-500" />
                  <div className="h-1 w-12 bg-purple-500/20 rounded-full" />
                  <div className="h-1 w-8 bg-purple-500/20 rounded-full" />
                </div>

                {/* Magic Arrow */}
                <div className="flex flex-col items-center gap-1 text-purple-400/50">
                  <motion.div
                    animate={{ x: [0, 5, 0], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Zap className="w-4 h-4" />
                  </motion.div>
                  <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
                </div>

                {/* Code Side */}
                <div className="w-24 h-32 border-2 border-blue-500/20 rounded-lg bg-[#1A1B1E] relative flex flex-col p-3 gap-2 overflow-hidden shadow-lg group-hover:border-blue-500/40 transition-colors">
                  <div className="absolute top-0 left-0 w-full h-4 bg-blue-500/10 border-b border-blue-500/10 flex items-center px-2">
                    <span className="text-[6px] font-mono text-blue-300">react.tsx</span>
                  </div>
                  <div className="mt-2 space-y-1.5 opacity-80">
                    <div className="flex gap-1 mb-1"><span className="text-pink-400 text-[6px]">const</span> <span className="text-blue-300 text-[6px]">App</span></div>
                    <div className="ml-2 h-1 w-12 bg-white/10 rounded-full" />
                    <div className="ml-2 h-1 w-8 bg-white/10 rounded-full" />
                    <div className="ml-2 h-1 w-10 bg-white/10 rounded-full" />
                  </div>
                </div>
              </div>
            }
          />

          {/* Entrepreneurs - Expanded to 2 Cols */}
          <RoleCard
            title="Entrepreneurs"
            desc="Launch a full business in days, not months."
            gradient="from-emerald-500/10 to-teal-500/5"
            border="hover:border-emerald-500/30"
            className="md:col-span-2"
            ui={
              <div className="relative h-full w-full flex flex-row justify-around items-center px-8">
                <div className="relative group/btn cursor-pointer">
                  <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 group-hover/btn:opacity-40 transition-opacity" />
                  <div className="bg-[#1A1B1E] border border-emerald-500/30 rounded-xl px-8 py-4 flex items-center gap-3 relative z-10 group-hover/btn:scale-105 transition-transform">
                    <Zap className="w-5 h-5 text-emerald-400 fill-emerald-400" />
                    <span className="text-base font-bold text-white tracking-wide">LAUNCH STARTUP</span>
                  </div>
                </div>
                <div className="flex flex-col items-center pl-8 border-l border-white/10">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Time to revenue</span>
                  <span className="text-2xl font-mono text-white">48h</span>
                </div>
              </div>
            }
          />

          {/* Students & Builders - Expanded to 2 Cols */}
          <RoleCard
            title="Students & Builders"
            desc="Take ideas from class or side projects and turn them into working apps."
            gradient="from-blue-500/10 to-indigo-500/5"
            border="hover:border-blue-500/30"
            className="md:col-span-2"
            ui={
              <div className="relative h-full w-full flex flex-col items-center justify-center">
                <div className="w-full max-w-[320px] bg-[#1A1B1E] rounded-lg border border-white/10 p-3 pt-6 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 right-0 h-6 bg-white/5 border-b border-white/5 flex items-center px-3 gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500/40" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/40" />
                    <div className="w-2 h-2 rounded-full bg-green-500/40" />
                    <div className="ml-4 text-[8px] font-mono text-white/20">index.tsx</div>
                  </div>
                  <div className="font-mono text-[10px] space-y-1.5 p-2">
                    <div className="flex gap-2">
                      <span className="text-pink-400">export default</span>
                      <span className="text-blue-400">function</span>
                      <span className="text-yellow-200">App()</span>
                      <span className="text-zinc-500">{"{"}</span>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="pl-4 text-zinc-400"
                    >
                      {/* // Turn this homework into a startup */}
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="pl-4 text-white"
                    >
                      <span className="text-blue-400">return</span> <span className="text-green-400">&quot;Hello World&quot;</span>;
                    </motion.div>
                    <div className="text-zinc-500">{"}"}</div>
                  </div>
                </div>
              </div>
            }
          />
        </div>

        <div className="space-y-12">
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-2xl font-medium text-white/90">You can build literally anything</h3>
            <div className="h-1 w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {categories.map((cat, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -5 }}
                className={`bg-gradient-to-br ${cat.color} to-[#141517] border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 hover:border-white/30 transition-all cursor-pointer group`}
              >
                <div className="w-12 h-12 rounded-2xl bg-black/40 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner border border-white/5">
                  {cat.icon}
                </div>
                <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">{cat.label}</span>
              </motion.div>
            ))}
          </div>
          <div className="flex justify-center mt-12">
            <Button variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 rounded-full px-8 py-6 text-sm">
              See all community projects
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoleCard({ title, desc, ui, gradient, border, className = "" }: { title: string; desc: string; ui: React.ReactNode; gradient: string; border: string; className?: string; }) {
  return (
    <div className={`bg-[#141517] border border-white/10 rounded-3xl p-1 overflow-hidden group hover:border-white/20 transition-all relative ${className}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="bg-[#141517] rounded-[22px] p-6 h-full flex flex-col relative z-10">
        <div className="mb-6 flex-1 w-full flex items-center justify-center bg-[#0B0C0E] rounded-2xl border border-white/5 overflow-hidden min-h-[140px]">
          {ui}
        </div>
        <div className="mt-auto">
          <h3 className="text-xl font-medium text-white mb-2">{title}</h3>
          <p className="text-sm text-[#8A8F98] leading-relaxed">
            {desc}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * PRICING SECTION
 */
function PricingSection() {
  const router = useRouter();
  const logger = useProductLogger();
  const { activeTeam } = useActiveTeam();

  const handleGetStarted = (productKey: string) => {
    if (productKey !== "free") {
      logger.log({ event: "client_upgrade_checkout_clicked", properties: { source: "landing_pricing_section", plan: productKey } });
    }
    if (activeTeam?.id) {
      handleCheckout(productKey, router, activeTeam.id);
    }
  };

  const pricingPlans = [
    { name: "Free", price: "$0", period: "forever", description: "For trying out Nucleate", features: ["5 free projects", "15 free messages", "Fork projects for free"], cta: "Get Started", highlighted: false, productKey: "free" },
    { name: "Plus", price: "$25", period: "per month", description: "For individuals", features: ["Everything in Free", "100 credits included", "Unlimited projects", "Export code", "1 free collaborator"], cta: "Upgrade to Plus", highlighted: false, productKey: "plus" },
    { name: "Teams", price: "$35", period: "per seat/month", description: "For growing teams", features: ["Everything in Plus", "Shared design systems", "Live collaboration", "Internal tools", "Enterprise security"], cta: "Start with Teams", highlighted: true, productKey: "teams" },
    { name: "Enterprise", price: "Custom", period: "", description: "For large organizations", features: ["Everything in Teams", "SSO & SAML", "Dedicated support", "Custom SLA", "Audit logs"], cta: "Contact Sales", highlighted: false, productKey: "max" },
  ];

  return (
    <section className="py-32 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-6xl">
        {/* New Year Sale Banner */}
        <div className="mb-12 relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 border border-yellow-500/30 p-6">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyMTUsMCwwLjEpIi8+PC9zdmc+')] opacity-50"></div>
          <div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-4xl">🎉</div>
              <div>
                <h3 className="text-xl font-bold text-white">New Year Sale!</h3>
                <p className="text-yellow-200/80 text-sm">Get 50% off your first month of Plus</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-black/30 backdrop-blur-sm rounded-lg px-4 py-2 border border-yellow-500/20">
                <span className="text-xs text-yellow-200/60 uppercase tracking-wide">Use code</span>
                <p className="text-lg font-mono font-bold text-yellow-400">NEWYEAR</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-yellow-200/60">Plus Plan</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg text-white/40 line-through">$25</span>
                  <span className="text-2xl font-bold text-white">$12.50</span>
                </div>
                <p className="text-xs text-yellow-200/60">first month</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mb-12">
          <h2 className="text-4xl font-medium text-white mb-4">Simple pricing</h2>
          <p className="text-[#8A8F98]">Start for free, scale as you grow.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pricingPlans.map((plan, index) => (
            <div key={index} className={`relative p-8 rounded-3xl flex flex-col ${plan.highlighted ? "bg-[#141517] border border-indigo-500/50 shadow-2xl" : "border border-white/10"}`}>
              <div className="mb-8">
                <h3 className="text-lg font-medium text-white">{plan.name}</h3>
                <p className="text-sm text-[#8A8F98] mt-1 h-10">{plan.description}</p>
              </div>
              <div className="mb-8 flex items-baseline gap-1">
                <span className="text-4xl font-medium text-white">{plan.price}</span>
                {plan.price !== "$0" && plan.price !== "Custom" && <span className="text-[#8A8F98] text-sm">/{plan.period}</span>}
              </div>
              <Button onClick={() => handleGetStarted(plan.productKey)} className={`w-full h-11 rounded-full text-sm font-medium transition-all mb-8 ${plan.highlighted ? "bg-white text-black hover:bg-white/90" : "bg-white/5 text-white hover:bg-white/10 border border-white/10"}`}>
                {plan.cta}
              </Button>
              <div className="space-y-4 mt-auto">
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

/**
 * FAQ SECTION
 */
function FAQSection() {
  const router = useRouter();
  const featuredFAQs = [
    { q: "How does Nucleate work?", a: "Describe your app idea in plain English and Nucleate generates a working app using React Native and Expo." },
    { q: "Do I need coding experience?", a: "Nucleate makes a working prototype in minutes just from plain English descriptions." },
    { q: "Can I export the code?", a: "Yes, you own all generated code on paid plans." },
  ];

  return (
    <section className="py-24 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-medium text-white mb-4">Questions?</h2>
          <p className="text-[#8A8F98] text-lg">Quick answers to common questions about Nucleate.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {featuredFAQs.map((faq, index) => (
            <div key={index} className="bg-[#141517] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all duration-300">
              <h3 className="text-lg font-medium text-white mb-3">{faq.q}</h3>
              <p className="text-[#8A8F98] text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Button onClick={() => router.push("/faqs")} variant="outline" className="border-white/20 bg-white/5 hover:bg-white/10 text-white rounded-full px-6 h-10">
            View all FAQs
          </Button>
        </div>
      </div>
    </section>
  );
}