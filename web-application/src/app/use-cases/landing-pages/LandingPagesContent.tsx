"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Rocket,
  Megaphone,
  Calendar,
  Clock,
  FileText,
  DollarSign,
  Palette,
  MessageSquare,
  BarChart3,
  Zap,
  CheckCircle2,
  ArrowRight,
  Image as ImageIcon,
  Type,
  MousePointer,
  Layout,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import UseCasePageLayout from "@/components/use-cases/UseCasePageLayout";

/**
 * Landing Pages Use Case Page Content
 * Target audience: Marketers, Growth teams, Founders
 */
export default function LandingPagesContent() {
  return (
    <UseCasePageLayout accentColor="amber">
      <HeroSection />
      <ExamplesSection />
      <ProblemSection />
      <ValuePropsSection />
      <CTASection />
    </UseCasePageLayout>
  );
}

/**
 * Hero Section with animated landing page builder visualization
 */
function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex flex-col justify-center px-4 md:px-6 pt-20 md:pt-24 pb-12 md:pb-16 overflow-hidden">
      {/* Background gradient orbs - hidden on mobile */}
      <div className="hidden md:block absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-amber-500/15 rounded-full blur-[120px] pointer-events-none opacity-50" />
      <div className="hidden md:block absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-orange-500/10 rounded-full blur-[100px] pointer-events-none opacity-40" />

      <div className="container mx-auto max-w-6xl w-full relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text content */}
          <div className="text-center lg:text-left">
            <Badge
              variant="outline"
              className="mb-6 border-amber-500/30 bg-amber-500/10 text-amber-400 px-4 py-1"
            >
              For Marketing Teams
            </Badge>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-foreground mb-6">
              Launch landing pages without waiting for dev
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              On-brand marketing pages in minutes, not sprints
            </p>

            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-medium transition-all duration-300 hover:scale-105 text-base bg-amber-500 text-white hover:bg-amber-600"
            >
              Start Creating
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Right: Animated visual */}
          <div className="flex justify-center lg:justify-end">
            <LandingPageBuilderAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Animated visualization showing a landing page building itself
 * 6-7 second full build cycle, then reset
 */
