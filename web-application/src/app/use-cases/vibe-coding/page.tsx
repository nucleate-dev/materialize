"use client";

import UseCasePageLayout from "@/components/use-cases/UseCasePageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Eye,
  RefreshCw,
  Rocket,
  Check,
  X,
  FolderOpen,
  Plug,
  Terminal,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

/**
 * Vibe Coding Use Case Page
 * Target audience: Developers, Technical Founders
 */
export default function VibeCodingPage() {
  return (
    <UseCasePageLayout accentColor="violet">
      <HeroSection />
      <WorkflowSection />
      <DifferentiationSection />
      <ValuePropsSection />
      <CTASection />
    </UseCasePageLayout>
  );
}

/**
 * HERO SECTION
 * With animated split view showing chat and live preview
 */
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex flex-col justify-center px-4 md:px-6 pt-20 md:pt-24 pb-12 md:pb-16 overflow-hidden">
      {/* Background accents - hidden on mobile */}
      <div className="hidden md:block absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-violet-500/20 rounded-full blur-[120px] pointer-events-none opacity-40" />
      <div className="hidden md:block absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-blue-500/15 rounded-full blur-[100px] pointer-events-none opacity-30" />

      <div className="container mx-auto max-w-6xl w-full relative z-10">
        <div className="text-center mb-12">
          <Badge
            variant="outline"
            className="mb-6 border-violet-500/30 bg-violet-500/10 text-violet-400 px-4 py-1"
          >
            For Developers
          </Badge>

          <h1 className="text-3xl md:text-5xl lg:text-7xl font-medium tracking-tight text-foreground mb-6">
            From vibes to code
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">
              in one conversation
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Build apps the way you think about them - describe, see, refine, ship
          </p>

          <Link href="/register">
            <Button
              size="lg"
              className="bg-violet-600 hover:bg-violet-700 text-white px-8 py-6 text-lg rounded-full"
            >
              Start Vibe Coding
            </Button>
          </Link>
        </div>

        {/* Animated Visual */}
        <AnimatedHeroVisual />
      </div>
    </section>
  );
}

/**
 * Animated Hero Visual Component
 * Split view showing chat messages and live preview updating
 */
