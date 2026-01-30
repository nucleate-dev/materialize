"use client";

import UseCasePageLayout from "@/components/use-cases/UseCasePageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Headphones,
  ShoppingCart,
  Shield,
  BarChart3,
  Settings,
  Package,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  Hourglass,
  Plug,
  Palette,
  Users,
  Lock,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function InternalToolsPage() {
  return (
    <UseCasePageLayout accentColor="blue">
      <HeroSection />
      <ExamplesSection />
      <ProblemSection />
      <ValuePropsSection />
      <CTASection />
    </UseCasePageLayout>
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
              className="mb-6 border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300 px-4 py-1"
            >
              For Operations Teams
            </Badge>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-foreground mb-6">
              Ship internal tools
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-blue-400 dark:to-cyan-400">
                without the engineering queue
              </span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed">
              The admin panel you need, built in hours not months
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center">
              <Button
                size="lg"
                className="bg-foreground text-background hover:bg-foreground/90 px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
                asChild
              >
                <Link href="/register">
                  Get Started
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Right side - Animated Visual */}
          <div className="relative">
            <DashboardAnimation />
          </div>
        </div>
      </div>

      {/* Floating elements - hidden on mobile to prevent overflow */}
      <div className="hidden md:block absolute top-1/4 left-10 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="hidden md:block absolute bottom-1/4 right-10 w-64 h-64 bg-cyan-600/10 blur-[100px] rounded-full pointer-events-none" />
    </section>
  );
}

/**
 * DASHBOARD ANIMATION COMPONENT
 * Shows a dashboard interface assembling itself piece by piece
 */
function DashboardAnimation() {
  const [key, setKey] = useState(0);

  // Reset animation every 6.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setKey((prev) => prev + 1);
    }, 6500);
    return () => clearInterval(interval);
  }, []);

  const widgetVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.9 },
    visible: (delay: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        delay: delay * 0.3,
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
      },
    }),
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="relative w-full aspect-[4/3] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Dashboard Header */}
        <motion.div
          variants={widgetVariants}
          initial="hidden"
          animate="visible"
          custom={0}
          className="absolute top-0 left-0 right-0 h-12 bg-muted/50 border-b border-border flex items-center px-4 gap-2"
        >
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <div className="ml-4 h-4 w-32 bg-muted rounded" />
        </motion.div>

        {/* Sidebar */}
        <motion.div
          variants={widgetVariants}
          initial="hidden"
          animate="visible"
          custom={1}
          className="absolute top-12 left-0 bottom-0 w-16 bg-muted/30 border-r border-border flex flex-col items-center py-4 gap-3"
        >
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded-lg ${i === 0 ? "bg-blue-500/20 border border-blue-500/30" : "bg-muted"}`}
            />
          ))}
        </motion.div>

        {/* Main Content Area */}
        <div className="absolute top-16 left-20 right-4 bottom-4 grid grid-cols-2 gap-3">
          {/* Chart Widget */}
          <motion.div
            variants={widgetVariants}
            initial="hidden"
            animate="visible"
            custom={2}
            className="bg-muted/50 rounded-xl border border-border p-3 flex flex-col"
          >
            <div className="h-3 w-16 bg-muted rounded mb-2" />
            <div className="flex-1 flex items-end gap-1">
              {[40, 65, 45, 80, 55, 70, 60].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ delay: 1.2 + i * 0.1, duration: 0.4 }}
                  className="flex-1 bg-blue-500/40 rounded-t"
                />
              ))}
            </div>
          </motion.div>

          {/* Status Panel */}
          <motion.div
            variants={widgetVariants}
            initial="hidden"
            animate="visible"
            custom={3}
            className="bg-muted/50 rounded-xl border border-border p-3"
          >
            <div className="h-3 w-20 bg-muted rounded mb-3" />
            <div className="space-y-2">
              {[
                { color: "bg-green-500", w: "w-3/4" },
                { color: "bg-blue-500", w: "w-1/2" },
                { color: "bg-amber-500", w: "w-2/3" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${item.color}`} />
                  <div className={`h-2 ${item.w} bg-muted rounded`} />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Data Table */}
          <motion.div
            variants={widgetVariants}
            initial="hidden"
            animate="visible"
            custom={4}
            className="bg-muted/50 rounded-xl border border-border p-3"
          >
            <div className="h-3 w-24 bg-muted rounded mb-3" />
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-2 w-8 bg-muted rounded" />
                  <div className="h-2 flex-1 bg-muted rounded" />
                  <div className="h-2 w-12 bg-muted rounded" />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Form Widget */}
          <motion.div
            variants={widgetVariants}
            initial="hidden"
            animate="visible"
            custom={5}
            className="bg-muted/50 rounded-xl border border-border p-3"
          >
            <div className="h-3 w-16 bg-muted rounded mb-3" />
            <div className="space-y-2">
              <div className="h-6 w-full bg-muted rounded border border-border" />
              <div className="h-6 w-full bg-muted rounded border border-border" />
              <div className="h-5 w-16 bg-blue-500/40 rounded mt-2" />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * EXAMPLES SECTION
 */
