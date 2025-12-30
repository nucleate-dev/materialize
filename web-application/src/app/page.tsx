"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
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
import {
  BarChart3, History, Layout,
  Palette,
  ShoppingBag,
  Smartphone,
  Terminal,
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

        {/* Section 1: Infrastructure & Scale */}
        <InfrastructureSection />

        {/* Section 2: Coding Agents & Design Systems */}
        <AgentsSection />

        {/* Section 3: Use Cases & Project Gallery */}
        <UseCasesSection />

        <PricingSection />
        <FAQSection />
        <Footer />
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
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="relative min-h-[80vh] flex flex-col justify-center px-6 py-20">
      <div className="container mx-auto max-w-5xl w-full text-center">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60 pb-2 mb-6">
          Build beautiful <br className="hidden md:block" /> apps fast
        </h1>
        <p className="text-lg md:text-xl text-[#8A8F98] max-w-2xl mx-auto mb-12">
          Build beautifully designed apps, prototypes, flows, and screens fast.
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
 * SECTION 1: INFRASTRUCTURE (Bento)
 */
function InfrastructureSection() {
  return (
    <section className="py-24 px-6 border-t border-white/5">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-medium tracking-tight mb-4">
            Everything you need to scale <br /> <span className="text-white/40">Built in.</span>
          </h2>
          <p className="text-[#8A8F98] max-w-2xl mx-auto">
            Stop stitching together platforms. Nucleate gives you enterprise-grade backend infrastructure including hosting, databases, integrations and more.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[200px]">
          {/* Databases */}
          <div className="md:col-span-8 md:row-span-2 bg-[#141517] border border-white/10 rounded-3xl p-8 relative overflow-hidden group">
            <h3 className="text-xl font-medium mb-2">Unlimited databases</h3>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md h-40 opacity-50">
              {/* Mock Infinity Loop */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-32 border-[12px] border-blue-500 rounded-full blur-[2px] rotate-[-10deg]"></div>
                <div className="w-64 h-32 border-[12px] border-blue-600 rounded-full blur-[2px] rotate-[10deg] absolute"></div>
              </div>
            </div>
          </div>

          {/* Enterprise Grade */}
          <div className="md:col-span-4 md:row-span-1 bg-[#141517] border border-white/10 rounded-3xl p-6 relative overflow-hidden">
            <h3 className="text-lg font-medium">Enterprise-grade</h3>
            <div className="absolute bottom-0 right-0 w-full h-1/2 bg-gradient-to-t from-blue-500/20 to-transparent"></div>
            <div className="absolute bottom-4 left-4 right-4 h-[2px] bg-white/10">
              <div className="absolute left-0 bottom-0 w-3/4 h-full bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.5)]"></div>
              <div className="absolute left-[75%] -translate-y-1 w-3 h-3 bg-white rounded-full"></div>
            </div>
          </div>

          {/* User Auth (Tall Card) */}
          <div className="md:col-span-4 md:row-span-2 bg-[#141517] border border-white/10 rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden">
            <h3 className="text-xl font-medium">User Management & Authentication</h3>
            <div className="flex-1 flex items-center justify-center mt-8">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-b from-white/10 to-transparent border border-white/10 flex items-center justify-center">
                  <div className="w-12 h-16 bg-[#222] border-2 border-white/20 rounded-xl relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_15px_blue]"></div>
                  </div>
                </div>
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-32 bg-blue-500/20 blur-3xl -z-10"></div>
              </div>
            </div>
          </div>

          {/* SEO Optimization */}
          <div className="md:col-span-3 md:row-span-1 bg-[#141517] border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full border-4 border-blue-500 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
              <span className="text-2xl font-bold">100</span>
            </div>
            <p className="text-[10px] text-white/50 uppercase font-bold tracking-tighter">SEO optimization so your project ranks from day one.</p>
          </div>

          {/* Hosting */}
          <div className="md:col-span-5 md:row-span-1 bg-[#141517] border border-white/10 rounded-3xl p-6 relative overflow-hidden flex items-end">
            <div className="z-10">
              <p className="text-sm font-medium">Hosting with analytics & custom domains</p>
            </div>
            <div className="absolute top-4 right-4 w-32 h-20 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg rotate-12 flex items-center justify-center shadow-2xl">
              <span className="text-white font-bold text-xl italic">Publish</span>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-12 border-t border-white/5 text-center">
          <p className="text-xl font-medium text-white/80 max-w-2xl mx-auto">
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
                  <div className="w-6 h-6 bg-orange-500/20 rounded flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <span className="text-sm">Claude Code</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 opacity-40">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center"><Terminal className="w-3.5 h-3.5" /></div>
                  <span className="text-sm">Codex</span>
                </div>
                <span className="text-[10px] uppercase font-bold text-white/40">coming soon</span>
              </div>
              <div className="flex items-center justify-between p-3 opacity-40">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center"><SparklesIcon className="w-3.5 h-3.5 text-blue-400" /></div>
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
                  Nucleate handles projects 1,000 times larger than before. It's improved built-in context management can handle complexity and keep your projects running smoothly.
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
    <section className="py-24 px-6 border-t border-white/5">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-medium tracking-tight mb-4">
            Whatever your role <br /> <span className="text-white/40">Nucleate gives you superpowers</span>
          </h2>
          <p className="text-[#8A8F98] max-w-2xl mx-auto">
            From idea to live product, Nucleate adapts to the way you work turning every vision into something real & fast.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          <RoleCard
            role="Product managers"
            desc="Go from insight to prototype in hours and test ideas with your team."
            ui={<div className="p-4 bg-black/40 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 mb-4 text-xs font-bold text-white/40"><History className="w-3 h-3" /> Version history</div>
              <div className="space-y-2">
                <div className="h-2 w-full bg-white/5 rounded-full"></div>
                <div className="h-2 w-3/4 bg-white/5 rounded-full"></div>
              </div>
            </div>}
          />
          <RoleCard
            role="Entrepreneurs"
            desc="Launch a full business in days, not months. From landing to product."
            ui={<div className="p-4 bg-black/40 rounded-xl border border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between text-[10px] text-white/50">
                <span>Publishing...</span>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              </div>
              <div className="text-xs font-mono text-blue-400">https://your-startup.com</div>
            </div>}
          />
          <RoleCard
            role="Marketers"
            desc="Spin up high-performing campaign pages in hours, with SEO built in."
            ui={<div className="p-4 bg-black/40 rounded-xl border border-white/10">
              <div className="flex items-end gap-1 h-12">
                <div className="flex-1 bg-blue-500/40 h-1/2 rounded-t-sm"></div>
                <div className="flex-1 bg-blue-500/60 h-3/4 rounded-t-sm"></div>
                <div className="flex-1 bg-blue-500 h-full rounded-t-sm"></div>
                <div className="flex-1 bg-blue-500/80 h-2/3 rounded-t-sm"></div>
              </div>
            </div>}
          />
        </div>

        <div className="space-y-8">
          <h3 className="text-2xl font-medium">You can build literally anything</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {categories.map((cat, i) => (
              <div key={i} className={`bg-gradient-to-br ${cat.color} to-[#141517] border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 hover:border-white/30 transition-all cursor-pointer group`}>
                <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {cat.icon}
                </div>
                <span className="text-sm font-medium">{cat.label}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-12">
            <Button variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 rounded-full px-8">
              See all community projects
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoleCard({ role, desc, ui }: { role: string; desc: string; ui: React.ReactNode; }) {
  return (
    <div className="bg-[#141517] border border-white/10 rounded-3xl p-8 flex flex-col h-full hover:border-white/20 transition-all group">
      <h3 className="text-lg font-medium mb-2">{role}</h3>
      <p className="text-sm text-[#8A8F98] mb-8 leading-relaxed">{desc}</p>
      <div className="mt-auto opacity-60 group-hover:opacity-100 transition-opacity">
        {ui}
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
    { name: "Plus", price: "$25", period: "per month", description: "For everyone", features: ["Everything in Free", "100 credits included", "Unlimited projects", "Export code"], cta: "Upgrade to Plus", highlighted: true, productKey: "plus" },
    { name: "Enterprise", price: "Custom", period: "", description: "For large teams", features: ["Dedicated support", "Team collaboration", "SSO & Security", "Custom SLA"], cta: "Contact Sales", highlighted: false, productKey: "max" },
  ];

  return (
    <section className="py-32 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-medium text-white mb-4">Simple pricing</h2>
          <p className="text-[#8A8F98]">Start for free, scale as you grow.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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