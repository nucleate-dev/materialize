"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  Code2,
  Cog,
  Database,
  FileSearch,
  GitMerge,
  Layers,
  LineChart,
  MessageSquare,
  Rocket,
  Server,
  Shield,
  Target,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";

export default function AgentsLandingPage() {
  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-emerald-500/30 overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        <HeroSection />
        <SocialProofSection />
        <IntegrationSection />
        <TransformationSection />
        <EngagementModelSection />
        <CaseStudiesSection />
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
    <section className="relative min-h-[90vh] flex flex-col justify-center px-6 pt-32 pb-24">
      <div className="container mx-auto max-w-5xl w-full text-center">
        <Badge
          variant="outline"
          className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 px-4 py-1"
        >
          Enterprise AI Systems
        </Badge>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-foreground mb-8">
          Custom AI Agents
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500 dark:from-emerald-400 dark:to-teal-400">
            for your business.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
          Custom implementations that automate entire departments end-to-end,
          avoiding generalized software and lengthy timelines.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button
            size="lg"
            className="bg-foreground text-background hover:bg-foreground/90 px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
            asChild
          >
            <Link href="mailto:team@nucleate.dev">
              Get In Touch
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Floating elements */}
      <div className="absolute top-1/4 left-10 w-64 h-64 bg-emerald-600/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-64 h-64 bg-teal-600/10 blur-[100px] rounded-full pointer-events-none" />
    </section>
  );
}

/**
 * SOCIAL PROOF SECTION
 */
