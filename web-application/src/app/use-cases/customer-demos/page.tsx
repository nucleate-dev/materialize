"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Building2,
  GitFork,
  Heart,
  Layers,
  Palette,
  Rocket,
  Shield,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

// SEO metadata needs to be in a separate file for client components
// or we use generateMetadata in a parent layout

const prospects = [
  {
    name: "Acme Corp",
    color: "#3B82F6", // blue
    bgGradient: "from-blue-500/20 to-blue-600/10",
    accentColor: "blue",
  },
  {
    name: "TechStart Inc",
    color: "#10B981", // emerald
    bgGradient: "from-emerald-500/20 to-emerald-600/10",
    accentColor: "emerald",
  },
  {
    name: "Global Finance",
    color: "#8B5CF6", // violet
    bgGradient: "from-violet-500/20 to-violet-600/10",
    accentColor: "violet",
  },
];

export default function CustomerDemosPage() {
  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        <HeroSection />
        <UseCaseExamplesSection />
        <ProblemSection />
        <ValuePropsSection />
        <CTASection />

        <Footer />
      </div>
    </main>
  );
}

/**
 * HERO SECTION
 */
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex flex-col justify-center px-4 md:px-6 pt-24 md:pt-32 pb-16 md:pb-24">
      <div className="container mx-auto max-w-6xl w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Content */}
          <div className="text-center lg:text-left">
            <Badge
              variant="outline"
              className="mb-6 border-primary/30 bg-primary/10 text-primary px-4 py-1"
            >
              For Sales Teams
            </Badge>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-foreground mb-6">
              Demos that match your prospect,{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/70">
                not a generic script
              </span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed">
              Always up-to-date. Always on-brand. Always personalized.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center">
              <Button
                size="lg"
                className="bg-foreground text-background hover:bg-foreground/90 px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
                asChild
              >
                <Link href="/register">
                  Start Building Demos
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Right side - Animated Visual */}
          <div className="flex justify-center lg:justify-end">
            <AnimatedDemoVisual />
          </div>
        </div>
      </div>

      {/* Floating elements - hidden on mobile to prevent overflow */}
      <div className="hidden md:block absolute top-1/4 left-10 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="hidden md:block absolute bottom-1/4 right-10 w-64 h-64 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
    </section>
  );
}

/**
 * ANIMATED DEMO VISUAL
 */
