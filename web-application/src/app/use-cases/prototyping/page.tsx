"use client";

import UseCasePageLayout from "@/components/use-cases/UseCasePageLayout";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  MessageSquare,
  Monitor,
  X,
  Check,
  Layers,
  Share2,
  RefreshCw,
  GitPullRequest,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Prototyping & Validation Use Case Page
 * Target audience: PMs, Founders, Researchers
 */
export default function PrototypingPage() {
  return (
    <UseCasePageLayout accentColor="blue">
      <HeroSection />
      <ProblemSection />
      <ValuePropsSection />
      <CTASection />
    </UseCasePageLayout>
  );
}

/**
 * Hero Section with animated PRD → Chat → App visualization
 */
function HeroSection() {
  return (
    <section className="relative min-h-[85vh] flex flex-col justify-center px-4 md:px-6 pt-20 pb-12 overflow-hidden">
      {/* Background gradient orbs - hidden on mobile to prevent overflow */}
      <div className="hidden md:block absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-500/20 rounded-full blur-[120px] pointer-events-none opacity-40" />
      <div className="hidden md:block absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-blue-400/15 rounded-full blur-[100px] pointer-events-none opacity-30" />

      <div className="container mx-auto max-w-6xl w-full relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Content */}
          <div className="text-center lg:text-left">
            <Badge
              variant="outline"
              className="mb-6 border-blue-500/30 bg-blue-500/10 text-blue-500 px-4 py-1"
            >
              For Product Teams
            </Badge>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-foreground mb-6">
              From PRD to prototype in a conversation
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              Test ideas with users before writing a line of production code
            </p>

            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-medium transition-all duration-300 hover:scale-105 text-base bg-blue-500 text-white shadow-lg shadow-blue-500/25"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Right: Animated Visual */}
          <div className="relative">
            <PRDToPrototypeAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Animated visual showing PRD → Chat → Live App transformation
 */
function PRDToPrototypeAnimation() {
  const [stage, setStage] = useState(0);
  const stages = ["prd", "chat", "app"];

  useEffect(() => {
    const interval = setInterval(() => {
      setStage((prev) => (prev + 1) % 3);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative bg-card rounded-3xl border border-border p-6 md:p-8 shadow-2xl overflow-hidden min-h-[400px]">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />

      <div className="relative z-10 h-full flex flex-col">
        {/* Stage indicators */}
        <div className="flex justify-center gap-2 mb-6">
          {stages.map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === stage ? "bg-blue-500 w-6" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Animated content */}
        <div className="flex-1 relative">
          <AnimatePresence mode="wait">
            {stage === 0 && (
              <motion.div
                key="prd"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4">
                  <FileText className="w-10 h-10 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Your PRD
                </h3>
                <div className="w-full max-w-xs space-y-2">
                  <div className="h-2 bg-muted-foreground/20 rounded w-full" />
                  <div className="h-2 bg-muted-foreground/20 rounded w-4/5" />
                  <div className="h-2 bg-muted-foreground/20 rounded w-3/5" />
                </div>
              </motion.div>
            )}

            {stage === 1 && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4">
                  <MessageSquare className="w-10 h-10 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Describe Your Idea
                </h3>
                <div className="w-full max-w-xs space-y-3">
                  <div className="flex gap-2 items-start">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 shrink-0" />
                    <div className="bg-card border border-border rounded-lg p-2 text-xs text-muted-foreground">
                      Build a dashboard with user stats...
                    </div>
                  </div>
                  <div className="flex gap-2 items-start justify-end">
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 text-xs text-blue-400">
                      Creating your prototype...
                    </div>
                    <div className="w-6 h-6 rounded-full bg-muted-foreground/20 shrink-0" />
                  </div>
                </div>
              </motion.div>
            )}

            {stage === 2 && (
              <motion.div
                key="app"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
                  <Monitor className="w-10 h-10 text-emerald-500" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Live Prototype
                </h3>
                <div className="w-full max-w-xs bg-background rounded-xl border border-border p-3 shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded bg-blue-500/20" />
                    <div className="flex-1">
                      <div className="h-2 bg-muted-foreground/20 rounded w-20 mb-1" />
                      <div className="h-1.5 bg-muted-foreground/10 rounded w-16" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-12 bg-blue-500/10 rounded border border-blue-500/20" />
                    <div className="h-12 bg-emerald-500/10 rounded border border-emerald-500/20" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Flow labels */}
        <div className="flex justify-between items-center text-xs text-muted-foreground mt-4 px-4">
          <span>Describe</span>
          <ArrowRight className="w-4 h-4" />
          <span>Build</span>
          <ArrowRight className="w-4 h-4" />
          <span>Test</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Problem Section - Old way vs. Nucleate way
 */
function ProblemSection() {
  const oldWay = [
    { text: "Write PRD", delay: 0 },
    { text: "Wait weeks for engineering", delay: 0.1 },
    { text: "Get feedback too late", delay: 0.2 },
    { text: "Rebuild from scratch", delay: 0.3 },
  ];

  const newWay = [
    { text: "Describe your idea", delay: 0 },
    { text: "See it live instantly", delay: 0.1 },
    { text: "Test with users", delay: 0.2 },
    { text: "Ship when validated", delay: 0.3 },
  ];

  return (
    <section className="py-16 md:py-24 bg-card/30 border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4">
            The old way vs. Nucleate
          </h2>
          <p className="text-muted-foreground text-lg">
            Stop waiting weeks to validate your ideas
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12">
          {/* Old Way */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-card rounded-2xl border border-border p-5 md:p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">
                The Old Way
              </h3>
            </div>

            <div className="space-y-4">
              {oldWay.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: item.delay }}
                  className="flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                    <X className="w-3 h-3 text-red-500" />
                  </div>
                  <span className="text-muted-foreground">{item.text}</span>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-sm text-muted-foreground">
                <span className="text-red-500 font-semibold">Weeks</span> to get
                user feedback
              </div>
            </div>
          </motion.div>

          {/* Nucleate Way */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-card rounded-2xl border border-blue-500/30 p-5 md:p-8 relative overflow-hidden"
          >
            {/* Glow effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Check className="w-5 h-5 text-blue-500" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">
                  The Nucleate Way
                </h3>
              </div>

              <div className="space-y-4">
                {newWay.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: item.delay }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-blue-500" />
                    </div>
                    <span className="text-foreground">{item.text}</span>
                  </motion.div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  <span className="text-blue-500 font-semibold">Minutes</span>{" "}
                  to get user feedback
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/**
 * Value Props Section - 4 key benefits
 */
function ValuePropsSection() {
  const valueProps = [
    {
      icon: <Layers className="w-6 h-6" />,
      title: "Uses your actual components",
      description:
        "Real design system, not throwaway mockups. Every prototype uses your real Button, Card, and Modal components.",
      delay: 0,
    },
    {
      icon: <Share2 className="w-6 h-6" />,
      title: "Share links instantly",
      description:
        "Test with users in minutes, not weeks. Share a live link and gather feedback immediately.",
      delay: 0.1,
    },
    {
      icon: <RefreshCw className="w-6 h-6" />,
      title: "Iterate in real-time",
      description:
        "Make changes while watching user feedback. See what works and pivot instantly.",
      delay: 0.2,
    },
    {
      icon: <GitPullRequest className="w-6 h-6" />,
      title: "Ship as a PR",
      description:
        "When validated, export directly to your repo. No throwaway work.",
      delay: 0.3,
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient - hidden on mobile */}
      <div className="hidden md:block absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 max-w-6xl relative z-10">
        <div className="text-center mb-12 md:mb-16">
          <Badge
            variant="outline"
            className="mb-4 border-blue-500/30 bg-blue-500/10 text-blue-500"
          >
            Built for Validation
          </Badge>
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4">
            Prototype with confidence
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Every feature designed to help you validate faster and ship with
            confidence
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          {valueProps.map((prop, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: prop.delay }}
              className="bg-card rounded-2xl border border-border p-5 md:p-8 hover:border-blue-500/30 transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                {prop.icon}
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {prop.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {prop.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Final CTA Section
 */
function CTASection() {
  return (
    <section className="py-16 md:py-24 bg-card/30 border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4 md:mb-6">
            Turn your next PRD into a prototype
          </h2>
          <p className="text-base md:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Stop waiting weeks for engineering. Start testing with users today.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-medium transition-all duration-300 hover:scale-105 text-base bg-blue-500 text-white shadow-lg shadow-blue-500/25"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
