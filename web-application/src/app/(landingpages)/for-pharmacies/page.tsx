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
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Heart,
  MapPin,
  MessageSquare,
  PenLine,
  Pill,
  Search,
  Shield,
  Sparkles,
  Syringe,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PharmacyLandingPage() {
  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-blue-500/30 overflow-hidden font-sans">
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
      properties: { vertical: "pharmacy", source: "hero" },
    });

    try {
      if (!user?.id) {
        setChatIntent(undefined, "I need a professional website for my community pharmacy", false);
        router.push("/login");
        return;
      }

      const result = await createPrototype({ framework: "web_nextjs_react", creation_source: "vertical_landing_pharmacy" });

      if (result.data) {
        setChatIntent(result.data.prototype_id, "I need a professional website for my community pharmacy with pages for services, about us, location and hours, and a contact form for inquiries", false);
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
        <Badge variant="outline" className="mb-6 border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300">
          AI Website Builder for Pharmacies
        </Badge>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground via-foreground to-foreground/60 pb-2 mb-6">
          A professional website <br className="hidden md:block" />
          for your pharmacy
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Build a website that showcases your services and brings customers through your door.
          Update it anytime by chatting with AI. No tech skills needed.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Button
            onClick={handleGetStarted}
            disabled={isLoading}
            size="lg"
            className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
          >
            {isLoading ? "Creating..." : "Build my pharmacy website"}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <span className="text-sm text-muted-foreground">Free to start</span>
        </div>

        {/* Website Preview */}
        <div className="max-w-4xl mx-auto relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-3xl blur-xl opacity-50"></div>
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
                  mainstreetpharmacy.com
                </div>
              </div>
            </div>

            {/* Website Content Preview */}
            <div className="p-8 bg-gradient-to-b from-muted/30 to-card">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Pill className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-semibold text-foreground">Main Street Pharmacy</span>
                </div>
                <div className="hidden md:flex gap-6 text-sm text-muted-foreground">
                  <span>Services</span>
                  <span>About</span>
                  <span>Location</span>
                  <span>Contact</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="text-left">
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                    Your Neighborhood Pharmacy
                  </h2>
                  <p className="text-muted-foreground mb-6 text-sm">
                    Personal care from pharmacists who know your name. Serving our community since 1985.
                  </p>
                  <div className="flex gap-3">
                    <div className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium">
                      Transfer Prescription
                    </div>
                    <div className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm">
                      Our Services
                    </div>
                  </div>
                </div>
                <div className="hidden md:grid grid-cols-2 gap-3">
                  {["Prescriptions", "Immunizations", "Compounding", "Free Delivery"].map((service) => (
                    <div key={service} className="bg-background/50 border border-border rounded-lg p-3 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-blue-500 mb-2" />
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
      icon: <X className="w-6 h-6" />,
      title: "Competing with the big chains",
      description: "CVS and Walgreens have massive online presence. Your outdated site makes it hard to compete.",
      solution: "Get a professional website that highlights what chains can't offer—personal service and community trust.",
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Customers don't know what you offer",
      description: "You do immunizations, compounding, delivery—but your website doesn't show it.",
      solution: "Showcase all your services front and center. Customers see exactly what makes you special.",
    },
    {
      icon: <DollarSign className="w-6 h-6" />,
      title: "No budget for a web agency",
      description: "Margins are tight. You can't justify $5,000+ for a website when reimbursements keep shrinking.",
      solution: "Free to start, no agency needed. Build a complete website in minutes, not weeks.",
    },
    {
      icon: <PenLine className="w-6 h-6" />,
      title: "Updates take forever",
      description: "Flu season? New hours? Adding a service? Every change means calling someone or figuring it out yourself.",
      solution: "Just chat to update. Add flu shot info, change hours, promote new services—instantly.",
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
            Independent pharmacies face unique challenges getting noticed online.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {painPoints.map((point, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-blue-500/30 transition-all group"
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
      title: "Professional Pages",
      items: ["Home", "Services", "About Us", "Location & Hours", "Contact"],
    },
    {
      icon: <Heart className="w-5 h-5" />,
      title: "Your Services",
      items: ["Prescriptions", "Immunizations", "Compounding", "Delivery"],
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: "Customer Forms",
      items: ["Prescription transfers", "Refill requests", "General inquiries"],
    },
    {
      icon: <MessageSquare className="w-5 h-5" />,
      title: "AI Chat Editing",
      items: ["Update hours instantly", "Add seasonal services", "Change anything"],
    },
  ];

  return (
    <section className="py-24 px-6 border-t border-border bg-muted/30">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300">
            What You Get
          </Badge>
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
            Everything your pharmacy needs online
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            A complete, professional website that showcases what makes your pharmacy special.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {components.map((component, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-blue-500/30 transition-all"
            >
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
                {component.icon}
              </div>
              <h3 className="text-lg font-medium text-foreground mb-4">{component.title}</h3>
              <ul className="space-y-2">
                {component.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
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
    { user: "Add flu shots to our services—we're doing walk-ins this season", ai: "Done! I've added Flu Shot Clinic to your services page with walk-in availability highlighted. It's now featured on your homepage too." },
    { user: "Update our hours for the holidays", ai: "Updated! Your holiday hours are now showing on the location page with a banner on the homepage." },
    { user: "Show that we offer free delivery within 5 miles", ai: "Added! Free delivery is now prominently displayed on your homepage and services page with the 5-mile radius noted." },
  ];

  return (
    <section className="py-24 px-6 border-t border-border bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="outline" className="mb-4 border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300">
              The Difference
            </Badge>
            <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
              Update your website by chatting
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              No more waiting for someone else. No more learning complicated software.
              Just tell Nucleate what you want to change, and it happens instantly.
            </p>

            <div className="space-y-4">
              {[
                "Add seasonal services in seconds",
                "Update hours for holidays",
                "Promote new offerings like immunizations",
                "Keep customers informed instantly",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Demo */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border">
              <Sparkles className="w-5 h-5 text-blue-500" />
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
                    <div className="bg-blue-500/20 border border-blue-500/30 rounded-2xl rounded-br-md px-4 py-2 max-w-[80%]">
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
      description: "Show up when customers search for 'pharmacy near me' or 'flu shots in [your city]'.",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Trusted & Professional",
      description: "A design that builds confidence—because trust matters in healthcare.",
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Ready in Minutes",
      description: "Not weeks. Describe your pharmacy and get a complete website same day.",
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
              <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 text-blue-600 dark:text-blue-400 mx-auto">
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
      properties: { vertical: "pharmacy", source: "bottom_cta" },
    });

    try {
      if (!user?.id) {
        setChatIntent(undefined, "I need a professional website for my community pharmacy", false);
        router.push("/login");
        return;
      }

      const result = await createPrototype({ framework: "web_nextjs_react", creation_source: "vertical_landing_pharmacy" });

      if (result.data) {
        setChatIntent(result.data.prototype_id, "I need a professional website for my community pharmacy with pages for services, about us, location and hours, and a contact form for inquiries", false);
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
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-4xl text-center relative z-10">
        <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-6 text-foreground">
          Ready to stand out in your community?
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
          Join independent pharmacies who&apos;ve upgraded their online presence with Nucleate.
        </p>

        <Button
          onClick={handleGetStarted}
          disabled={isLoading}
          size="lg"
          className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-6 text-lg rounded-full font-medium transition-all hover:scale-105"
        >
          {isLoading ? "Creating..." : "Build my pharmacy website"}
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
      a: "Most pharmacy websites are ready in under 10 minutes. Just describe your pharmacy and services, and Nucleate generates a complete, professional website.",
    },
    {
      q: "Can I update it myself when things change?",
      a: "Yes! That's the best part. Just chat with Nucleate—update hours, add flu shot season info, promote new services. No technical skills needed.",
    },
    {
      q: "Will it help customers find my pharmacy?",
      a: "Your website is built with local SEO best practices so you show up when people search for pharmacies in your area. Plus, clear service listings help customers know what you offer.",
    },
  ];

  return (
    <section className="py-24 bg-muted/30 border-t border-border">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-medium text-foreground mb-4">Questions?</h2>
          <p className="text-muted-foreground text-lg">Quick answers about Nucleate for pharmacies.</p>
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