function AnimatedHeroVisual() {
  const messages = [
    { text: "Build a dashboard with user stats", delay: 0 },
    { text: "Add a dark mode toggle", delay: 3000 },
    { text: "Make the charts animate", delay: 6000 },
  ];

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [previewState, setPreviewState] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const cycleMessages = () => {
      setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
      setDisplayedText("");
      setIsTyping(true);
    };

    // Type out current message
    const currentMessage = messages[currentMessageIndex].text;
    if (displayedText.length < currentMessage.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(currentMessage.slice(0, displayedText.length + 1));
      }, 50);
      return () => clearTimeout(timeout);
    } else {
      setIsTyping(false);
      // Update preview after typing completes
      const previewTimeout = setTimeout(() => {
        setPreviewState(currentMessageIndex);
      }, 500);

      // Move to next message
      const nextTimeout = setTimeout(cycleMessages, 2500);
      return () => {
        clearTimeout(previewTimeout);
        clearTimeout(nextTimeout);
      };
    }
  }, [displayedText, currentMessageIndex, messages]);

  return (
    <div className="relative max-w-5xl mx-auto mt-8">
      <div className="absolute -inset-1 bg-gradient-to-r from-violet-500/20 to-blue-500/20 rounded-2xl blur-lg opacity-50" />
      <div className="relative bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
        {/* Window header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-accent/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="text-xs text-muted-foreground ml-2">
            Nucleate - Vibe Coding
          </span>
        </div>

        {/* Split view */}
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[400px]">
          {/* Chat Panel */}
          <div className="border-r border-border p-4 bg-background/50">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <MessageSquare className="w-3 h-3" />
              Chat
            </div>
            <div className="space-y-3">
              {messages.slice(0, currentMessageIndex + 1).map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-violet-400">You</span>
                  </div>
                  <div className="bg-accent rounded-lg px-3 py-2 text-sm">
                    {idx === currentMessageIndex ? (
                      <>
                        {displayedText}
                        {isTyping && (
                          <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />
                        )}
                      </>
                    ) : (
                      msg.text
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Preview Panel */}
          <div className="p-4 bg-zinc-900">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Eye className="w-3 h-3" />
              Live Preview
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={previewState}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="rounded-lg overflow-hidden"
              >
                <PreviewContent state={previewState} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Preview content that changes based on state
 */
function PreviewContent({ state }: { state: number }) {
  const isDark = state >= 1;

  return (
    <div
      className={`rounded-lg p-4 transition-colors duration-300 ${
        isDark ? "bg-zinc-800" : "bg-white"
      }`}
    >
      {/* Dashboard header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}
        >
          Dashboard
        </h3>
        {state >= 1 && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`w-8 h-4 rounded-full ${isDark ? "bg-violet-500" : "bg-zinc-300"} relative`}
          >
            <motion.div
              className="absolute w-3 h-3 bg-white rounded-full top-0.5"
              animate={{ left: isDark ? "calc(100% - 14px)" : "2px" }}
            />
          </motion.div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Users", value: "2,451" },
          { label: "Revenue", value: "$12.4k" },
          { label: "Growth", value: "+24%" },
        ].map((stat, idx) => (
          <div
            key={idx}
            className={`p-2 rounded ${isDark ? "bg-zinc-700" : "bg-zinc-100"}`}
          >
            <div
              className={`text-[10px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}
            >
              {stat.label}
            </div>
            <div
              className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-900"}`}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div
        className={`h-20 rounded ${isDark ? "bg-zinc-700" : "bg-zinc-100"} flex items-end justify-around px-2 pb-2`}
      >
        {[40, 65, 45, 80, 55, 70, 90].map((height, idx) => (
          <motion.div
            key={idx}
            className={`w-4 rounded-t ${isDark ? "bg-violet-500" : "bg-violet-400"}`}
            initial={{ height: 0 }}
            animate={{ height: state >= 2 ? `${height}%` : `${height * 0.7}%` }}
            transition={{
              duration: state >= 2 ? 0.6 : 0,
              delay: state >= 2 ? idx * 0.1 : 0,
              ease: "easeOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * WORKFLOW SECTION
 * 4 steps: Describe, See, Refine, Ship
 */
function WorkflowSection() {
  const steps = [
    {
      icon: MessageSquare,
      title: "Describe",
      description: "Chat naturally about what you want to build",
      color: "violet",
    },
    {
      icon: Eye,
      title: "See",
      description: "Watch it come to life in real-time preview",
      color: "blue",
    },
    {
      icon: RefreshCw,
      title: "Refine",
      description: "Iterate with follow-up requests",
      color: "emerald",
    },
    {
      icon: Rocket,
      title: "Ship",
      description: "Export code or open a PR when ready",
      color: "amber",
    },
  ];

  const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    violet: {
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
      text: "text-violet-400",
    },
    blue: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      text: "text-blue-400",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      text: "text-emerald-400",
    },
    amber: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      text: "text-amber-400",
    },
  };

  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-background border-t border-border">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-4">
            The vibe coding workflow
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Build at the speed of thought
          </p>
        </div>

        {/* Steps as connected flow */}
        <div className="relative">
          {/* Connection line - desktop */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500/30 via-blue-500/30 via-emerald-500/30 to-amber-500/30 -translate-y-1/2" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const colors = colorClasses[step.color];
              return (
                <div key={idx} className="relative">
                  <div className="bg-card border border-border rounded-2xl p-5 md:p-6 hover:border-border/80 transition-all h-full">
                    <div
                      className={`w-14 h-14 ${colors.bg} rounded-xl flex items-center justify-center mb-4 border ${colors.border}`}
                    >
                      <Icon className={`w-7 h-7 ${colors.text}`} />
                    </div>
                    <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
                      Step {idx + 1}
                    </div>
                    <h3 className="text-xl font-medium mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * DIFFERENTIATION SECTION
 * Comparison table: Other AI Builders vs Nucleate
 */
function DifferentiationSection() {
  const features = [
    { name: "Your existing codebase", others: false, nucleate: true },
    { name: "Respects your architecture", others: false, nucleate: true },
    { name: "Full file system access", others: "Limited", nucleate: true },
    { name: "Package installation", others: "Limited", nucleate: true },
    { name: "MCP integration", others: false, nucleate: true },
  ];

  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-accent/30 border-y border-border">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-4">
            Not another AI toy
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
            Real development capabilities, not a limited sandbox
          </p>
        </div>

        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr>
                <th className="p-3 md:p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
                  Feature
                </th>
                <th className="p-3 md:p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border text-center">
                  Other AI Builders
                </th>
                <th className="p-3 md:p-4 text-xs uppercase tracking-wider text-violet-400 font-bold border-b border-violet-500/50 bg-violet-500/5 rounded-t-xl text-center">
                  Nucleate
                </th>
              </tr>
            </thead>
            <tbody className="text-xs md:text-sm">
              {features.map((feature, idx) => (
                <tr key={idx} className="border-b border-border">
                  <td className="p-3 md:p-4 text-foreground font-medium">
                    {feature.name}
                  </td>
                  <td className="p-3 md:p-4 text-center">
                    {feature.others === true ? (
                      <Check className="w-4 h-4 md:w-5 md:h-5 text-emerald-500 mx-auto" />
                    ) : feature.others === false ? (
                      <X className="w-4 h-4 md:w-5 md:h-5 text-red-500/70 mx-auto" />
                    ) : (
                      <span className="text-muted-foreground text-xs md:text-sm">
                        {feature.others}
                      </span>
                    )}
                  </td>
                  <td className="p-3 md:p-4 bg-violet-500/5 text-center">
                    {feature.nucleate === true ? (
                      <Check className="w-4 h-4 md:w-5 md:h-5 text-emerald-500 mx-auto" />
                    ) : feature.nucleate === false ? (
                      <X className="w-4 h-4 md:w-5 md:h-5 text-red-500/70 mx-auto" />
                    ) : (
                      <span className="text-foreground font-semibold text-xs md:text-sm">
                        {feature.nucleate}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/**
 * VALUE PROPS SECTION
 * 4 value propositions for developers
 */
function ValuePropsSection() {
  const props = [
    {
      icon: Layers,
      title: "Your stack",
      description: "Next.js, Expo, React Native - whatever you use",
      color: "blue",
    },
    {
      icon: Terminal,
      title: "Real development environment",
      description: "Not a sandbox toy, actual files",
      color: "emerald",
    },
    {
      icon: FolderOpen,
      title: "Full file access",
      description: "Install packages, edit configs, run scripts",
      color: "violet",
    },
    {
      icon: Plug,
      title: "MCP integration",
      description: "Works with Claude Code, Cursor, and more",
      color: "amber",
    },
  ];

  const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    blue: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      text: "text-blue-400",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      text: "text-emerald-400",
    },
    violet: {
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
      text: "text-violet-400",
    },
    amber: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      text: "text-amber-400",
    },
  };

  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-background">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {props.map((prop, idx) => {
            const Icon = prop.icon;
            const colors = colorClasses[prop.color];
            return (
              <div
                key={idx}
                className="bg-card border border-border rounded-2xl p-6 md:p-8 hover:border-border/80 transition-all group"
              >
                <div
                  className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center mb-4 border ${colors.border}`}
                >
                  <Icon className={`w-6 h-6 ${colors.text}`} />
                </div>
                <h3 className="text-xl font-medium mb-2">{prop.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {prop.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * CTA SECTION
 * Final call to action
 */
function CTASection() {
  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-gradient-to-b from-background to-violet-500/5 border-t border-border">
      <div className="container mx-auto max-w-3xl text-center">
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-4 md:mb-6">
          Start building
        </h2>
        <p className="text-base md:text-lg text-muted-foreground mb-8 md:mb-10 max-w-xl mx-auto">
          Turn your ideas into working code with natural conversation
        </p>
        <Link href="/register">
          <Button
            size="lg"
            className="bg-violet-600 hover:bg-violet-700 text-white px-10 py-6 text-lg rounded-full"
          >
            Try Vibe Coding
          </Button>
        </Link>
      </div>
    </section>
  );
}
