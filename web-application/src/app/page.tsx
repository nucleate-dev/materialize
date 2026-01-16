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
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Box,
  Camera,
  Check,
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
  Music2,
  Palette,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Tv,
  Users,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
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
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
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
    <main className="relative min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        <HeroSection />

        <div className="border-y border-border bg-card/50 backdrop-blur-sm py-4">
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

        <Footer />
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

  const suggestionChips = [
    { label: "Paywall variant", prompt: "Personal health dashboard. Widgets for heart rate graph, sleep quality score with moon icon, daily caloric intake vs burn, hydration water level tracker, and recovery battery percentage. Activity rings and step counter.\n\nCreate also the other screens.\n\nMobile dashboard, Bento Grid layout, Soft Neo-Brutalism. Dark mode, deep charcoal background, rounded cards with vivid pastel accents (salmon, periwinkle, yellow). Bold all-caps sans-serif typography, modular fintech SaaS aesthetic with high contrast." },
    { label: "Onboarding", prompt: "Personal health dashboard. Widgets for heart rate graph, sleep quality score with moon icon, daily caloric intake vs burn, hydration water level tracker, and recovery battery percentage. Activity rings and step counter.\n\nCreate also the other screens.\n\nMobile dashboard, Bento Grid layout, Soft Neo-Brutalism. Dark mode, deep charcoal background, rounded cards with vivid pastel accents (salmon, periwinkle, yellow). Bold all-caps sans-serif typography, modular fintech SaaS aesthetic with high contrast." },
    { label: "Landing Page", prompt: "Personal health dashboard. Widgets for heart rate graph, sleep quality score with moon icon, daily caloric intake vs burn, hydration water level tracker, and recovery battery percentage. Activity rings and step counter.\n\nCreate also the other screens.\n\nMobile dashboard, Bento Grid layout, Soft Neo-Brutalism. Dark mode, deep charcoal background, rounded cards with vivid pastel accents (salmon, periwinkle, yellow). Bold all-caps sans-serif typography, modular fintech SaaS aesthetic with high contrast." },
  ];

  return (
    <section className="relative min-h-[85vh] flex flex-col justify-center px-6 pt-20 pb-12 overflow-hidden">
      {/* Floating gradient orbs */}
      <motion.div
        animate={{ y: [0, -30, 0], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px] pointer-events-none"
      />
      <motion.div
        animate={{ y: [0, 20, 0], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-primary/15 rounded-full blur-[100px] pointer-events-none"
      />
      <motion.div
        animate={{ y: [0, -15, 0], x: [0, 10, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute top-1/2 right-1/3 w-[200px] h-[200px] bg-primary/10 rounded-full blur-[80px] pointer-events-none"
      />

      <div className="container mx-auto max-w-5xl w-full text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/10 text-primary px-4 py-1">
            Prototyping for Production Teams
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-foreground mb-6"
        >
          The AI Design Engineer
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          Nucleate ingests your codebase's styles and components, so every prototype is on-brand. Explore variants quickly, then export real code.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="max-w-3xl mx-auto relative group"
        >
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-primary/20 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative bg-card border border-border rounded-xl overflow-hidden shadow-2xl flex flex-col focus-within:border-primary/30">
            <div className="px-4 pt-4 flex gap-3">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles className="w-5 h-5 text-muted-foreground mt-1" />
              </motion.div>
              <Textarea
                placeholder="Describe a screen or flow you want to prototype..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                className="flex-1 bg-transparent text-lg text-foreground placeholder:text-muted-foreground border-none p-0 focus-visible:ring-0 resize-none min-h-[80px]"
              />
            </div>
            <div className="px-4 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border mt-2 pt-2 bg-accent/50">
              <div className="flex gap-4 items-center">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Try:</span>
                {suggestionChips.map((chip, index) => (
                  <motion.button
                    key={chip.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 + index * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setPrompt(chip.prompt)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {chip.label}
                  </motion.button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {isWebPrototypeEnabled && (
                  <Select value={framework} onValueChange={(v) => setFramework(v as PrototypeFramework)}>
                    <SelectTrigger className="h-9 w-32 border-border bg-accent text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {PLATFORM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button onClick={handleSend} disabled={!prompt.trim() || isLoading} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 px-6">
                    {isLoading ? "Loading..." : "Create prototype"}
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      <ProPlanUpsellModal open={showUpsellModal} onOpenChange={setShowUpsellModal} reason="prototype_creation_limit_reached" />
    </section>
  );
}

/**
 * 4) CODEBASE INTEGRATION SECTION
 */
function CodebaseIntegrationSection() {
  const cards = [
    {
      icon: <Github className="w-6 h-6 text-primary" />,
      iconBg: "bg-primary/10 border-primary/20",
      hoverBorder: "hover:border-primary/40",
      glowColor: "group-hover:bg-primary/5",
      title: "Automatic Repo Sync",
      description: "Connect GitHub and we instantly index your components, tokens, and navigation patterns. No manual mapping required.",
      illustration: (
        <div className="mt-6 relative h-20 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <motion.div
              animate={{ x: [0, 20, 20], opacity: [1, 1, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
              className="w-6 h-6 bg-accent rounded flex items-center justify-center"
            >
              <FileCode className="w-3 h-3 text-muted-foreground" />
            </motion.div>
            <motion.div
              animate={{ x: [0, 20, 20], opacity: [1, 1, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, delay: 0.2 }}
              className="w-6 h-6 bg-accent rounded flex items-center justify-center"
            >
              <FileCode className="w-3 h-3 text-muted-foreground" />
            </motion.div>
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/30"
            >
              <Layers className="w-5 h-5 text-primary" />
            </motion.div>
          </div>
        </div>
      ),
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-purple-400" />,
      iconBg: "bg-purple-500/10 border-purple-500/20",
      hoverBorder: "hover:border-purple-500/40",
      glowColor: "group-hover:bg-purple-500/5",
      title: "System-Safe Generation",
      description: "Every screen generated strictly respects your design tokens, spacing scales, typography, and existing component props.",
      illustration: (
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          {["Button", "Card", "Input", "Modal"].map((token, i) => (
            <motion.div
              key={token}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded text-sm text-purple-300 font-mono"
            >
              {token}
            </motion.div>
          ))}
        </div>
      ),
    },
    {
      icon: <GitPullRequest className="w-6 h-6 text-emerald-400" />,
      iconBg: "bg-emerald-500/10 border-emerald-500/20",
      hoverBorder: "hover:border-emerald-500/40",
      glowColor: "group-hover:bg-emerald-500/5",
      title: "Two Shipping Paths",
      description: "Ready to go? Copy-paste the clean, system-compliant code or let our agent open a Pull Request directly to your branch.",
      illustration: (
        <div className="mt-6 flex items-center justify-center gap-4">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center border border-border">
              <Code2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">Copy</span>
          </motion.div>
          <div className="text-muted-foreground text-xs">or</div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-8 h-8 bg-emerald-500/20 rounded flex items-center justify-center border border-emerald-500/30">
              <GitPullRequest className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xs text-emerald-400/60">PR</span>
          </motion.div>
        </div>
      ),
    },
  ];

  return (
    <section className="pt-24 pb-12 px-6 bg-background relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-1/2 left-0 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[250px] h-[250px] bg-purple-600/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-16"
        >
          <Badge variant="outline" className="mb-4 border-primary/20 bg-primary/10 text-primary">System Aware</Badge>
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">
            Your design system, automatically.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Nucleate doesn&apos;t just &quot;write code.&quot; It adopts your existing
            primitives to build UI that belongs in your app.
          </p>
        </motion.div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[minmax(200px,auto)]">
          {/* Large featured card - spans 7 columns and 2 rows */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4 }}
            className="md:col-span-7 md:row-span-2 bg-gradient-to-br from-primary/10 via-card to-card border border-primary/20 rounded-3xl p-8 md:p-10 group hover:border-primary/40 transition-all duration-300 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="relative z-10 h-full flex flex-col">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center mb-6 border border-primary/30"
              >
                <Github className="w-7 h-7 text-primary" />
              </motion.div>
              <h3 className="text-2xl md:text-3xl font-medium mb-4">{cards[0].title}</h3>
              <p className="text-muted-foreground leading-relaxed mb-8 max-w-md">
                {cards[0].description}
              </p>
              {/* Animated file sync visualization */}
              <div className="mt-auto flex items-center gap-6">
                <div className="flex -space-x-2">
                  {[FileCode, FileCode, FileCode].map((Icon, i) => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                      className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center border border-border"
                    >
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </motion.div>
                  ))}
                </div>
                <motion.div
                  animate={{ x: [0, 10, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="flex items-center gap-2"
                >
                  <div className="w-8 h-px bg-gradient-to-r from-primary to-transparent" />
                  <div className="w-8 h-px bg-gradient-to-r from-primary/60 to-transparent" />
                  <div className="w-8 h-px bg-gradient-to-r from-primary/30 to-transparent" />
                </motion.div>
                <motion.div
                  animate={{ scale: [1, 1.1, 1], boxShadow: ["0 0 20px rgba(99,102,241,0.3)", "0 0 40px rgba(99,102,241,0.5)", "0 0 20px rgba(99,102,241,0.3)"] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30"
                >
                  <Layers className="w-6 h-6 text-primary" />
                </motion.div>
              </div>
            </div>
          </motion.div>

          {/* Top right card - compact */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="md:col-span-5 bg-card border border-purple-500/20 rounded-3xl p-6 group hover:border-purple-500/40 transition-all duration-300 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20"
                >
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                </motion.div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                      className="w-1.5 h-1.5 rounded-full bg-purple-400"
                    />
                  ))}
                </div>
              </div>
              <h3 className="text-lg font-medium mb-2">{cards[1].title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {cards[1].description}
              </p>
              <div className="flex flex-wrap gap-2">
                {["Button", "Card", "Input", "Modal"].map((token, i) => (
                  <motion.div
                    key={token}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    viewport={{ once: true }}
                    className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-sm text-purple-300 font-mono"
                  >
                    {token}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Bottom right card - with visual emphasis */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="md:col-span-5 bg-card border border-emerald-500/20 rounded-3xl p-6 group hover:border-emerald-500/40 transition-all duration-300 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 mb-4"
              >
                <GitPullRequest className="w-5 h-5 text-emerald-400" />
              </motion.div>
              <h3 className="text-lg font-medium mb-2">{cards[2].title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {cards[2].description}
              </p>
              <div className="flex items-center gap-3">
                <motion.div whileHover={{ scale: 1.05 }} className="flex-1 py-3 bg-accent rounded-xl flex items-center justify-center gap-2 border border-border cursor-pointer hover:bg-accent/80 transition-colors">
                  <Code2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground font-medium">Copy Code</span>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} className="flex-1 py-3 bg-emerald-500/20 rounded-xl flex items-center justify-center gap-2 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/30 transition-colors">
                  <GitPullRequest className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400 font-medium">Open PR</span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Design system visual strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 py-6 px-8 bg-card/50 border border-border rounded-2xl flex flex-wrap items-center justify-center gap-8 md:gap-12"
        >
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <div className="w-2 h-2 rounded-full bg-pink-500"></div>
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            </div>
            <span className="text-sm text-muted-foreground">Your brand colors</span>
          </div>
          <div className="flex gap-2">
            {["Aa", "Bb"].map((text, i) => (
              <div key={i} className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium ${i === 0 ? "bg-foreground text-background" : "bg-accent text-foreground border border-border"}`}>
                {text}
              </div>
            ))}
            <span className="text-sm text-muted-foreground ml-2">Typography</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-3 h-3 bg-accent rounded-sm border border-border" />
              <div className="w-4 h-3 bg-accent rounded-sm border border-border" />
              <div className="w-2 h-3 bg-accent rounded-sm border border-border" />
            </div>
            <span className="text-sm text-muted-foreground">Spacing scales</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * VARIANTS MEGA-SECTION
 */
function VariantsSection() {
  const [activeTab, setActiveTab] = useState("variants");

  const tabs = [
    {
      id: "variants",
      label: "Variants",
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
    <section className="py-24 bg-background border-y border-border relative overflow-hidden">
      {/* Animated background accents */}
      <motion.div
        animate={{ y: [0, 30, 0], x: [0, -20, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none"
      />
      <motion.div
        animate={{ y: [0, -40, 0], x: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none"
      />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-16 max-w-4xl mx-auto"
        >
          <Badge variant="outline" className="mb-4 border-border bg-accent text-muted-foreground">
            Instant Exploration
          </Badge>
          <h2 className="text-4xl md:text-6xl font-medium text-foreground mb-6">
            Instant variants using <span className="text-primary">your components.</span>
          </h2>
          <p className="text-muted-foreground text-xl md:text-2xl font-normal">
            Explore variants without breaking the design system. These aren&apos;t mockups — they are real components from your repo.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {tabs.map((tab, index) => (
            <motion.button
              key={tab.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-300 border ${activeTab === tab.id
                ? "bg-foreground text-background border-foreground shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                : "bg-card/50 text-muted-foreground border-border hover:bg-card hover:text-foreground"
                }`}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* Content Area */}
        <div className="relative min-h-[600px] bg-card rounded-3xl border border-border p-4 md:p-8 overflow-hidden shadow-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full"
            >
              {/* DEMO CONTENT BASED ON TAB */}
              {activeTab === "variants" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 h-full items-start justify-center">
                  {/* Variant 1: Modern Minimal */}
                  <div className="flex flex-col gap-4">
                    <div className="text-center text-muted-foreground font-mono text-xs uppercase tracking-widest">Variant A: Minimal</div>
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
                    <div className="text-center text-muted-foreground font-mono text-xs uppercase tracking-widest">Variant B: Brutalist</div>
                    <div className="aspect-[9/16] bg-card rounded-3xl overflow-hidden shadow-2xl border border-border relative group">
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
                    <div className="text-center text-muted-foreground font-mono text-xs uppercase tracking-widest">Variant C: Glassmorphism</div>
                    <div className="aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 relative group">
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
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
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
                            <div className="w-8 h-8 bg-white text-zinc-900 rounded-full flex items-center justify-center shadow-lg">
                              <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-zinc-900 border-b-[4px] border-b-transparent ml-0.5" />
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
                    <div className="absolute top-4 left-0 right-0 text-center text-xs text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Empty State
                    </div>
                  </div>

                  {/* Loading State */}
                  <div className="bg-card rounded-3xl border border-border p-6 aspect-[9/16] max-h-[500px] flex flex-col relative overflow-hidden group">
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
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-4 left-0 right-0 text-center text-xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">
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
                    <div className="absolute top-4 left-0 right-0 text-center text-xs text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
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
                    <div className="px-6 py-4 flex justify-between items-center text-white text-xs font-bold">
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
                        <div className="px-2 py-1 rounded bg-white text-slate-900 text-xs font-bold uppercase tracking-wider">
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
                        <div className="text-xs text-slate-300">
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
                          <div className="absolute -top-3 right-4 bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded">
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
                            <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded">
                              7-day free trial
                            </span>
                            <span className="text-slate-400 text-xs">
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
                        <p className="text-xs text-center text-slate-500 mt-2">
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
                          <div className="text-xs text-slate-500">
                            Full refund anytime, no questions asked.
                          </div>
                        </div>
                      </div>

                      {/* Footer Price & CTA */}
                      <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                        <p className="text-xs text-slate-500 mb-1">
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
                        <p className="text-xs text-slate-400 mt-3">
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
                          <button className="text-xs font-bold text-slate-900">
                            Restore purchases
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
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
                          <div className="absolute bottom-0 left-0 text-xs font-medium text-slate-500">
                            3 Days
                          </div>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-medium text-slate-500">
                            7 Days
                          </div>
                          <div className="absolute bottom-0 right-0 text-xs font-medium text-slate-500">
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
  const cards = [
    {
      icon: <FileCode className="w-8 h-8 text-primary" />,
      title: "Export Code",
      description: "Copy/paste specific components or export entire screens as clean, modular React files.",
      hoverBorder: "hover:border-primary/40",
      illustration: (
        <div className="mt-4 bg-background rounded-lg p-3 border border-border font-mono text-sm overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-pink-400"
          >export default</motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="text-blue-400"
          >function Button()</motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground pl-2"
          >{'// Clean code...'}</motion.div>
        </div>
      ),
    },
    {
      icon: <GitPullRequest className="w-8 h-8 text-emerald-400" />,
      title: "Open a PR",
      description: "Nucleate creates a PR against your repo following your naming conventions and file structure.",
      hoverBorder: "hover:border-emerald-500/40",
      illustration: (
        <div className="mt-4 bg-background rounded-lg p-3 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-emerald-400 font-medium">Open</span>
          </div>
          <div className="text-sm text-muted-foreground mb-2">feat: Add onboarding flow</div>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="px-2 py-1 bg-emerald-500/20 rounded text-xs text-emerald-400 w-fit"
          >
            Ready to merge
          </motion.div>
        </div>
      ),
    },
    {
      icon: <Search className="w-8 h-8 text-purple-400" />,
      title: "Reviewable Diffs",
      description: "No \"black box\" code. Small, readable diffs that match your coding style and are easy to iterate on.",
      hoverBorder: "hover:border-purple-500/40",
      illustration: (
        <div className="mt-4 bg-background rounded-lg p-2 border border-border space-y-1">
          {[
            { color: "bg-emerald-500/20 text-emerald-400", text: "+ <Button variant=\"primary\" />" },
            { color: "bg-red-500/20 text-red-400", text: "- <button className=\"btn\" />" },
          ].map((line, i) => (
            <motion.div
              key={i}
              initial={{ x: -10, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 + i * 0.03 }}
              className={`text-xs font-mono px-2 py-1 rounded ${line.color}`}
            >
              {line.text}
            </motion.div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <section className="py-24 px-6 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 right-0 w-[300px] h-[300px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[250px] h-[250px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Split header layout */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="max-w-xl"
          >
            <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">
              From prototype → PR
            </h2>
            <p className="text-muted-foreground">
              Nucleate isn&apos;t a playground. It&apos;s a delivery tool that lives in your
              engineering workflow.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-center gap-3"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-full border border-border">
              <Github className="w-4 h-4" />
              <span className="text-sm text-muted-foreground">Git-native</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <GitBranch className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-400">PR Ready</span>
            </div>
          </motion.div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {cards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="relative"
            >
              {/* Card content */}
              <motion.div
                whileHover={{ y: -5, scale: 1.02 }}
                className={`bg-card border rounded-2xl p-6 transition-all duration-300 h-full ${index === 0 ? "border-primary/20 hover:border-primary/40" :
                  index === 1 ? "border-emerald-500/20 hover:border-emerald-500/40" :
                    "border-purple-500/20 hover:border-purple-500/40"
                  }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: index * 0.5 }}
                  >
                    {card.icon}
                  </motion.div>
                  <h3 className="text-xl font-bold">{card.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{card.description}</p>
                {card.illustration}
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-20 bg-gradient-to-r from-card via-card to-emerald-500/10 border border-border rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <GitPullRequest className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium mb-1">Ship to your repo in seconds</h3>
              <p className="text-sm text-muted-foreground">Design and engineering work in the same source of truth: Git.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 rounded-full text-white font-medium text-sm cursor-pointer hover:bg-emerald-600 transition-colors"
            >
              <GitPullRequest className="w-4 h-4" />
              Open PR
            </motion.div>
            <div className="text-muted-foreground text-sm">or</div>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-accent rounded-full border border-border text-sm font-medium cursor-pointer hover:bg-accent/80 transition-colors">
              <Code2 className="w-4 h-4" />
              Copy Code
            </div>
          </div>
        </motion.div>
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
    <section className="py-32 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-6xl relative z-10">
        {/* Sale Banner with shimmer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-medium text-foreground mb-4">Simple pricing</h2>
          <p className="text-muted-foreground">Start for free, scale as you grow.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pricingPlans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.25, delay: index * 0.05 }}
              whileHover={{ y: -8 }}
              className={`relative p-8 rounded-3xl flex flex-col transition-all duration-300 ${plan.highlighted ? "bg-card border border-primary/50 shadow-2xl shadow-primary/10" : "border border-border hover:border-border"}`}
            >
              {/* Featured plan glow */}
              {plan.highlighted && (
                <motion.div
                  animate={{ opacity: [0.3, 0.5, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -inset-px bg-gradient-to-b from-primary/20 to-transparent rounded-3xl pointer-events-none"
                />
              )}

              <div className="relative z-10">
                <div className="mb-8">
                  <h3 className="text-lg font-medium text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 h-10">{plan.description}</p>
                </div>
                <div className="mb-8 flex items-baseline gap-1">
                  <span className="text-4xl font-medium text-foreground">{plan.price}</span>
                  {plan.price !== "$0" && plan.price !== "Custom" && <span className="text-muted-foreground text-sm">/{plan.period}</span>}
                </div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button onClick={() => handleGetStarted(plan.productKey)} className={`w-full h-11 rounded-full text-sm font-medium transition-all mb-8 ${plan.highlighted ? "bg-foreground text-background hover:bg-foreground/90" : "bg-accent text-foreground hover:bg-accent border border-border"}`}>
                    {plan.cta}
                  </Button>
                </motion.div>
                <div className="space-y-4 mt-auto">
                  {plan.features.map((feature, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.03 + i * 0.02 }}
                      className="flex items-center gap-3 text-sm text-muted-foreground"
                    >
                      <Check className="w-4 h-4 text-muted-foreground" />
                      {feature}
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bring Your Own Claude Code */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="mt-8 relative bg-gradient-to-br from-[#D97757]/10 via-card to-card border border-[#D97757]/20 rounded-2xl p-6 md:p-8 overflow-hidden hover:border-[#D97757]/40 transition-all group"
        >
          {/* Subtle glow effect */}
          <motion.div
            animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.1, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-0 right-0 w-64 h-64 bg-[#D97757]/10 blur-[100px] rounded-full pointer-events-none"
          />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Left side - Icon and content */}
            <div className="flex items-start gap-4 flex-1">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-[#D97757]/20 rounded-xl flex items-center justify-center border border-[#D97757]/30 group-hover:bg-[#D97757]/30 transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-[#D97757]" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" clipRule="evenodd" d="M19.16 4.38H4.84V19.62H19.16V4.38ZM17.72 17.9L12 14.5L6.28 17.9V6.1H17.72V17.9Z" fill="currentColor" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-medium text-foreground mb-1">
                  Bring your own Claude Code
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Already have a Claude Code subscription? Connect it to Nucleate for massive savings. <span className="text-[#D97757]">Available on Plus.</span>
                </p>
              </div>
            </div>

            {/* Right side - Stats and benefits */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6">
              <div className="text-center sm:text-left">
                <div className="text-2xl md:text-3xl font-bold text-[#D97757] mb-0.5">1000x</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">more usage</div>
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
        </motion.div>
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
      glowColor: "group-hover:bg-orange-500/5",
      hoverBorder: "hover:border-orange-500/30",
      illustration: (
        <div className="mt-4 flex items-center justify-center gap-2">
          <motion.div
            animate={{ x: [-3, 3, -3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-6 bg-purple-500/20 rounded flex items-center justify-center"
          >
            <Palette className="w-3 h-3 text-purple-400" />
          </motion.div>
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-muted-foreground"
          >↔</motion.div>
          <motion.div
            animate={{ x: [3, -3, 3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center"
          >
            <Code2 className="w-3 h-3 text-blue-400" />
          </motion.div>
        </div>
      ),
    },
    {
      title: "Manual Rebuilds",
      desc: "Engineers rebuild UI from scratch using screenshots. Nucleate outputs production-ready PRs.",
      icon: <Code2 className="w-5 h-5 text-pink-400" />,
      glowColor: "group-hover:bg-pink-500/5",
      hoverBorder: "hover:border-pink-500/30",
      illustration: (
        <div className="mt-4 flex items-center justify-center gap-2">
          <div className="w-6 h-6 bg-accent rounded flex items-center justify-center">
            <Camera className="w-3 h-3 text-muted-foreground" />
          </div>
          <motion.div
            animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-pink-400"
          >→</motion.div>
          <div className="w-6 h-6 bg-emerald-500/20 rounded flex items-center justify-center">
            <GitPullRequest className="w-3 h-3 text-emerald-400" />
          </div>
        </div>
      ),
    },
    {
      title: "Stifled Exploration",
      desc: "Handoff is too slow to try more than 1 design. Nucleate generates 10 system-safe variants in minutes.",
      icon: <Layers className="w-5 h-5 text-yellow-400" />,
      glowColor: "group-hover:bg-yellow-500/5",
      hoverBorder: "hover:border-yellow-500/30",
      illustration: (
        <div className="mt-4 flex items-center justify-center">
          <div className="flex -space-x-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ x: 0, opacity: 0.5 }}
                whileInView={{ x: i * 4, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="w-5 h-7 bg-yellow-500/20 rounded border border-yellow-500/30"
              />
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Handoff Friction",
      desc: "The 'design-to-dev' loop takes weeks. Nucleate unifies exploration and implementation in one cycle.",
      icon: <RefreshCw className="w-5 h-5 text-primary" />,
      glowColor: "group-hover:bg-primary/5",
      hoverBorder: "hover:border-primary/30",
      illustration: (
        <div className="mt-4 flex items-center justify-center">
          <div className="relative w-full max-w-[80px]">
            <div className="h-1.5 bg-accent rounded-full" />
            <motion.div
              initial={{ width: "100%" }}
              whileInView={{ width: "30%" }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.1 }}
              className="absolute top-0 left-0 h-1.5 bg-primary rounded-full"
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <section className="py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient orbs */}
      <motion.div
        animate={{ y: [0, 20, 0] }}
        transition={{ duration: 10, repeat: Infinity }}
        className="absolute top-0 left-1/4 w-[300px] h-[300px] bg-orange-600/10 rounded-full blur-[100px] pointer-events-none"
      />
      <motion.div
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 12, repeat: Infinity, delay: 2 }}
        className="absolute bottom-0 right-1/4 w-[250px] h-[250px] bg-pink-600/10 rounded-full blur-[80px] pointer-events-none"
      />

      <div className="container mx-auto px-6 max-w-6xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-medium text-foreground mb-4">
            UI iteration is broken when design and code are split.
          </h2>
          <p className="text-muted-foreground text-lg">
            Bridge the gap between vision and production.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {painPoints.map((point, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: idx % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.25, delay: idx * 0.05 }}
              whileHover={{ y: -5 }}
              className={`p-6 rounded-2xl bg-card border border-border group transition-all duration-300 relative overflow-hidden ${point.hoverBorder}`}
            >
              <div className={`absolute inset-0 ${point.glowColor} transition-colors duration-300`} />
              <div className="relative z-10">
                <motion.div
                  whileHover={{ rotate: point.title === "Handoff Friction" ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4 border border-border"
                >
                  {point.icon}
                </motion.div>
                <h3 className="text-lg font-medium text-foreground mb-2">{point.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{point.desc}</p>
                {point.illustration}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 8) HOW IT WORKS SECTION
 */
function HowItWorksSection() {
  const steps = [
    {
      number: 1,
      title: "Connect Repo",
      description: "Connect GitHub. Nucleate auto-detects your design system, components, and styling primitives.",
      color: "primary",
      illustration: (
        <div className="mt-4 flex items-center justify-center md:justify-end gap-2">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center border border-border"
          >
            <Github className="w-4 h-4 text-muted-foreground" />
          </motion.div>
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: 24 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="h-px bg-primary"
          />
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center border border-primary/30"
          >
            <CheckCircle2 className="w-3 h-3 text-primary" />
          </motion.div>
        </div>
      ),
    },
    {
      number: 2,
      title: "Prototype & Explore",
      description: "Describe a flow. Generate variants and screens using your real system components instantly.",
      color: "purple",
      illustration: (
        <div className="mt-4 flex items-center justify-center md:justify-start gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
              whileInView={{ opacity: 1, scale: 1, rotate: i === 0 ? -5 : i === 2 ? 5 : 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + i * 0.03 }}
              className="w-6 h-9 bg-purple-500/10 rounded border border-purple-500/20"
            />
          ))}
        </div>
      ),
    },
    {
      number: 3,
      title: "Ship Real Code",
      description: "Export production-ready web or mobile code. Or, have Nucleate open a PR directly against your repo.",
      color: "emerald",
      illustration: (
        <div className="mt-4 flex items-center justify-center md:justify-end">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="px-3 py-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/30 flex items-center gap-2"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">PR Created</span>
          </motion.div>
        </div>
      ),
    },
  ];

  return (
    <section className="py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <motion.div
        animate={{ y: [0, 30, 0] }}
        transition={{ duration: 15, repeat: Infinity }}
        className="absolute top-1/3 left-0 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none"
      />

      <div className="container mx-auto px-6 max-w-4xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-medium text-foreground mb-4">How It Works</h2>
          <p className="text-muted-foreground">No manual setup. No component tagging. No config hell.</p>
        </motion.div>

        <div className="space-y-12 relative">
          {/* Animated Connecting Line */}
          <div className="absolute left-[27px] top-4 bottom-4 w-0.5 md:left-1/2 md:-ml-px overflow-hidden">
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: "100%" }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="w-full bg-gradient-to-b from-indigo-500 via-purple-500 to-emerald-500"
            />
          </div>

          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="relative flex flex-col md:flex-row items-center gap-8 group"
            >
              {/* Step Number */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: index * 0.05 + 0.1 }}
                className={`absolute left-0 w-14 h-14 rounded-full bg-card border-4 border-background z-10 flex items-center justify-center text-foreground font-bold md:left-1/2 md:-ml-7 shadow-xl group-hover:shadow-${step.color}-500/30 transition-shadow`}
              >
                <motion.span
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: index * 0.5 }}
                >
                  {step.number}
                </motion.span>
              </motion.div>

              {/* Content - alternating sides */}
              {index % 2 === 0 ? (
                <>
                  <div className="pl-20 md:pl-0 md:w-1/2 md:pr-12 md:text-right">
                    <motion.div
                      whileHover={{ y: -3 }}
                      className="bg-card p-6 rounded-2xl border border-border hover:border-border transition-all"
                    >
                      <h3 className="text-xl font-medium text-foreground mb-2 flex items-center gap-2 md:justify-end">{step.title}</h3>
                      <p className="text-muted-foreground text-sm">{step.description}</p>
                      {step.illustration}
                    </motion.div>
                  </div>
                  <div className="md:w-1/2" />
                </>
              ) : (
                <>
                  <div className="md:w-1/2" />
                  <div className="pl-20 md:pl-0 md:w-1/2 md:pl-12">
                    <motion.div
                      whileHover={{ y: -3 }}
                      className="bg-card p-6 rounded-2xl border border-border hover:border-border transition-all"
                    >
                      <h3 className="text-xl font-medium text-foreground mb-2 flex items-center gap-2">{step.title}</h3>
                      <p className="text-muted-foreground text-sm">{step.description}</p>
                      {step.illustration}
                    </motion.div>
                  </div>
                </>
              )}
            </motion.div>
          ))}
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
    <section className="py-24 bg-background border-t border-border">
      <div className="container mx-auto px-6 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-medium text-foreground mb-4">Why Nucleate?</h2>
          <p className="text-muted-foreground">Prototyping that lives in the codebase.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="overflow-x-auto"
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">Feature</th>
                <th className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">Figma</th>
                <th className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">AI Builders</th>
                <th className="p-4 text-xs uppercase tracking-wider text-primary font-bold border-b border-primary/50 bg-primary/5 rounded-t-xl relative">
                  <span className="relative z-10">Nucleate</span>
                  <div className="absolute inset-0 bg-primary/10 blur-sm rounded-t-xl" />
                </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-border">
                <td className="p-4 text-foreground font-medium">Uses your components</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-foreground font-semibold bg-primary/5">Yes (Automatic)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="p-4 text-foreground font-medium">Enforces design tokens</td>
                <td className="p-4 text-muted-foreground">Manual</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-foreground font-semibold bg-primary/5">Strictly Enforced</td>
              </tr>
              <tr className="border-b border-border">
                <td className="p-4 text-foreground font-medium">Works on existing codebase</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-foreground font-semibold bg-primary/5">Yes</td>
              </tr>
              <tr>
                <td className="p-4 text-foreground font-medium">PR to repo</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-foreground font-semibold bg-primary/5 rounded-b-xl">Direct GitHub PR</td>
              </tr>
            </tbody>
          </table>
        </motion.div>
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
    <section className="py-24 bg-background border-t border-border">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-medium text-foreground mb-4">Questions?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 max-w-4xl mx-auto">
          {featuredFAQs.map((faq, index) => (
            <div key={index} className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-lg font-medium text-foreground mb-3">{faq.q}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