function SocialProofSection() {
  return (
    <section className="py-16 border-y border-border bg-muted/50 backdrop-blur-sm">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <div className="text-5xl md:text-6xl font-bold text-foreground mb-2">
              $1.1M+
            </div>
            <p className="text-muted-foreground text-lg">
              Average client savings per fiscal year
            </p>
          </div>

          <div className="h-px md:h-20 w-full md:w-px bg-border" />

          <div className="text-center md:text-right max-w-md">
            <p className="text-muted-foreground leading-relaxed">
              We partner with medium and enterprise size organizations.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * INTEGRATION SECTION
 */
function IntegrationSection() {
  const integrations = [
    { icon: <Database className="w-6 h-6" />, name: "ERP Systems" },
    { icon: <Users className="w-6 h-6" />, name: "CRM Platforms" },
    { icon: <LineChart className="w-6 h-6" />, name: "Finance Tools" },
    { icon: <Server className="w-6 h-6" />, name: "Data Warehouses" },
    { icon: <MessageSquare className="w-6 h-6" />, name: "Communication" },
    { icon: <Workflow className="w-6 h-6" />, name: "Workflow Tools" },
  ];

  return (
    <section className="py-24 px-6 bg-background">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <Badge
            variant="outline"
            className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
          >
            Seamless Integration
          </Badge>
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4 text-foreground">
            Deep integration with your
            <br />
            existing stack.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            Agents connect directly to ERP, CRM, and finance systems without
            migration or platform changes.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {integrations.map((integration, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 text-center hover:border-emerald-500/30 transition-all group"
            >
              <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-4 mx-auto text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                {integration.icon}
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                {integration.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * TRANSFORMATION SECTION
 */
function TransformationSection() {
  const transformations = [
    {
      icon: <Layers className="w-6 h-6" />,
      title: "End-to-End Automation",
      description:
        "We replace entire process chains, not individual tasks. Your teams operate 3x more effectively.",
    },
    {
      icon: <Brain className="w-6 h-6" />,
      title: "Intelligent Decision Making",
      description:
        "AI agents that understand context, learn from patterns, and make informed decisions autonomously.",
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Real-Time Processing",
      description:
        "No batch jobs. No overnight runs. Your agents work in real-time, responding to events as they happen.",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Enterprise Security",
      description:
        "SOC 2 compliant. Your data never leaves your infrastructure. Full audit trails and access controls.",
    },
  ];

  return (
    <section className="py-24 px-6 bg-muted/30 border-y border-border relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-teal-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-medium tracking-tight mb-6 text-foreground">
            We don&apos;t automate tasks.
            <br />
            <span className="text-emerald-600 dark:text-emerald-400">We transform departments.</span>
          </h2>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
            End-to-end workflow automation replacing entire process chains,
            enabling teams to function 3x more effectively.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {transformations.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-8 hover:border-emerald-500/30 transition-all"
            >
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {item.icon}
              </div>
              <h3 className="text-xl font-medium mb-3 text-foreground">{item.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * ENGAGEMENT MODEL SECTION
 */
function EngagementModelSection() {
  const phases = [
    {
      number: "01",
      title: "Technical Audit",
      description:
        "Deep dive into your systems, workflows, and pain points. We identify the highest-impact opportunities for AI automation.",
      icon: <FileSearch className="w-6 h-6" />,
    },
    {
      number: "02",
      title: "Architecture",
      description:
        "Custom agent architecture designed for your specific needs. Integration points, data flows, and security models defined.",
      icon: <GitMerge className="w-6 h-6" />,
    },
    {
      number: "03",
      title: "Development",
      description:
        "Rapid, iterative development with weekly demos. Your team is involved at every step to ensure alignment.",
      icon: <Code2 className="w-6 h-6" />,
    },
    {
      number: "04",
      title: "Deployment",
      description:
        "Production rollout with monitoring, alerting, and continuous improvement. We stay engaged post-launch.",
      icon: <Rocket className="w-6 h-6" />,
    },
  ];

  return (
    <section className="py-24 px-6 bg-background">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <Badge
            variant="outline"
            className="mb-4 border-border bg-muted text-muted-foreground"
          >
            Engagement Model
          </Badge>
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4 text-foreground">
            From audit to autonomous execution.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            A proven process that delivers results, not promises.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {phases.map((phase, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative"
            >
              {/* Connecting line */}
              {index < phases.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[calc(100%_-_12px)] w-[calc(100%_-_48px)] h-px bg-gradient-to-r from-emerald-500/50 to-transparent z-0" />
              )}

              <div className="bg-card border border-border rounded-2xl p-6 relative z-10 h-full">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {phase.icon}
                  </div>
                  <span className="text-4xl font-bold text-muted-foreground/20">
                    {phase.number}
                  </span>
                </div>
                <h3 className="text-lg font-medium mb-3 text-foreground">{phase.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {phase.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * CASE STUDIES SECTION
 */
function CaseStudiesSection() {
  const caseStudies = [
    {
      industry: "Fortune 1000 Health System",
      department: "Financial Operations",
      icon: <Building2 className="w-6 h-6" />,
      metric: "6-8 days",
      metricLabel: "Month-end close",
      previousMetric: "from 12-15 days",
      value: "$1.1M-$1.3M",
      valueLabel: "Annual value",
      color: "emerald",
    },
    {
      industry: "Pre-IPO SaaS",
      department: "Sales Operations",
      icon: <Target className="w-6 h-6" />,
      metric: "20-30%",
      metricLabel: "Faster deal cycles",
      previousMetric: "",
      value: "$4.0M-$5.5M",
      valueLabel: "ARR impact",
      color: "blue",
    },
    {
      industry: "Fortune 1000 Manufacturer",
      department: "Procurement",
      icon: <Cog className="w-6 h-6" />,
      metric: "35%",
      metricLabel: "Leakage captured",
      previousMetric: "",
      value: "$4.5M-$7.0M",
      valueLabel: "Recovered",
      color: "teal",
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; text: string }> =
      {
        emerald: {
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
          text: "text-emerald-600 dark:text-emerald-400",
        },
        blue: {
          bg: "bg-blue-500/10",
          border: "border-blue-500/20",
          text: "text-blue-600 dark:text-blue-400",
        },
        teal: {
          bg: "bg-teal-500/10",
          border: "border-teal-500/20",
          text: "text-teal-600 dark:text-teal-400",
        },
      };
    return colors[color] || colors.emerald;
  };

  return (
    <section className="py-24 px-6 bg-muted/30 border-y border-border">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <Badge
            variant="outline"
            className="mb-4 border-border bg-muted text-muted-foreground"
          >
            Case Studies
          </Badge>
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4 text-foreground">
            Real results. Real impact.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            See how leading organizations have transformed their operations
            with Nucleate Agents.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {caseStudies.map((study, index) => {
            const colors = getColorClasses(study.color);
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-card border border-border rounded-2xl p-6 hover:border-primary/30 transition-all"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className={`w-10 h-10 ${colors.bg} rounded-xl flex items-center justify-center ${colors.text} border ${colors.border}`}
                  >
                    {study.icon}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {study.industry}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {study.department}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-3xl font-bold ${colors.text}`}>
                        {study.metric}
                      </span>
                      {study.previousMetric && (
                        <span className="text-sm text-muted-foreground">
                          {study.previousMetric}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {study.metricLabel}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <div className="text-2xl font-bold text-foreground">
                      {study.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {study.valueLabel}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
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
    <section className="py-32 px-6 bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-4xl text-center relative z-10">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
            <Bot className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>

        <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
          Schedule a consultation with
          <br />
          our principal architects.
        </h2>

        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-10">
          Learn how Nucleate Agents can transform your operations. No sales
          pitch—just a technical discussion about what&apos;s possible.
        </p>

        <Button
          size="lg"
          className="bg-foreground text-background hover:bg-foreground/90 px-10 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
          asChild
        >
          <Link href="mailto:team@nucleate.dev">
            Get In Touch
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </Button>

        <div className="mt-16 flex flex-wrap justify-center items-center gap-8 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>No commitment required</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Technical deep-dive</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Custom roadmap</span>
          </div>
        </div>
      </div>
    </section>
  );
}
