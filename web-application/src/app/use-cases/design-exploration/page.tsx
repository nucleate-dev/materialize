"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Layers,
  Workflow,
  Download,
  GitBranch,
  Check,
  X,
  Minus,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";

/**
 * Design Exploration Use Case Page
 * Target audience: Designers, Design Systems teams, PMs
 */
export default function DesignExplorationPage() {
  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        <HeroSection />

        <InteractiveDemoSection />

        <ProblemSection />

        <ValuePropsSection />

        <CTASection />

        <Footer />
      </div>
    </main>
  );
}

/**
 * Hero Section with animated visual
 */
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex flex-col justify-center px-4 md:px-6 pt-20 md:pt-24 pb-12 md:pb-16 overflow-hidden">
      {/* Background gradient orbs - hidden on mobile */}
      <div className="hidden md:block absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-40" />
      <div className="hidden md:block absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-purple-500/15 rounded-full blur-[100px] pointer-events-none opacity-30" />

      <div className="container mx-auto max-w-7xl w-full relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Content */}
          <div className="text-center lg:text-left">
            <Badge
              variant="outline"
              className="mb-6 border-primary/30 bg-primary/10 text-primary px-4 py-1"
            >
              For Design Teams
            </Badge>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-foreground mb-6 leading-tight">
              See 10 variants in minutes,{" "}
              <span className="text-primary">not 1 in a week</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              Explore design options using your real components, not generic
              mockups. Ship the variant you choose directly to code.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link href="/register">
                <Button
                  size="lg"
                  className="px-8 py-6 text-base font-medium rounded-full hover:scale-105 transition-transform"
                >
                  Start Exploring
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: Animated Visual */}
          <div className="flex justify-center lg:justify-end">
            <VariantCycleAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Animated visual showing a component cycling through different style variants
 */
