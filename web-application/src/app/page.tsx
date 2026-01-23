import type { Metadata } from "next";
import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { ENABLE_DESIGN_SYSTEM } from "@/GlobalConstants";
import { Github, Code2, Smartphone, Palette } from "lucide-react";
import { Suspense } from "react";

// Server components (no "use client" needed)
import ForDesignersSection from "@/components/homepage/ForDesignersSection";
import ForProductManagersSection from "@/components/homepage/ForProductManagersSection";
import ForFoundersSection from "@/components/homepage/ForFoundersSection";
import HowItWorksSection from "@/components/homepage/HowItWorksSection";
import DifferentiationSection from "@/components/homepage/DifferentiationSection";
import FAQSection from "@/components/homepage/FAQSection";

// Client components (have "use client" in their files)
import HeroSection from "@/components/homepage/HeroSection";
import SeeItInActionSection from "@/components/homepage/SeeItInActionSection";
import PricingSection from "@/components/homepage/PricingSection";
import UTMTracker from "@/components/homepage/UTMTracker";

/**
 * Homepage metadata for SEO
 */
export const metadata: Metadata = {
  title: "Nucleate - AI Design Engineer for Web & Mobile Apps",
  description:
    "Build production-ready web and mobile apps with AI. Design system aware, GitHub integrated, real-time preview. Start prototyping in seconds.",
  keywords: [
    "AI design engineer",
    "prototype builder",
    "React Native",
    "Next.js",
    "mobile app development",
    "web app builder",
    "design system",
    "GitHub integration",
    "UI prototyping",
    "code generation",
  ],
  openGraph: {
    title: "Nucleate - AI Design Engineer",
    description: "Build production-ready web and mobile apps with AI",
    type: "website",
    url: "https://nucleate.dev",
    siteName: "Nucleate",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nucleate - AI Design Engineer",
    description: "Build production-ready web and mobile apps with AI",
  },
  alternates: {
    canonical: "https://nucleate.dev",
  },
};

/**
 * Homepage - Server Component
 * Optimized for SEO with server-side rendering
 */
export default function Home() {
  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        <HeroSection />

        {/* Logo/Features strip */}
        <div className="border-y border-border bg-card/50 backdrop-blur-sm py-4">
          <div className="container mx-auto px-6 flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-40 grayscale">
            <div className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              <span className="text-sm font-medium">GitHub Integration</span>
            </div>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5" />
              <span className="text-sm font-medium">React & Next.js</span>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              <span className="text-sm font-medium">Expo & RN</span>
            </div>
            {ENABLE_DESIGN_SYSTEM && (
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                <span className="text-sm font-medium">Design System Aware</span>
              </div>
            )}
          </div>
        </div>

        <ForDesignersSection />

        <ForProductManagersSection />

        {/* <ForFoundersSection /> */}

        <SeeItInActionSection />

        <HowItWorksSection />

        <DifferentiationSection />

        <PricingSection />

        <FAQSection />

        <Footer />
      </div>

      <Suspense fallback={null}>
        <UTMTracker />
      </Suspense>
    </main>
  );
}
