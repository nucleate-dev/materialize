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
import Image from "next/image";
import {
  Bell,
  Box,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Code2,
  FileCode,
  GitBranch,
  Github,
  GitPullRequest,
  Layers,
  Layout,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Music2, Palette,
  Play,
  RefreshCw,
  Search,
  ShieldCheck, Smartphone,
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

const DEFAULT_FRAMEWORK: PrototypeFramework = "web_nextjs_react";
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

        <div className="border-y border-white/5 bg-black/50 backdrop-blur-sm py-4">
          <div className="container mx-auto px-6 flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-40 grayscale">
            <div className="flex items-center gap-2"><Github className="w-5 h-5" /> <span className="text-sm font-medium">GitHub Integration</span></div>
            <div className="flex items-center gap-2"><Code2 className="w-5 h-5" /> <span className="text-sm font-medium">React & Next.js</span></div>
            <div className="flex items-center gap-2"><Smartphone className="w-5 h-5" /> <span className="text-sm font-medium">Expo & RN</span></div>
            <div className="flex items-center gap-2"><Palette className="w-5 h-5" /> <span className="text-sm font-medium">Design System Aware</span></div>
          </div>
        </div>

        <VariantsSection />

        <CodebaseIntegrationSection />

        <ShippingSection />

        <ProblemSection />

        <HowItWorksSection />

        <DifferentiationSection />

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
 * HERO SECTION: REPO-NATIVE UI PROTOTYPING
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
    <section className="relative min-h-[85vh] flex flex-col justify-center px-6 pt-20 pb-12">
      <div className="container mx-auto max-w-5xl w-full text-center">
        <Badge variant="outline" className="mb-6 border-indigo-500/30 bg-indigo-500/10 text-indigo-300 px-4 py-1">
          UI Prototyping for Real Codebases
        </Badge>
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-white mb-6">
          AI for UI/UX prototyping
        </h1>
        <p className="text-lg md:text-xl text-[#8A8F98] max-w-2xl mx-auto mb-12 leading-relaxed">
          Connect GitHub. Nucleate reads your components, tokens, and screens automatically. Generate flows + variants in minutes, then ship via PR.
        </p>

        <div className="max-w-3xl mx-auto relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-blue-500/30 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative bg-[#141517] border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col focus-within:border-white/20">
            <div className="px-4 pt-4 flex gap-3">
              <SparklesIcon className="w-5 h-5 text-white/30 mt-1" />
              <Textarea
                placeholder="Describe a screen or flow you want to prototype..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                className="flex-1 bg-transparent text-lg text-white placeholder:text-white/30 border-none p-0 focus-visible:ring-0 resize-none min-h-[80px]"
              />
            </div>
            <div className="px-4 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-white/5 mt-2 pt-2 bg-white/[0.02]">
              <div className="flex gap-4 items-center">
                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Try:</span>
                <button onClick={() => setPrompt("Create a high-converting paywall screen for a mobile health app using a dark, modern theme. The layout should feature a compelling header image, followed by a toggle for Monthly vs Yearly billing. Highlight the Yearly plan with a 'Best Value' badge and animate the selection state. Below the plans, include a list of verified user reviews and a 'Restore Purchases' link in the footer.")} className="text-xs text-white/50 hover:text-white">Paywall variant</button>
                <button onClick={() => setPrompt("Create a 3-step onboarding flow for a financial technology app. Step 1 should focus on trust, displaying certification logos and a secure animation. Step 2 should ask for the user's primary investment goals using large, selectable cards with icons. Step 3 needs to be a 'Connect Bank' screen with a search bar for institutions and a list of popular banks.")} className="text-xs text-white/50 hover:text-white">Onboarding</button>
                <button onClick={() => setPrompt("Design a high-impact landing page for an AI-powered analytics platform. Start with a large, centered hero section featuring a glowing gradient headline and a floating dashboard mockup. Follow this with a logo carousel of trusted companies and a grid of feature cards that reveal details on hover. Conclude with a pricing section comparing three tiers and a final call-to-action footer with social links.")} className="text-xs text-white/50 hover:text-white">Landing Page</button>
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
                <Button onClick={handleSend} disabled={!prompt.trim() || isLoading} size="sm" className="bg-indigo-600 text-white hover:bg-indigo-500 px-6">
                  {isLoading ? "Loading..." : "Generate"}
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
/**
 * 4) CODEBASE INTEGRATION SECTION
 */
function CodebaseIntegrationSection() {
  return (
    <section className="py-24 px-6 bg-[#0B0C0E]">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-indigo-500/20 bg-indigo-500/10 text-indigo-300">System Aware</Badge>
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">
            Your design system, automatically.
          </h2>
          <p className="text-[#8A8F98] max-w-xl mx-auto">
            Nucleate doesn&apos;t just &quot;write code.&quot; It adopts your existing
            primitives to build UI that belongs in your app.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#141517] border border-white/10 rounded-2xl p-8 group">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6 border border-indigo-500/20">
              <Github className="w-6 h-6 text-indigo-400" />
            </div>
            <h3 className="text-xl font-medium mb-3">Automatic Repo Sync</h3>
            <p className="text-sm text-[#8A8F98] leading-relaxed">
              Connect GitHub and we instantly index your components, tokens, and navigation patterns. No manual mapping required.
            </p>
          </div>

          <div className="bg-[#141517] border border-white/10 rounded-2xl p-8 group">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-6 border border-purple-500/20">
              <ShieldCheck className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-medium mb-3">System-Safe Generation</h3>
            <p className="text-sm text-[#8A8F98] leading-relaxed">
              Every screen generated strictly respects your design tokens, spacing scales, typography, and existing component props.
            </p>
          </div>

          <div className="bg-[#141517] border border-white/10 rounded-2xl p-8 group">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 border border-emerald-500/20">
              <GitPullRequest className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-xl font-medium mb-3">Two Shipping Paths</h3>
            <p className="text-sm text-[#8A8F98] leading-relaxed">
              Ready to go? Copy-paste the clean, system-compliant code or let our agent open a Pull Request directly to your branch.
            </p>
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
          <Badge variant="outline" className="mb-4 border-white/10 bg-white/5 text-zinc-300">
            Instant Exploration
          </Badge>
          <h2 className="text-4xl md:text-6xl font-medium text-white mb-6">
            Instant variants using <span className="text-indigo-400">your components.</span>
          </h2>
          <p className="text-zinc-500 text-xl md:text-2xl font-normal">
            Explore variants without breaking the design system. These aren&apos;t mockups — they are real components from your repo.
          </p>
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
                  <div className="flex flex-col gap-4">
                    <div className="text-center text-zinc-500 font-mono text-xs uppercase tracking-widest">Variant A: Minimal</div>
                    <div className="aspect-[9/16] bg-white rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 relative group">
                      <div className="absolute top-4 left-6 right-6 flex justify-between items-center z-10">
                        <div className="w-8 h-8 bg-black/5 rounded-full backdrop-blur-sm" />
                        <div className="w-8 h-8 bg-black/5 rounded-full backdrop-blur-sm" />
                      </div>
                      <div className="h-2/3 bg-zinc-100 relative">
                        <Image
                          src="/images/midnight_minimal.png"
                          alt="Minimal Album Art"
                          fill
                          className="object-cover"
                          sizes="(max-width: 1024px) 100vw, 33vw"
                        />
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
                    </div>
                  </div>

                  {/* Variant 2: Dark Brutalist */}
                  <div className="flex flex-col gap-4">
                    <div className="text-center text-zinc-500 font-mono text-xs uppercase tracking-widest">Variant B: Brutalist</div>
                    <div className="aspect-[9/16] bg-[#121212] rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 relative group">
                      <div className="p-6 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-8">
                          <div className="text-white font-mono text-xs">
                            NOW PLAYING
                          </div>
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                        <div className="w-full aspect-square border-2 border-white/20 rounded-none mb-8 relative">
                          <Image
                            src="/images/midnight_brutalist.png"
                            alt="Brutalist Album Art"
                            fill
                            className="object-cover grayscale opacity-60"
                            sizes="(max-width: 1024px) 100vw, 33vw"
                          />
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
                    </div>
                  </div>

                  {/* Variant 3: Glassmorphism */}
                  <div className="flex flex-col gap-4">
                    <div className="text-center text-zinc-500 font-mono text-xs uppercase tracking-widest">Variant C: Glassmorphism</div>
                    <div className="aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative group">
                      <div className="absolute inset-0">
                        <Image
                          src="/images/midnight_vibrant.png"
                          className="object-cover opacity-60 blur-xl scale-125"
                          alt="Background Blur"
                          fill
                          sizes="(max-width: 1024px) 100vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-black/20" />
                      </div>
                      <div className="relative z-10 p-6 h-full flex flex-col justify-between">
                        {/* Header */}
                        <div className="flex justify-between items-center w-full">
                          <ChevronDown className="w-6 h-6 text-white/70" />
                          <span className="text-xs font-medium text-white/50 tracking-widest uppercase">Now Playing</span>
                          <MoreHorizontal className="w-6 h-6 text-white/70" />
                        </div>

                        {/* Main Art */}
                        <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/10 mx-auto transform scale-105">
                          <Image
                            src="/images/midnight_vibrant.png"
                            alt="Glassmorphism Album Art"
                            fill
                            className="object-cover"
                            sizes="(max-width: 1024px) 100vw, 33vw"
                          />
                        </div>

                        {/* Controls */}
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
 * 5) SHIPPING SECTION
 */
function ShippingSection() {
  return (
    <section className="py-24 px-6 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">
            From prototype → PR
          </h2>
          <p className="text-[#8A8F98] max-w-2xl mx-auto">
            Nucleate isn&apos;t a playground. It&apos;s a delivery tool that lives in your
            engineering workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col gap-4">
            <div className="bg-[#141517] border border-white/10 rounded-2xl p-6 flex-1">
              <FileCode className="w-8 h-8 text-indigo-400 mb-4" />
              <h3 className="text-lg font-bold mb-2">Export Code</h3>
              <p className="text-sm text-white/60">Copy/paste specific components or export entire screens as clean, modular React files.</p>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="bg-[#141517] border border-white/10 rounded-2xl p-6 flex-1">
              <GitPullRequest className="w-8 h-8 text-emerald-400 mb-4" />
              <h3 className="text-lg font-bold mb-2">Open a PR</h3>
              <p className="text-sm text-white/60">Nucleate creates a PR against your repo following your naming conventions and file structure.</p>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="bg-[#141517] border border-white/10 rounded-2xl p-6 flex-1">
              <Search className="w-8 h-8 text-purple-400 mb-4" />
              <h3 className="text-lg font-bold mb-2">Reviewable Diffs</h3>
              <p className="text-sm text-white/60">
                No &quot;black box&quot; code. Small, readable diffs that match your coding style and are easy to iterate on.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 bg-[#141517] border border-white/10 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <h3 className="text-xl font-medium mb-2">Design and engineering work in the same source of truth: Git.</h3>
            <p className="text-white/50 text-sm">Stop rebuilding UI from screenshots. Let Nucleate bridge the gap by generating code that actually belongs in your codebase.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 mb-2">
                <Github className="w-5 h-5" />
              </div>
              <span className="text-[10px] text-white/30 uppercase font-bold tracking-widest">Git Provider</span>
            </div>
            <div className="w-12 h-px bg-white/10" />
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)] mb-2">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] text-white/30 uppercase font-bold tracking-widest">Nucleate</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


/**


/**
 * PRICING SECTION
 */
/**
 * 10) PRICING SECTION
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
 * PROBLEM SECTION - Why Teams Struggle Today
 */
/**
 * 7) PROBLEM SECTION
 */
function ProblemSection() {
  const painPoints = [
    {
      title: "Design Drift",
      desc: "Figma diverges from code. Nucleate uses your repo as the single source of truth.",
      icon: <GitBranch className="w-5 h-5 text-orange-400" />,
    },
    {
      title: "Manual Rebuilds",
      desc: "Engineers rebuild UI from scratch using screenshots. Nucleate outputs production-ready PRs.",
      icon: <Code2 className="w-5 h-5 text-pink-400" />,
    },
    {
      title: "Stifled Exploration",
      desc: "Handoff is too slow to try more than 1 design. Nucleate generates 10 system-safe variants in minutes.",
      icon: <Layers className="w-5 h-5 text-yellow-400" />,
    },
    {
      title: "Handoff Friction",
      desc: "The 'design-to-dev' loop takes weeks. Nucleate unifies exploration and implementation in one cycle.",
      icon: <RefreshCw className="w-5 h-5 text-indigo-400" />,
    },
  ];

  return (
    <section className="py-24 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-medium text-white mb-4">
            UI iteration is broken when design and code are split.
          </h2>
          <p className="text-zinc-400 text-lg">
            Bridge the gap between vision and production.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {painPoints.map((point, idx) => (
            <div key={idx} className="p-6 rounded-2xl bg-[#141517] border border-white/5">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                {point.icon}
              </div>
              <h3 className="text-lg font-medium text-white mb-2">{point.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{point.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * HOW IT WORKS SECTION
 */
/**
 * 8) HOW IT WORKS SECTION
 */
function HowItWorksSection() {
  return (
    <section className="py-24 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-medium text-white mb-4">How It Works</h2>
          <p className="text-zinc-400">No manual setup. No component tagging. No config hell.</p>
        </div>

        <div className="space-y-12 relative">
          {/* Connecting Line */}
          <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-indigo-500 via-purple-500 to-transparent md:left-1/2 md:-ml-px" />

          {/* Step 1 */}
          <div className="relative flex flex-col md:flex-row items-center gap-8 group">
            <div className="absolute left-0 w-14 h-14 rounded-full bg-[#141517] border-4 border-[#0B0C0E] z-10 flex items-center justify-center text-white font-bold md:left-1/2 md:-ml-7 shadow-xl">1</div>
            <div className="pl-20 md:pl-0 md:w-1/2 md:pr-12 md:text-right">
              <div className="bg-[#141517] p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-medium text-white mb-2 flex items-center gap-2 md:justify-end">Connect Repo</h3>
                <p className="text-zinc-400 text-sm">Connect GitHub. Nucleate auto-detects your design system, components, and styling primitives.</p>
              </div>
            </div>
            <div className="md:w-1/2" />
          </div>

          {/* Step 2 */}
          <div className="relative flex flex-col md:flex-row items-center gap-8 group">
            <div className="absolute left-0 w-14 h-14 rounded-full bg-[#141517] border-4 border-[#0B0C0E] z-10 flex items-center justify-center text-white font-bold md:left-1/2 md:-ml-7 shadow-xl">2</div>
            <div className="md:w-1/2" />
            <div className="pl-20 md:pl-0 md:w-1/2 md:pl-12">
              <div className="bg-[#141517] p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-medium text-white mb-2 flex items-center gap-2">Prototype & Explore</h3>
                <p className="text-zinc-400 text-sm">Describe a flow. Generate variants and screens using your real system components instantly.</p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative flex flex-col md:flex-row items-center gap-8 group">
            <div className="absolute left-0 w-14 h-14 rounded-full bg-[#141517] border-4 border-[#0B0C0E] z-10 flex items-center justify-center text-white font-bold md:left-1/2 md:-ml-7 shadow-xl">3</div>
            <div className="pl-20 md:pl-0 md:w-1/2 md:pr-12 md:text-right">
              <div className="bg-[#141517] p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-medium text-white mb-2 flex items-center gap-2 md:justify-end">Ship Real Code</h3>
                <p className="text-zinc-400 text-sm">Export production-ready web or mobile code. Or, have Nucleate open a PR directly against your repo.</p>
              </div>
            </div>
            <div className="md:w-1/2" />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * DIFFERENTIATION SECTION - Why Nucleate?
 */
/**
 * 9) DIFFERENTIATION SECTION
 */
function DifferentiationSection() {
  return (
    <section className="py-24 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-medium text-white mb-4">Why Nucleate?</h2>
          <p className="text-zinc-400">Prototyping that lives in the codebase.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-4 text-xs uppercase tracking-wider text-zinc-500 font-medium border-b border-white/10">Feature</th>
                <th className="p-4 text-xs uppercase tracking-wider text-zinc-500 font-medium border-b border-white/10">Figma</th>
                <th className="p-4 text-xs uppercase tracking-wider text-zinc-500 font-medium border-b border-white/10">AI Builders</th>
                <th className="p-4 text-xs uppercase tracking-wider text-indigo-400 font-bold border-b border-indigo-500/50 bg-indigo-500/5 rounded-t-xl">Nucleate</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-white/5">
                <td className="p-4 text-white font-medium">Uses your components</td>
                <td className="p-4 text-zinc-500">No</td>
                <td className="p-4 text-zinc-500">No</td>
                <td className="p-4 text-white font-semibold bg-indigo-500/5">Yes (Automatic)</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="p-4 text-white font-medium">Enforces design tokens</td>
                <td className="p-4 text-zinc-500">Manual</td>
                <td className="p-4 text-zinc-500">No</td>
                <td className="p-4 text-white font-semibold bg-indigo-500/5">Strictly Enforced</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="p-4 text-white font-medium">Works on existing codebase</td>
                <td className="p-4 text-zinc-500">No</td>
                <td className="p-4 text-zinc-500">No</td>
                <td className="p-4 text-white font-semibold bg-indigo-500/5">Yes</td>
              </tr>
              <tr>
                <td className="p-4 text-white font-medium">PR to repo</td>
                <td className="p-4 text-zinc-500">No</td>
                <td className="p-4 text-zinc-500">No</td>
                <td className="p-4 text-white font-semibold bg-indigo-500/5 rounded-b-xl">Direct GitHub PR</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/**
 * FAQ SECTION
 */
/**
 * 11) FAQ SECTION
 */
function FAQSection() {
  const featuredFAQs = [
    { q: "How does repo sync work?", a: "You never have to do manual syncing. Nucleate's agents will always stay up to date on your repo's latest state." },
    { q: "Does it use our existing components?", a: "Yes. Unlike generic AI tools, Nucleate prioritizes using your existing library. If you have a 'Button' or 'Card' component, Nucleate will use them instead of generating new ones." },
    { q: "How does the PR workflow work?", a: "After you're happy with a prototype, you can click 'Open PR'. Nucleate will branch from your main, commit the new screens and components, and create a Pull Request for your review." },
    { q: "Is our code sent externally?", a: "We only send the necessary context (component signatures and tokens) to the model to generate the UI. Your source code is never used to train models." },
  ];

  return (
    <section className="py-24 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-medium text-white mb-4">Questions?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 max-w-4xl mx-auto">
          {featuredFAQs.map((faq, index) => (
            <div key={index} className="bg-[#141517] border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-medium text-white mb-3">{faq.q}</h3>
              <p className="text-[#8A8F98] text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