function LandingPageBuilderAnimation() {
  const [phase, setPhase] = useState(0);
  const totalPhases = 8;
  const phaseDuration = 750; // ~6 seconds for 8 phases
  const pauseDuration = 1500;

  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (phase < totalPhases) {
          setPhase(phase + 1);
        } else {
          setPhase(0);
        }
      },
      phase === totalPhases ? pauseDuration : phaseDuration
    );

    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <div className="w-full max-w-md relative">
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
        {/* Browser chrome */}
        <div className="bg-accent/50 border-b border-border px-4 py-3 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-background/50 rounded-md px-3 py-1 text-xs text-muted-foreground">
              your-product.com
            </div>
          </div>
        </div>

        {/* Landing page content */}
        <div className="p-4 space-y-3 min-h-[350px] bg-background/50 relative">
          {/* Navigation */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{
              opacity: phase >= 1 ? 1 : 0,
              y: phase >= 1 ? 0 : -10,
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex justify-between items-center"
          >
            <div className="w-20 h-3 bg-amber-500/60 rounded" />
            <div className="flex gap-2 items-center">
              <div className="w-12 h-2 bg-muted rounded" />
              <div className="w-12 h-2 bg-muted rounded" />
              <div className="w-16 h-6 bg-amber-500 rounded text-[8px] text-white flex items-center justify-center font-medium">
                Get Started
              </div>
            </div>
          </motion.div>

          {/* Hero headline - typing effect */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 2 ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="pt-6 pb-2"
          >
            <div className="flex items-center gap-1 justify-center mb-2">
              <Type className="w-3 h-3 text-amber-500/60" />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: phase >= 2 ? "80%" : 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-4 bg-foreground/80 rounded overflow-hidden"
              />
            </div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: phase >= 2 ? "60%" : 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="h-2 bg-muted-foreground/40 rounded mx-auto"
            />
          </motion.div>

          {/* Hero image sliding in */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{
              opacity: phase >= 3 ? 1 : 0,
              x: phase >= 3 ? 0 : 20,
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex justify-center"
          >
            <div className="w-3/4 h-20 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg border border-amber-500/20 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-amber-500/40" />
            </div>
          </motion.div>

          {/* CTA button appearing */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: phase >= 4 ? 1 : 0,
              scale: phase >= 4 ? 1 : 0.8,
            }}
            transition={{ duration: 0.3, ease: "backOut" }}
            className="flex justify-center pt-2"
          >
            <div className="flex items-center gap-1">
              <MousePointer className="w-3 h-3 text-amber-500/60" />
              <div className="w-24 h-7 bg-amber-500 rounded-md flex items-center justify-center">
                <span className="text-[9px] text-white font-medium">
                  Start Free Trial
                </span>
              </div>
            </div>
          </motion.div>

          {/* Features section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{
              opacity: phase >= 5 ? 1 : 0,
              y: phase >= 5 ? 0 : 10,
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="grid grid-cols-3 gap-2 pt-4"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: phase >= 5 ? 1 : 0,
                  y: phase >= 5 ? 0 : 10,
                }}
                transition={{
                  duration: 0.3,
                  delay: i * 0.1,
                  ease: "easeOut",
                }}
                className="bg-card border border-border/50 rounded-lg p-2"
              >
                <div className="w-5 h-5 bg-amber-500/20 rounded mb-1.5 flex items-center justify-center">
                  <Layout className="w-3 h-3 text-amber-500/60" />
                </div>
                <div className="w-full h-1.5 bg-muted rounded mb-1" />
                <div className="w-2/3 h-1 bg-muted/60 rounded" />
              </motion.div>
            ))}
          </motion.div>

          {/* Testimonials */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{
              opacity: phase >= 6 ? 1 : 0,
              y: phase >= 6 ? 0 : 10,
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="bg-accent/30 rounded-lg p-3 flex items-center gap-3"
          >
            <div className="flex -space-x-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 border-2 border-background"
                />
              ))}
            </div>
            <div className="flex-1">
              <div className="flex gap-0.5 mb-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star
                    key={i}
                    className="w-2.5 h-2.5 fill-amber-500 text-amber-500"
                  />
                ))}
              </div>
              <div className="w-3/4 h-1.5 bg-muted rounded" />
            </div>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 7 ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-border/50 pt-3 flex justify-between items-center"
          >
            <div className="w-16 h-2 bg-muted rounded" />
            <div className="flex gap-2">
              <div className="w-4 h-4 bg-muted/60 rounded" />
              <div className="w-4 h-4 bg-muted/60 rounded" />
              <div className="w-4 h-4 bg-muted/60 rounded" />
            </div>
          </motion.div>

          {/* Success overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 8 ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-green-500/10 backdrop-blur-[1px] flex items-center justify-center rounded-b-2xl"
          >
            <div className="bg-green-500/20 text-green-400 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-green-500/30">
              <CheckCircle2 className="w-4 h-4" />
              Ready to publish
            </div>
          </motion.div>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex justify-center gap-1.5 mt-4">
        {Array.from({ length: totalPhases }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i < phase ? "bg-amber-500" : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Examples Section - Grid of 6 page types
 */
function ExamplesSection() {
  const pageTypes = [
    {
      icon: <Rocket className="w-5 h-5" />,
      title: "Product Launch Page",
      description:
        "Announce new products with compelling visuals and clear CTAs",
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    },
    {
      icon: <Megaphone className="w-5 h-5" />,
      title: "Feature Announcement",
      description:
        "Highlight new features with demos and benefit-focused copy",
      color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    },
    {
      icon: <Calendar className="w-5 h-5" />,
      title: "Event Registration",
      description:
        "Drive signups with agenda, speakers, and countdown timers",
      color: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    },
    {
      icon: <Clock className="w-5 h-5" />,
      title: "Waitlist / Coming Soon",
      description: "Build anticipation and capture early interest",
      color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    },
    {
      icon: <FileText className="w-5 h-5" />,
      title: "Case Study Showcase",
      description:
        "Tell customer success stories with data and testimonials",
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
    {
      icon: <DollarSign className="w-5 h-5" />,
      title: "Pricing Page",
      description:
        "Present plans clearly with comparison tables and FAQs",
      color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-card/30 border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4">
            Pages you can launch today
          </h2>
          <p className="text-muted-foreground text-lg">
            From idea to published in minutes
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {pageTypes.map((page, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="p-5 md:p-6 rounded-2xl bg-card border border-border group transition-all duration-300 hover:-translate-y-2 hover:border-amber-500/30"
            >
              <div
                className={`w-12 h-12 rounded-xl ${page.color} border flex items-center justify-center mb-4 transition-transform group-hover:rotate-6`}
              >
                {page.icon}
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {page.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {page.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Problem Section - Timeline comparison showing traditional vs Nucleate workflow
 */
function ProblemSection() {
  return (
    <section className="py-16 md:py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradients - hidden on mobile */}
      <div
        className="hidden md:block absolute top-0 left-1/4 w-[300px] h-[300px] bg-red-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse"
        style={{ animationDuration: "10s" }}
      />
      <div
        className="hidden md:block absolute bottom-0 right-1/4 w-[250px] h-[250px] bg-amber-600/10 rounded-full blur-[80px] pointer-events-none animate-pulse"
        style={{ animationDuration: "12s", animationDelay: "2s" }}
      />

      <div className="container mx-auto px-4 md:px-6 max-w-5xl relative z-10">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4">
            Marketing shouldn&apos;t wait on engineering
          </h2>
          <p className="text-muted-foreground text-lg">
            See the difference in your workflow
          </p>
        </div>

        <div className="space-y-8">
          {/* Traditional timeline */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">
                  Traditional Way
                </h3>
                <p className="text-sm text-red-400">Weeks to launch</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
              {[
                "Brief",
                "Design",
                "Dev queue",
                "Development",
                "QA",
                "Launch",
              ].map((step, idx, arr) => (
                <div key={idx} className="flex items-center gap-1 md:gap-2">
                  <div className="px-2 md:px-3 py-1 md:py-1.5 bg-accent rounded-lg text-muted-foreground border border-border">
                    {step}
                  </div>
                  {idx < arr.length - 1 && (
                    <ArrowRight className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground/50 hidden sm:block" />
                  )}
                </div>
              ))}
              <div className="w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 font-medium text-center">
                2-4 weeks
              </div>
            </div>
          </motion.div>

          {/* Nucleate timeline */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-card border border-amber-500/30 rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">
                  With Nucleate
                </h3>
                <p className="text-sm text-amber-400">Minutes to launch</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
              {["Describe", "Preview", "Publish"].map((step, idx, arr) => (
                <div key={idx} className="flex items-center gap-1 md:gap-2">
                  <div className="px-2 md:px-3 py-1 md:py-1.5 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
                    {step}
                  </div>
                  {idx < arr.length - 1 && (
                    <ArrowRight className="w-3 h-3 md:w-4 md:h-4 text-amber-500/50 hidden sm:block" />
                  )}
                </div>
              ))}
              <div className="w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0 px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20 font-medium text-center">
                Minutes
              </div>
            </div>
          </motion.div>
        </div>

        {/* Visual comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-12 flex justify-center"
        >
          <div className="flex items-center gap-4 sm:gap-8">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-red-400">
                14+
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">days before</div>
            </div>
            <ArrowRight className="w-6 h-6 md:w-8 md:h-8 text-amber-500" />
            <div className="text-center">
              <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-green-400">
                15
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">minutes now</div>
            </div>
          </div>
        </motion.div>
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
      icon: <Palette className="w-6 h-6" />,
      title: "Always on-brand",
      description: "Uses your design system automatically",
      color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      hoverBorder: "hover:border-purple-500/40",
    },
    {
      icon: <MessageSquare className="w-6 h-6" />,
      title: "No code required",
      description: "Describe what you want, see it built",
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      hoverBorder: "hover:border-blue-500/40",
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Iterate instantly",
      description: "A/B test headlines, layouts, CTAs",
      color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      hoverBorder: "hover:border-amber-500/40",
    },
    {
      icon: <CheckCircle2 className="w-6 h-6" />,
      title: "Production-ready",
      description: "Export clean code or publish directly",
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      hoverBorder: "hover:border-emerald-500/40",
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-card/30 border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4">
            Built for marketing velocity
          </h2>
          <p className="text-muted-foreground text-lg">
            Everything you need to ship landing pages fast
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {valueProps.map((prop, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className={`p-5 md:p-6 rounded-2xl bg-card border border-border group transition-all duration-300 hover:-translate-y-2 ${prop.hoverBorder}`}
            >
              <div
                className={`w-14 h-14 rounded-xl ${prop.color} border flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}
              >
                {prop.icon}
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
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
 * CTA Section - Final call to action
 */
function CTASection() {
  return (
    <section className="py-16 md:py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-amber-500/5 via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 max-w-4xl relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6 md:mb-8">
            <Rocket className="w-7 h-7 md:w-8 md:h-8 text-amber-400" />
          </div>

          <h2 className="text-2xl md:text-4xl lg:text-5xl font-medium text-foreground mb-4 md:mb-6">
            Launch your next landing page
          </h2>

          <p className="text-muted-foreground text-base md:text-lg mb-8 max-w-xl mx-auto">
            Join marketing teams shipping pages in minutes instead of weeks
          </p>

          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-medium transition-all duration-300 hover:scale-105 text-base bg-amber-500 text-white hover:bg-amber-600"
          >
            Start Creating
            <ArrowRight className="w-4 h-4" />
          </Link>

          <p className="text-sm text-muted-foreground mt-4">
            No credit card required
          </p>
        </motion.div>
      </div>
    </section>
  );
}
