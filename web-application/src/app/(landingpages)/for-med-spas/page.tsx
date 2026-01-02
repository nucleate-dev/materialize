"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
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

export default function MedSpaLandingPage() {
  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-rose-500/30 overflow-hidden font-sans">
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
  return (
    <section className="relative min-h-[85vh] flex flex-col justify-center px-6 py-24 pt-32">
      <div className="container mx-auto max-w-5xl w-full text-center">
        <Badge variant="outline" className="mb-6 border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300">
          AI Website Builder for Med Spas
        </Badge>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground via-foreground to-foreground/60 pb-2 mb-6">
          A stunning website <br className="hidden md:block" />
          for your med spa
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Build a premium website that books consultations. Update it anytime by chatting with AI.
          No designers, no developers, no hassle.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Button
            size="lg"
            className="bg-rose-500 hover:bg-rose-600 text-white px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
          >
            Book a Call
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>

        {/* Website Preview */}
        <div className="max-w-4xl mx-auto relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-rose-500/20 to-pink-500/20 rounded-3xl blur-xl opacity-50"></div>
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
                  glowmedspa.com
                </div>
              </div>
            </div>

            {/* Website Content Preview */}
            <div className="p-8 bg-gradient-to-b from-muted/30 to-card">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-rose-500/20 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <span className="font-semibold text-foreground">Glow Med Spa</span>
                </div>
                <div className="hidden md:flex gap-6 text-sm text-muted-foreground">
                  <span>Treatments</span>
                  <span>About</span>
                  <span>Gallery</span>
                  <span>Book Now</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="text-left">
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                    Reveal Your Best Self
                  </h2>
                  <p className="text-muted-foreground mb-6 text-sm">
                    Expert aesthetic treatments in a luxurious, welcoming environment.
                  </p>
                  <div className="flex gap-3">
                    <div className="px-4 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium">
                      Book Consultation
                    </div>
                    <div className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm">
                      View Treatments
                    </div>
                  </div>
                </div>
                <div className="hidden md:grid grid-cols-2 gap-3">
                  {["Injectables", "Laser Treatments", "Facials", "Body Contouring"].map((treatment) => (
                    <div key={treatment} className="bg-background/50 border border-border rounded-lg p-3 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-rose-500 mb-2" />
                      <span className="text-foreground">{treatment}</span>
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
      title: "Your website doesn't convert",
      description: "Visitors browse but don't book. Your site looks like a brochure, not a lead machine.",
      solution: "Nucleate builds conversion-focused sites with prominent booking CTAs and treatment pages that sell.",
    },
    {
      icon: <DollarSign className="w-6 h-6" />,
      title: "Marketing agencies are expensive",
      description: "$5,000-$15,000 for a custom site. Then monthly retainers for every little change.",
      solution: "Get a premium website in minutes, free to start. Make unlimited updates yourself.",
    },
    {
      icon: <X className="w-6 h-6" />,
      title: "Standing out is harder than ever",
      description: "The industry grew from 1,600 to 10,000+ med spas. Competition is fierce.",
      solution: "AI generates a unique, custom site for your brand—not a generic template everyone else uses.",
    },
    {
      icon: <PenLine className="w-6 h-6" />,
      title: "Adding new treatments is a pain",
      description: "Every time you add a service or update pricing, you're waiting on your web person.",
      solution: "Just chat to update. Add treatments, change pricing, update photos—instantly, anytime.",
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
            Most med spa owners face these exact problems with their online presence.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {painPoints.map((point, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-rose-500/30 transition-all group"
            >
              <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mb-4 text-red-500 dark:text-red-400 group-hover:bg-red-500/20 transition-colors">
                {point.icon}
              </div>
              <h3 className="text-xl font-medium text-foreground mb-2">{point.title}</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">{point.description}</p>
              <div className="flex items-start gap-2 pt-4 border-t border-border">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{point.solution}</p>
              </div>
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
      title: "Premium Pages",
      items: ["Home", "Treatments", "About / Team", "Gallery", "Contact"],
    },
    {
      icon: <Sparkles className="w-5 h-5" />,
      title: "Your Treatments",
      items: ["Injectables", "Laser", "Facials", "Body Contouring"],
    },
    {
      icon: <Calendar className="w-5 h-5" />,
      title: "Booking & Lead Forms",
      items: ["Consultation requests", "Treatment inquiries", "Email notifications"],
    },
    {
      icon: <MessageSquare className="w-5 h-5" />,
      title: "AI Chat Editing",
      items: ["Update treatments instantly", "Change pricing", "Add before & afters"],
    },
  ];

  return (
    <section className="py-24 px-6 border-t border-border bg-muted/30">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-300">
            What You Get
          </Badge>
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
            Everything your med spa needs online
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            A complete, premium website built for aesthetic practices. Not a template—a custom site for your med spa.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {components.map((component, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-rose-500/30 transition-all"
            >
              <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center mb-4 text-rose-600 dark:text-rose-400">
                {component.icon}
              </div>
              <h3 className="text-lg font-medium text-foreground mb-4">{component.title}</h3>
              <ul className="space-y-2">
                {component.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-rose-500" />
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
    { user: "Add our new hydrafacial treatment at $250", ai: "Done! I've added Hydrafacial to your treatments page with pricing and a description. It's now visible in your treatment menu." },
    { user: "Update Botox pricing to $12 per unit", ai: "Updated! Your Botox treatment now shows $12/unit on the treatments page." },
    { user: "Add Dr. Martinez's credentials to the about page", ai: "Added! Dr. Martinez's bio now includes her board certifications and 10+ years of experience." },
  ];

  return (
    <section className="py-24 px-6 border-t border-border bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="outline" className="mb-4 border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-300">
              The Difference
            </Badge>
            <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
              Update your website by chatting
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              No more waiting for your marketing agency. No more learning complicated editors.
              Just tell Nucleate what you want to change, and it happens instantly.
            </p>

            <div className="space-y-4">
              {[
                "Add new treatments in seconds",
                "Update pricing anytime",
                "Add before & after photos",
                "Showcase team credentials",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-rose-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Demo */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border">
              <Sparkles className="w-5 h-5 text-rose-500" />
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
                    <div className="bg-rose-500/20 border border-rose-500/30 rounded-2xl rounded-br-md px-4 py-2 max-w-[80%]">
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
      description: "Show up when clients search for 'med spa near me' or 'botox in [your city]'.",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Premium & Professional",
      description: "A design that conveys trust and luxury—essential for aesthetic services.",
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Ready in Minutes",
      description: "Not weeks. Describe your med spa and get a complete website same day.",
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
              <div className="w-14 h-14 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-6 text-rose-600 dark:text-rose-400 mx-auto">
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
  return (
    <section className="py-24 px-6 border-t border-border bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-4xl text-center relative z-10">
        <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
          Ready to attract more clients?
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
          Join med spas who&apos;ve upgraded their online presence with Nucleate.
        </p>

        <Button
          size="lg"
          className="bg-rose-500 hover:bg-rose-600 text-white px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
        >
          Book a Call
          <ArrowRight className="ml-2 w-5 h-5" />
        </Button>
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
      a: "Most med spa websites are ready in under 10 minutes. Just describe your practice and treatments, and Nucleate generates a complete, premium website.",
    },
    {
      q: "Can I add before & after photos?",
      a: "Absolutely! You can add before & after galleries, update them anytime, and organize them by treatment type—all through simple chat commands.",
    },
    {
      q: "Will it help me book more consultations?",
      a: "Your website is built with conversion in mind—prominent booking CTAs, treatment pages that sell, and lead capture forms that notify you instantly.",
    },
  ];

  return (
    <section className="py-24 bg-muted/30 border-t border-border">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-medium text-foreground mb-4">Questions?</h2>
          <p className="text-muted-foreground text-lg">Quick answers about Nucleate for med spas.</p>
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