function ExamplesSection() {
  const examples = [
    {
      icon: <Headphones className="w-6 h-6" />,
      title: "Customer Support Dashboard",
      description:
        "Track tickets, manage escalations, and monitor response times in one place",
    },
    {
      icon: <ShoppingCart className="w-6 h-6" />,
      title: "Order Management Admin",
      description:
        "Process orders, handle refunds, and manage fulfillment workflows",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Content Moderation Queue",
      description:
        "Review flagged content, approve submissions, and enforce policies",
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Analytics Dashboard",
      description:
        "Visualize key metrics, track KPIs, and generate reports on demand",
    },
    {
      icon: <Settings className="w-6 h-6" />,
      title: "Settings & Config Panels",
      description:
        "Manage feature flags, update configurations, and control access",
    },
    {
      icon: <Package className="w-6 h-6" />,
      title: "Inventory Tracker",
      description:
        "Monitor stock levels, set alerts, and manage warehouse operations",
    },
  ];

  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-muted/30 border-y border-border">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-4 text-foreground">
            Build what you need
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            From simple dashboards to complex workflows, create the tools your
            team actually needs
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {examples.map((example, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-blue-500/30 transition-all group"
            >
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400 border border-blue-500/20 group-hover:bg-blue-500/20 transition-colors">
                {example.icon}
              </div>
              <h3 className="text-lg font-medium mb-2 text-foreground">
                {example.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {example.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * PROBLEM SECTION
 */
function ProblemSection() {
  const problems = [
    {
      icon: <AlertCircle className="w-5 h-5" />,
      text: "Feature requests pile up",
    },
    {
      icon: <Clock className="w-5 h-5" />,
      text: "Engineering bandwidth is limited",
    },
    {
      icon: <FileSpreadsheet className="w-5 h-5" />,
      text: "Teams resort to spreadsheets",
    },
    {
      icon: <Hourglass className="w-5 h-5" />,
      text: "Or wait months for simple tools",
    },
  ];

  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-background relative overflow-hidden">
      {/* Background accents - hidden on mobile */}
      <div className="hidden md:block absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto max-w-4xl relative z-10">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-6 text-foreground">
            Internal tools always
            <br />
            <span className="text-muted-foreground">lose priority</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
          {problems.map((problem, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15 }}
              viewport={{ once: true }}
              className="flex items-center gap-4 bg-card border border-border rounded-xl p-5"
            >
              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                {problem.icon}
              </div>
              <span className="text-foreground font-medium">{problem.text}</span>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 text-muted-foreground mb-4">
            <div className="w-8 h-px bg-border" />
            <span>Then</span>
            <div className="w-8 h-px bg-border" />
          </div>
          <p className="text-2xl md:text-3xl font-medium text-foreground">
            With Nucleate,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-500">
              build it yourself in hours
            </span>
          </p>
        </motion.div>
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
      icon: <Plug className="w-6 h-6" />,
      title: "Integrates with your APIs",
      description:
        "Connect to your existing backend services, databases, and third-party tools seamlessly",
    },
    {
      icon: <Palette className="w-6 h-6" />,
      title: "Matches your product",
      description:
        "Uses your component library and design system so internal tools look professional",
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "Non-engineers can iterate",
      description:
        "Operations teams can update and extend tools without engineering support",
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: "Secure by default",
      description:
        "Built-in role-based access control and audit logs for enterprise compliance",
    },
  ];

  return (
    <section className="py-16 md:py-24 px-4 md:px-6 bg-muted/30 border-y border-border">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {valueProps.map((prop, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-card border border-border rounded-2xl p-6 md:p-8 hover:border-blue-500/30 transition-all"
            >
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-6 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {prop.icon}
              </div>
              <h3 className="text-xl font-medium mb-3 text-foreground">
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
 * CTA SECTION
 */
function CTASection() {
  return (
    <section className="py-20 md:py-32 px-4 md:px-6 bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-4xl text-center relative z-10">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
            <Wrench className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-6 text-foreground">
          Build your internal tool
        </h2>

        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-10">
          Stop waiting on engineering. Start building the tools your team needs
          today.
        </p>

        <Button
          size="lg"
          className="bg-foreground text-background hover:bg-foreground/90 px-10 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
          asChild
        >
          <Link href="/register">
            Get Started
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