function AnimatedDemoVisual() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % prospects.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const currentProspect = prospects[currentIndex];

  return (
    <div className="relative w-full max-w-md">
      {/* Demo screen container */}
      <motion.div
        className="relative bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Browser chrome */}
        <div className="bg-muted/50 border-b border-border px-4 py-3 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
            <div className="w-3 h-3 rounded-full bg-green-400/60" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-background/50 rounded-md px-3 py-1 text-xs text-muted-foreground text-center">
              demo.yourproduct.com
            </div>
          </div>
        </div>

        {/* Demo content */}
        <div className="p-6 min-h-[320px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5 }}
            >
              {/* Company header with animated gradient */}
              <motion.div
                className={`bg-gradient-to-r ${currentProspect.bgGradient} rounded-xl p-4 mb-6`}
                animate={{
                  background: `linear-gradient(to right, ${currentProspect.color}20, ${currentProspect.color}10)`,
                }}
                transition={{ duration: 0.5 }}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${currentProspect.color}30` }}
                    animate={{ backgroundColor: `${currentProspect.color}30` }}
                    transition={{ duration: 0.5 }}
                  >
                    <Building2
                      className="w-6 h-6"
                      style={{ color: currentProspect.color }}
                    />
                  </motion.div>
                  <div>
                    <motion.h3
                      className="font-semibold text-foreground"
                      key={currentProspect.name}
                    >
                      {currentProspect.name}
                    </motion.h3>
                    <p className="text-sm text-muted-foreground">
                      Custom Demo Environment
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Fake UI elements */}
              <div className="space-y-4">
                <div className="flex gap-3">
                  <motion.div
                    className="h-8 rounded-md flex-1"
                    style={{ backgroundColor: `${currentProspect.color}15` }}
                    animate={{
                      backgroundColor: `${currentProspect.color}15`,
                    }}
                    transition={{ duration: 0.5 }}
                  />
                  <div className="h-8 w-24 bg-muted rounded-md" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      className="h-20 rounded-lg border border-border/50 p-3"
                      style={{
                        borderColor:
                          i === 1 ? `${currentProspect.color}40` : undefined,
                      }}
                      animate={{
                        borderColor:
                          i === 1 ? `${currentProspect.color}40` : undefined,
                      }}
                      transition={{ duration: 0.5 }}
                    >
                      <div
                        className="w-8 h-8 rounded-md mb-2"
                        style={{
                          backgroundColor:
                            i === 1
                              ? `${currentProspect.color}20`
                              : "hsl(var(--muted))",
                        }}
                      />
                      <div className="h-2 w-full bg-muted rounded" />
                    </motion.div>
                  ))}
                </div>
                <motion.div
                  className="h-10 rounded-lg flex items-center justify-center text-sm font-medium text-white"
                  style={{ backgroundColor: currentProspect.color }}
                  animate={{ backgroundColor: currentProspect.color }}
                  transition={{ duration: 0.5 }}
                >
                  Get Started with {currentProspect.name}
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Prospect indicators */}
      <div className="flex justify-center gap-2 mt-6">
        {prospects.map((prospect, index) => (
          <button
            key={prospect.name}
            onClick={() => setCurrentIndex(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentIndex
                ? "w-8 bg-primary"
                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
            aria-label={`View ${prospect.name} demo`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * USE CASE EXAMPLES SECTION
 */
function UseCaseExamplesSection() {
  const examples = [
    {
      icon: <Heart className="w-6 h-6" />,
      title: "Healthcare prospect",
      description: "Show HIPAA-relevant flows and compliance features",
      color: "rose",
    },
    {
      icon: <Building2 className="w-6 h-6" />,
      title: "Enterprise deal",
      description: "Customize with their brand colors and data examples",
      color: "blue",
    },
    {
      icon: <Rocket className="w-6 h-6" />,
      title: "Startup pitch",
      description: "Highlight speed and developer experience",
      color: "emerald",
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; text: string }> =
      {
        rose: {
          bg: "bg-rose-500/10",
          border: "border-rose-500/20",
          text: "text-rose-600 dark:text-rose-400",
        },
        blue: {
          bg: "bg-blue-500/10",
          border: "border-blue-500/20",
          text: "text-blue-600 dark:text-blue-400",
        },
        emerald: {
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
          text: "text-emerald-600 dark:text-emerald-400",
        },
      };
    return colors[color] || colors.blue;
  };

  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-muted/30 border-y border-border">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-4 text-foreground">
            Personalize for every deal
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            Tailor your demo to resonate with each prospect&apos;s unique needs
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {examples.map((example, index) => {
            const colors = getColorClasses(example.color);
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-card border border-border rounded-2xl p-8 hover:border-primary/30 transition-all group"
              >
                <div
                  className={`w-14 h-14 ${colors.bg} rounded-xl flex items-center justify-center mb-6 ${colors.text} border ${colors.border} group-hover:scale-110 transition-transform`}
                >
                  {example.icon}
                </div>
                <h3 className="text-xl font-medium mb-3 text-foreground">
                  {example.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {example.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * PROBLEM SECTION
 */
function ProblemSection() {
  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-background relative overflow-hidden">
      {/* Background accents - hidden on mobile */}
      <div className="hidden md:block absolute top-0 left-1/4 w-[500px] h-[500px] bg-destructive/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="hidden md:block absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto max-w-5xl relative z-10">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-4 text-foreground">
            Generic demos don&apos;t close deals
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Path A - Generic */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            className="relative bg-card border border-border rounded-2xl p-8 opacity-60"
          >
            <div className="absolute -top-3 left-6">
              <Badge
                variant="outline"
                className="bg-muted text-muted-foreground border-border"
              >
                Path A
              </Badge>
            </div>
            <div className="space-y-6 pt-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                  <Layers className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-foreground">Generic demo environment</span>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 md:rotate-0" />
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-muted-foreground">
                  Doesn&apos;t resonate
                </span>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90 md:rotate-0" />
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <X className="w-5 h-5 text-destructive" />
                </div>
                <span className="text-destructive font-medium">Lost deal</span>
              </div>
            </div>
          </motion.div>

          {/* Path B - Personalized (Highlighted) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            className="relative bg-card border-2 border-primary/50 rounded-2xl p-8 shadow-lg shadow-primary/5"
          >
            <div className="absolute -top-3 left-6">
              <Badge className="bg-primary text-primary-foreground border-primary">
                Path B
              </Badge>
            </div>
            <div className="space-y-6 pt-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <span className="text-foreground font-medium">
                  Custom demo per prospect
                </span>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="w-5 h-5 text-primary rotate-90 md:rotate-0" />
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <span className="text-foreground">
                  Shows exactly their use case
                </span>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="w-5 h-5 text-primary rotate-90 md:rotate-0" />
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-emerald-500" />
                </div>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  Closed deal
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/**
 * VALUE PROPS SECTION
 */
function ValuePropsSection() {
  const valueProps = [
    {
      icon: <Users className="w-6 h-6" />,
      title: "Create per vertical/prospect",
      description: "Tailor messaging for each opportunity",
    },
    {
      icon: <Palette className="w-6 h-6" />,
      title: "Looks exactly like your product",
      description: "Uses your real UI components",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Update without engineering",
      description: "Sales can customize messaging directly",
    },
    {
      icon: <GitFork className="w-6 h-6" />,
      title: "Fork and customize in minutes",
      description: "Start from templates, personalize fast",
    },
  ];

  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-muted/30 border-y border-border">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {valueProps.map((prop, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-5 md:p-6 hover:border-primary/30 transition-all text-center group"
            >
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6 mx-auto text-primary border border-primary/20 group-hover:scale-110 transition-transform">
                {prop.icon}
              </div>
              <h3 className="text-lg font-medium mb-2 text-foreground">
                {prop.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
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
 * CTA SECTION
 */
function CTASection() {
  return (
    <section className="py-20 md:py-32 px-4 md:px-6 bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-4xl text-center relative z-10">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
        </div>

        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-4 md:mb-6 text-foreground">
          Create your first demo environment
        </h2>

        <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto mb-8 md:mb-10">
          Start building personalized demos that close deals faster. No
          engineering required.
        </p>

        <Button
          size="lg"
          className="bg-foreground text-background hover:bg-foreground/90 px-10 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
          asChild
        >
          <Link href="/register">
            Start Building Demos
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