function VariantCycleAnimation() {
  const [activeVariant, setActiveVariant] = useState(0);

  const variants = [
    {
      name: "Minimal",
      card: {
        bg: "bg-white",
        border: "border border-zinc-200",
        radius: "rounded-lg",
        shadow: "shadow-sm",
        textColor: "text-zinc-900",
        mutedColor: "text-zinc-500",
      },
      button: {
        bg: "bg-zinc-900",
        text: "text-white",
        radius: "rounded-md",
      },
    },
    {
      name: "Brutalist",
      card: {
        bg: "bg-zinc-950",
        border: "border-2 border-white",
        radius: "rounded-none",
        shadow: "shadow-none",
        textColor: "text-white",
        mutedColor: "text-zinc-400",
      },
      button: {
        bg: "bg-white",
        text: "text-black",
        radius: "rounded-none",
      },
    },
    {
      name: "Glassmorphism",
      card: {
        bg: "bg-white/10 backdrop-blur-xl",
        border: "border border-white/20",
        radius: "rounded-2xl",
        shadow: "shadow-2xl",
        textColor: "text-white",
        mutedColor: "text-white/60",
      },
      button: {
        bg: "bg-white/20 backdrop-blur-sm border border-white/30",
        text: "text-white",
        radius: "rounded-full",
      },
    },
    {
      name: "Soft",
      card: {
        bg: "bg-gradient-to-br from-rose-50 to-orange-50",
        border: "border border-rose-200/50",
        radius: "rounded-3xl",
        shadow: "shadow-xl shadow-rose-200/30",
        textColor: "text-rose-900",
        mutedColor: "text-rose-600/70",
      },
      button: {
        bg: "bg-gradient-to-r from-rose-500 to-orange-500",
        text: "text-white",
        radius: "rounded-full",
      },
    },
    {
      name: "Neon",
      card: {
        bg: "bg-zinc-900",
        border: "border border-cyan-500/50",
        radius: "rounded-xl",
        shadow: "shadow-[0_0_30px_rgba(6,182,212,0.3)]",
        textColor: "text-cyan-100",
        mutedColor: "text-cyan-400/70",
      },
      button: {
        bg: "bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.5)]",
        text: "text-black",
        radius: "rounded-lg",
      },
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveVariant((prev) => (prev + 1) % variants.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [variants.length]);

  const currentVariant = variants[activeVariant];

  return (
    <div className="relative w-full max-w-sm">
      {/* Gradient background for glassmorphism */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-3xl opacity-60 blur-xl scale-95" />

      {/* Card container */}
      <motion.div
        key={activeVariant}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={`relative p-6 ${currentVariant.card.bg} ${currentVariant.card.border} ${currentVariant.card.radius} ${currentVariant.card.shadow} transition-all duration-500`}
      >
        {/* Style label */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-mono font-medium rounded-full"
        >
          {currentVariant.name}
        </motion.div>

        {/* Card content */}
        <div className="space-y-4 pt-2">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center`}
            >
              <div className="w-4 h-4 rounded-full bg-primary" />
            </div>
            <div className="flex-1">
              <div
                className={`font-semibold ${currentVariant.card.textColor}`}
              >
                Product Card
              </div>
              <div className={`text-sm ${currentVariant.card.mutedColor}`}>
                Component Preview
              </div>
            </div>
          </div>

          {/* Image placeholder */}
          <div
            className={`w-full h-32 bg-gradient-to-br from-primary/20 to-primary/5 ${currentVariant.card.radius} flex items-center justify-center`}
          >
            <div className={`text-4xl ${currentVariant.card.mutedColor}`}>
              <Layers className="w-10 h-10" />
            </div>
          </div>

          {/* Text content */}
          <div className="space-y-2">
            <div className={`font-medium ${currentVariant.card.textColor}`}>
              Modern Headphones
            </div>
            <div className={`text-sm ${currentVariant.card.mutedColor}`}>
              Premium wireless audio experience with noise cancellation.
            </div>
          </div>

          {/* Price and CTA */}
          <div className="flex items-center justify-between pt-2">
            <div className={`text-xl font-bold ${currentVariant.card.textColor}`}>
              $299
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 text-sm font-medium ${currentVariant.button.bg} ${currentVariant.button.text} ${currentVariant.button.radius} transition-all`}
            >
              Add to Cart
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Variant indicators */}
      <div className="flex justify-center gap-2 mt-6">
        {variants.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveVariant(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              activeVariant === i ? "bg-primary w-6" : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Interactive Demo Section with 3 card variants
 */
function InteractiveDemoSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const cardVariants = [
    {
      name: "Clean / Minimal",
      description: "Simple, focused design with ample whitespace",
      styles: {
        container: "bg-white border border-zinc-100 rounded-xl shadow-sm",
        avatar: "bg-zinc-100",
        title: "text-zinc-900",
        subtitle: "text-zinc-500",
        button: "bg-zinc-900 text-white rounded-md hover:bg-zinc-800",
        badge: "bg-zinc-100 text-zinc-700",
      },
    },
    {
      name: "Bold / Dark",
      description: "High contrast with strong visual presence",
      styles: {
        container: "bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl",
        avatar: "bg-gradient-to-br from-purple-600 to-blue-600",
        title: "text-white",
        subtitle: "text-zinc-400",
        button: "bg-white text-zinc-900 rounded-md hover:bg-zinc-100",
        badge: "bg-purple-600/20 text-purple-400 border border-purple-500/30",
      },
    },
    {
      name: "Soft / Rounded",
      description: "Gentle curves with warm, inviting feel",
      styles: {
        container:
          "bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/50 rounded-3xl shadow-lg shadow-orange-200/30",
        avatar: "bg-gradient-to-br from-amber-400 to-orange-500",
        title: "text-amber-900",
        subtitle: "text-amber-700/70",
        button:
          "bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full hover:shadow-lg hover:shadow-orange-300/50",
        badge: "bg-amber-100 text-amber-700",
      },
    },
  ];

  return (
    <section
      ref={sectionRef}
      className="py-16 md:py-24 bg-background border-y border-border relative overflow-hidden"
    >
      {/* Background accents - hidden on mobile */}
      <div className="hidden md:block absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="hidden md:block absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 max-w-7xl relative z-10">
        <div className="text-center mb-12 md:mb-16 max-w-4xl mx-auto">
          <Badge
            variant="outline"
            className="mb-4 border-border bg-accent text-muted-foreground"
          >
            Explore Instantly
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4 md:mb-6">
            One component.{" "}
            <span className="text-primary">Infinite possibilities.</span>
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl font-normal">
            See how the same component transforms across different design
            directions, using your real code.
          </p>
        </div>

        {/* Card Variants Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {cardVariants.map((variant, index) => (
            <motion.div
              key={variant.name}
              initial={{ opacity: 0, y: 40 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="flex flex-col"
            >
              {/* Label */}
              <div className="text-center mb-4">
                <div className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
                  Variant {String.fromCharCode(65 + index)}
                </div>
                <div className="text-foreground font-medium">{variant.name}</div>
              </div>

              {/* Card */}
              <div className={`${variant.styles.container} p-6 flex-1`}>
                {/* User info */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-12 h-12 rounded-full ${variant.styles.avatar} flex items-center justify-center text-white font-bold`}
                  >
                    JD
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold ${variant.styles.title}`}>
                      John Doe
                    </div>
                    <div className={`text-sm ${variant.styles.subtitle}`}>
                      Product Designer
                    </div>
                  </div>
                  <div
                    className={`px-2 py-1 text-xs font-medium rounded-full ${variant.styles.badge}`}
                  >
                    Pro
                  </div>
                </div>

                {/* Content */}
                <p className={`text-sm mb-4 ${variant.styles.subtitle}`}>
                  Building beautiful interfaces that users love. Currently
                  exploring new design systems.
                </p>

                {/* Stats */}
                <div className="flex gap-6 mb-4">
                  <div>
                    <div className={`font-bold ${variant.styles.title}`}>
                      2.4k
                    </div>
                    <div className={`text-xs ${variant.styles.subtitle}`}>
                      Followers
                    </div>
                  </div>
                  <div>
                    <div className={`font-bold ${variant.styles.title}`}>
                      186
                    </div>
                    <div className={`text-xs ${variant.styles.subtitle}`}>
                      Projects
                    </div>
                  </div>
                </div>

                {/* Action */}
                <button
                  className={`w-full py-2.5 text-sm font-medium transition-all ${variant.styles.button}`}
                >
                  Follow
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Problem Section with comparison table
 */
function ProblemSection() {
  const comparisons = [
    {
      feature: "Design exploration speed",
      figma: "Hours per variant",
      aiTools: "Minutes, but generic",
      nucleate: "Minutes with your components",
    },
    {
      feature: "Uses your design system",
      figma: false,
      aiTools: false,
      nucleate: true,
    },
    {
      feature: "Real, shippable code",
      figma: false,
      aiTools: "Sometimes",
      nucleate: true,
    },
    {
      feature: "All states included",
      figma: "Manual recreation",
      aiTools: "Rarely",
      nucleate: "Auto-generated",
    },
    {
      feature: "Export to repo",
      figma: false,
      aiTools: "Copy/paste",
      nucleate: "Direct GitHub PR",
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-card/50 border-y border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="text-center mb-12 md:mb-16">
          <Badge
            variant="outline"
            className="mb-4 border-border bg-accent text-muted-foreground"
          >
            The Problem
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4 md:mb-6">
            Stop recreating everything in Figma
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto">
            Manual mockups waste time and never match the real thing. AI tools
            ignore your design system. There&apos;s a better way.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr>
                <th className="p-3 md:p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
                  Feature
                </th>
                <th className="p-3 md:p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
                  Figma
                </th>
                <th className="p-3 md:p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
                  AI Tools
                </th>
                <th className="p-3 md:p-4 text-xs uppercase tracking-wider text-primary font-bold border-b border-primary/50 bg-primary/5 rounded-t-xl relative">
                  <span className="relative z-10">Nucleate</span>
                  <div className="absolute inset-0 bg-primary/10 blur-sm rounded-t-xl" />
                </th>
              </tr>
            </thead>
            <tbody className="text-xs md:text-sm">
              {comparisons.map((row, index) => (
                <tr
                  key={row.feature}
                  className={
                    index < comparisons.length - 1 ? "border-b border-border" : ""
                  }
                >
                  <td className="p-3 md:p-4 text-foreground font-medium">
                    {row.feature}
                  </td>
                  <td className="p-3 md:p-4 text-muted-foreground">
                    {typeof row.figma === "boolean" ? (
                      row.figma ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <X className="w-5 h-5 text-red-500/60" />
                      )
                    ) : (
                      row.figma
                    )}
                  </td>
                  <td className="p-3 md:p-4 text-muted-foreground">
                    {typeof row.aiTools === "boolean" ? (
                      row.aiTools ? (
                        <Check className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
                      ) : (
                        <X className="w-4 h-4 md:w-5 md:h-5 text-red-500/60" />
                      )
                    ) : row.aiTools === "Sometimes" || row.aiTools === "Rarely" ? (
                      <span className="flex items-center gap-1 md:gap-2">
                        <Minus className="w-4 h-4 md:w-5 md:h-5 text-yellow-500" />
                        <span className="hidden sm:inline">{row.aiTools}</span>
                      </span>
                    ) : (
                      row.aiTools
                    )}
                  </td>
                  <td
                    className={`p-3 md:p-4 text-foreground font-semibold bg-primary/5 ${
                      index === comparisons.length - 1 ? "rounded-b-xl" : ""
                    }`}
                  >
                    {typeof row.nucleate === "boolean" ? (
                      row.nucleate ? (
                        <Check className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
                      ) : (
                        <X className="w-4 h-4 md:w-5 md:h-5 text-red-500/60" />
                      )
                    ) : (
                      <span className="flex items-center gap-1 md:gap-2">
                        <Check className="w-4 h-4 md:w-5 md:h-5 text-green-500 flex-shrink-0" />
                        <span className="hidden sm:inline">{row.nucleate}</span>
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
 * Value Props Section
 */
function ValuePropsSection() {
  const valueProps = [
    {
      icon: <GitBranch className="w-6 h-6" />,
      title: "Real components from your repo",
      description:
        "Not AI-generated lookalikes. Nucleate uses your actual Button, Card, and Modal components from GitHub.",
    },
    {
      icon: <Layers className="w-6 h-6" />,
      title: "All states included",
      description:
        "Empty, loading, error, and success states generated automatically. No more manual recreation for every scenario.",
    },
    {
      icon: <Workflow className="w-6 h-6" />,
      title: "User flows too",
      description:
        "Complete onboarding sequences, checkout flows, and multi-step forms. Explore entire journeys, not just screens.",
    },
    {
      icon: <Download className="w-6 h-6" />,
      title: "Export the winner",
      description:
        "Ship the variant you choose directly to code. Create a PR with one click and move on to the next problem.",
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-background border-b border-border relative overflow-hidden">
      {/* Background gradient - hidden on mobile */}
      <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 max-w-6xl relative z-10">
        <div className="text-center mb-12 md:mb-16">
          <Badge
            variant="outline"
            className="mb-4 border-primary/30 bg-primary/10 text-primary"
          >
            Why Nucleate
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4 md:mb-6">
            Design exploration that actually ships
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto">
            From idea to production-ready code without the endless back and
            forth.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          {valueProps.map((prop, index) => (
            <motion.div
              key={prop.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-card rounded-2xl border border-border p-6 md:p-8 hover:border-primary/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
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
 * CTA Section
 */
function CTASection() {
  return (
    <section className="py-16 md:py-24 bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5" />
      <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 max-w-3xl relative z-10 text-center">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4 md:mb-6">
          Explore variants now
        </h2>
        <p className="text-muted-foreground text-lg md:text-xl mb-8 md:mb-10 max-w-xl mx-auto">
          Stop spending days on mockups. See real design options in minutes and
          ship the winner.
        </p>

        <Link href="/register">
          <Button
            size="lg"
            className="px-10 py-6 text-lg font-medium rounded-full hover:scale-105 transition-transform shadow-lg shadow-primary/25"
          >
            Start Exploring
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </Link>

        <p className="text-muted-foreground text-sm mt-6">
          Free to start. No credit card required.
        </p>
      </div>
    </section>
  );
}
