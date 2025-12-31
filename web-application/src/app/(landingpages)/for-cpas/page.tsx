"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCreatePrototype } from "@/hooks/useCreatePrototype";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { setChatIntent } from "@/lib/utils/chatIntentUtils";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  MessageSquare,
  PenLine,
  Search,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CPALandingPage() {
  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-emerald-500/30 overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        <HeroSection />
        <PainPointsSection />
        <WhatWeBuildSection />
        <AIChatSection />
        <FeaturesSection />
        <CTASection />
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
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user } = useUser();

  const handleGetStarted = async () => {
    if (isLoading) return;

    setIsLoading(true);
    logger.log({
      event: "client_vertical_landing_cta_clicked",
      properties: { vertical: "cpa", source: "hero" },
    });

    try {
      if (!user?.id) {
        setChatIntent(undefined, "I need a professional website for my accounting firm", false);
        router.push("/login");
        return;
      }

      const result = await createPrototype({ framework: "web_nextjs_react", creation_source: "vertical_landing_cpa" });

      if (result.data) {
        setChatIntent(result.data.prototype_id, "I need a professional website for my accounting firm with pages for services, about us, and a contact form for client inquiries", false);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      }
    } catch (err) {
      logger.error(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="relative min-h-[85vh] flex flex-col justify-center px-6 py-24 pt-32">
      <div className="container mx-auto max-w-5xl w-full text-center">
        <Badge variant="outline" className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
          AI Website Builder for Accountants
        </Badge>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground via-foreground to-foreground/60 pb-2 mb-6">
          A professional website <br className="hidden md:block" />
          for your accounting firm
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Build a client-ready website in minutes. Update it anytime by chatting with AI.
          No designers, no developers, no hassle.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Button
            onClick={handleGetStarted}
            disabled={isLoading}
            size="lg"
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
          >
            {isLoading ? "Creating..." : "Build my accounting website"}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <span className="text-sm text-muted-foreground">Free to start</span>
        </div>

        {/* Website Preview */}
        <div className="max-w-4xl mx-auto relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-3xl blur-xl opacity-50"></div>
          <div className="relative bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
            {/* Browser Chrome */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-background/50 rounded-full px-4 py-1.5 text-xs text-muted-foreground max-w-md mx-auto">
                  smithandersonCPA.com
                </div>
              </div>
            </div>

            {/* Website Content Preview */}
            <div className="p-8 bg-gradient-to-b from-muted/30 to-card">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <Calculator className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="font-semibold text-foreground">Smith & Anderson CPA</span>
                </div>
                <div className="hidden md:flex gap-6 text-sm text-muted-foreground">
                  <span>Services</span>
                  <span>About</span>
                  <span>Contact</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="text-left">
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                    Expert Tax & Accounting Services
                  </h2>
                  <p className="text-muted-foreground mb-6 text-sm">
                    Trusted by 500+ businesses. Personal attention, professional results.
                  </p>
                  <div className="flex gap-3">
                    <div className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium">
                      Free Consultation
                    </div>
                    <div className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm">
                      Our Services
                    </div>
                  </div>
                </div>
                <div className="hidden md:grid grid-cols-2 gap-3">
                  {["Tax Preparation", "Bookkeeping", "Payroll", "Business Advisory"].map((service) => (
                    <div key={service} className="bg-background/50 border border-border rounded-lg p-3 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-2" />
                      <span className="text-foreground">{service}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * PAIN POINTS SECTION
 */
function PainPointsSection() {
  const painPoints = [
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Your website is outdated",
      description: "Clients judge credibility in seconds. An old site with stock photos drives them away.",
    },
    {
      icon: <DollarSign className="w-6 h-6" />,
      title: "Agencies charge thousands",
      description: "$3,000-$10,000 for a basic site. Then $100/hour for every small update.",
    },
    {
      icon: <X className="w-6 h-6" />,
      title: "DIY builders are frustrating",
      description: "Squarespace and Wix take hours to learn. The result still looks generic.",
    },
    {
      icon: <PenLine className="w-6 h-6" />,
      title: "Updates are a nightmare",
      description: "Adding a new service or changing hours means calling your developer.",
    },
  ];

  return (
    <section className="py-24 px-6 border-t border-border bg-background">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
            Sound familiar?
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Most CPAs and accountants face these exact problems with their websites.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {painPoints.map((point, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-red-500/30 transition-all group"
            >
              <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mb-4 text-red-500 dark:text-red-400 group-hover:bg-red-500/20 transition-colors">
                {point.icon}
              </div>
              <h3 className="text-xl font-medium text-foreground mb-2">{point.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{point.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * WHAT WE BUILD SECTION
 */
function WhatWeBuildSection() {
  const components = [
    {
      icon: <FileText className="w-5 h-5" />,
      title: "Professional Pages",
      items: ["Home", "Services", "About Us", "Contact"],
    },
    {
      icon: <Calculator className="w-5 h-5" />,
      title: "Your Services",
      items: ["Tax Preparation", "Bookkeeping", "Payroll", "Advisory"],
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: "Lead Capture Forms",
      items: ["Consultation requests", "New client intake", "Email notifications"],
    },
    {
      icon: <MessageSquare className="w-5 h-5" />,
      title: "AI Chat Editing",
      items: ["Update content instantly", "Add new services", "Change anything"],
    },
  ];

  return (
    <section className="py-24 px-6 border-t border-border bg-muted/30">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            What You Get
          </Badge>
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
            Everything your firm needs online
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            A complete, professional website built for accounting firms. Not a template—a custom site for your practice.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {components.map((component, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-emerald-500/30 transition-all"
            >
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 text-emerald-600 dark:text-emerald-400">
                {component.icon}
              </div>
              <h3 className="text-lg font-medium text-foreground mb-4">{component.title}</h3>
              <ul className="space-y-2">
                {component.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * AI CHAT SECTION
 */
function AIChatSection() {
  const chatExamples = [
    { user: "Add a new service for estate planning", ai: "Done! I've added Estate Planning to your services page with a description and added it to the navigation." },
    { user: "Change our office hours to 8am-6pm", ai: "Updated! Your contact page now shows Monday-Friday, 8:00 AM - 6:00 PM." },
    { user: "Add a testimonial from Johnson Industries", ai: "Added! The testimonial is now displayed on your homepage with their logo." },
  ];

  return (
    <section className="py-24 px-6 border-t border-border bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="outline" className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
              The Difference
            </Badge>
            <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
              Update your website by chatting
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              No more waiting for developers. No more learning complicated editors.
              Just tell Nucleate what you want to change, and it happens instantly.
            </p>

            <div className="space-y-4">
              {[
                "Add new services in seconds",
                "Update your bio or team page",
                "Change contact info, hours, anything",
                "Add client testimonials",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Demo */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <span className="font-medium text-foreground">Nucleate AI</span>
            </div>

            <div className="space-y-4">
              {chatExamples.map((example, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className="space-y-3"
                >
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-2xl rounded-br-md px-4 py-2 max-w-[80%]">
                      <p className="text-sm text-foreground">{example.user}</p>
                    </div>
                  </div>
                  {/* AI response */}
                  <div className="flex justify-start">
                    <div className="bg-muted border border-border rounded-2xl rounded-bl-md px-4 py-2 max-w-[80%]">
                      <p className="text-sm text-muted-foreground">{example.ai}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-border">
              <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-3">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">Type your update...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * FEATURES SECTION
 */
function FeaturesSection() {
  const features = [
    {
      icon: <Search className="w-6 h-6" />,
      title: "SEO Optimized",
      description: "Show up when clients search for 'CPA near me' or 'accountant in [your city]'.",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Professional & Secure",
      description: "HTTPS, fast hosting, and a design that builds trust with potential clients.",
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Ready in Minutes",
      description: "Not weeks. Describe your firm and get a complete website same day.",
    },
  ];

  return (
    <section className="py-24 px-6 border-t border-border bg-muted/30">
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 text-emerald-600 dark:text-emerald-400 mx-auto">
                {feature.icon}
              </div>
              <h3 className="text-xl font-medium text-foreground mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
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
  const logger = useProductLogger();
  const { createPrototype } = useCreatePrototype();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user } = useUser();

  const handleGetStarted = async () => {
    if (isLoading) return;

    setIsLoading(true);
    logger.log({
      event: "client_vertical_landing_cta_clicked",
      properties: { vertical: "cpa", source: "bottom_cta" },
    });

    try {
      if (!user?.id) {
        setChatIntent(undefined, "I need a professional website for my accounting firm", false);
        router.push("/login");
        return;
      }

      const result = await createPrototype({ framework: "web_nextjs_react", creation_source: "vertical_landing_cpa" });

      if (result.data) {
        setChatIntent(result.data.prototype_id, "I need a professional website for my accounting firm with pages for services, about us, and a contact form for client inquiries", false);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      }
    } catch (err) {
      logger.error(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="py-24 px-6 border-t border-border bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-4xl text-center relative z-10">
        <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
          Ready to grow your practice?
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
          Join hundreds of accounting firms who&apos;ve upgraded their online presence with Nucleate.
        </p>

        <Button
          onClick={handleGetStarted}
          disabled={isLoading}
          size="lg"
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
        >
          {isLoading ? "Creating..." : "Build my accounting website"}
          <ArrowRight className="ml-2 w-5 h-5" />
        </Button>

        <p className="mt-6 text-sm text-muted-foreground">
          Free to start. No credit card required.
        </p>
      </div>
    </section>
  );
}

/**
 * FAQ SECTION
 */
function FAQSection() {
  const faqs = [
    {
      q: "How long does it take to build my website?",
      a: "Most accounting firm websites are ready in under 10 minutes. Just describe your firm and services, and Nucleate generates a complete, professional website.",
    },
    {
      q: "Can I update the website myself?",
      a: "Yes! That's the best part. Just chat with Nucleate to make any changes—add services, update your bio, change contact info. No technical skills needed.",
    },
    {
      q: "Will it help me get more clients?",
      a: "Your website is built with SEO best practices so you show up in local searches. Plus, built-in lead capture forms make it easy for potential clients to reach you.",
    },
  ];

  return (
    <section className="py-24 bg-muted/30 border-t border-border">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-medium text-foreground mb-4">Questions?</h2>
          <p className="text-muted-foreground text-lg">Quick answers about Nucleate for accounting firms.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-primary/30 transition-all duration-300"
            >
              <h3 className="text-lg font-medium text-foreground mb-3">{faq.q}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{faq.a}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
