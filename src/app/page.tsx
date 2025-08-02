"use client";
import PremiumHeader from "@/components/PremiumHeader";
import { PricingCard } from "@/components/PricingCard";
import { ProductKeys } from "@/GlobalConstants";
import {
  ArrowRightIcon,
  ArrowsPointingOutIcon,
  CodeBracketIcon,
  DevicePhoneMobileIcon,
  EyeIcon,
  PaintBrushIcon,
  PlayIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

export default function Home() {
  return (
    <main className="bg-black overflow-hidden">
      <PremiumHeader />
      <HeroSection />
      <RapidPrototypingSection />
      <FlowVisualizationSection />
      <FeaturesSection />
      <PricingSection />
      <FloatingElements />
    </main>
  );
}

function FloatingElements() {
  return (
    <div className="fixed inset-0 pointer-events-none z-10">
      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-pink-600/20 to-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-black">
      <div className="container mx-auto px-6 text-center relative z-20">
        {/* Floating Badge */}
        <div className="inline-flex items-center px-6 py-3 mt-8 mb-12 bg-gradient-to-r from-white/10 to-white/5 border border-white/20 rounded-full backdrop-blur-xl shadow-2xl hover:scale-105 transition-transform duration-300">
          <div className="w-2 h-2 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full mr-3 animate-pulse"></div>
          <span className="text-sm text-white font-medium">
            Speed of Thought Prototyping
          </span>
        </div>

        {/* Main Heading with Gradient */}
        <h1 className="text-7xl md:text-8xl lg:text-9xl font-black mb-8 leading-tight">
          <span className="bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent">
            Materialize
          </span>
        </h1>

        {/* Animated Subtitle */}
        <p className="text-xl md:text-2xl text-gray-300 max-w-5xl mx-auto mb-16 leading-relaxed">
          Prototype your ideas, workshop new designs, and build high-quality
          React Native components at the
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent font-semibold">
            {" "}
            speed of thought
          </span>
          . Start with an infinite canvas to rapidly create React Native screens
          and components.
        </p>

        {/* Enhanced CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-20">
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSfQ6d-hfVG5x250NpqnTJVPFmMcMqEfFZKUnmTTET7nzD2GEw/viewform?usp=header"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative px-10 py-4 bg-white text-black font-bold rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-white/20 hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              Join Waitlist
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </a>
          <button className="group px-8 py-4 bg-white/10 text-white font-semibold rounded-2xl border border-white/20 backdrop-blur-xl transition-all duration-300 hover:bg-white/20 hover:scale-105">
            <span className="flex items-center gap-2">
              <PlayIcon className="w-5 h-5" />
              Watch demo
            </span>
          </button>
        </div>

        {/* Enhanced Demo Video */}
        <div className="relative max-w-7xl mx-auto group">
          <div className="relative bg-gradient-to-br from-gray-900 to-black rounded-3xl border border-white/20 overflow-hidden shadow-2xl hover:shadow-white/10 transition-all duration-500">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>

            {/* Video Player */}
            <div className="relative aspect-video bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
              <div className="w-24 h-24 bg-gradient-to-r from-white/20 to-white/10 rounded-full flex items-center justify-center border border-white/30 hover:bg-white/30 transition-all duration-300 cursor-pointer group backdrop-blur-xl">
                <PlayIcon className="w-10 h-10 text-white ml-1 group-hover:scale-110 transition-transform" />
              </div>
            </div>

            {/* Enhanced Floating UI */}
            <div className="absolute top-6 left-6 bg-black/80 border border-white/20 rounded-xl px-4 py-3 backdrop-blur-xl">
              <span className="text-white text-sm font-semibold flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Infinite Canvas
              </span>
            </div>

            <div className="absolute top-6 right-6 bg-black/80 border border-white/20 rounded-xl px-4 py-3 backdrop-blur-xl">
              <span className="text-white text-sm font-semibold">
                React Native
              </span>
            </div>

            <div className="absolute bottom-6 left-6 bg-black/80 border border-white/20 rounded-xl px-4 py-3 backdrop-blur-xl">
              <span className="text-white text-sm font-semibold flex items-center gap-2">
                <CodeBracketIcon className="w-4 h-4" />
                Live Code Export
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PhoneMockup({ label }: { label: string }) {
  return (
    <div className="relative w-40 sm:w-48 md:w-56 aspect-[9/19] bg-black rounded-[2.5rem] border-4 border-gray-700 shadow-xl flex items-center justify-center overflow-hidden">
      {/* notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 bg-black rounded-b-xl"></div>
      <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-300 text-sm">
        {label}
      </div>
    </div>
  );
}

function RapidPrototypingSection() {
  return (
    <section className="relative py-32 bg-gradient-to-b from-gray-900 to-black text-center">
      <div className="container mx-auto px-6">
        <h2 className="text-5xl md:text-6xl font-bold mb-6 text-white">
          Rapid Prototyping
        </h2>
        <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-16">
          Quickly build paywalls and iterate in seconds.
        </p>
        <div className="flex justify-center gap-6">
          <PhoneMockup label="Paywall 1" />
          <PhoneMockup label="Paywall 2" />
          <PhoneMockup label="Paywall 3" />
        </div>
      </div>
    </section>
  );
}

function FlowVisualizationSection() {
  return (
    <section className="relative py-32 bg-gradient-to-b from-black to-gray-900 text-center">
      <div className="container mx-auto px-6">
        <h2 className="text-5xl md:text-6xl font-bold mb-6 text-white">
          Visualize &amp; Tweak Your Flows Quickly
        </h2>
        <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-16">
          See your 3 step paywall flow at a glance.
        </p>
        <div className="flex justify-center gap-6">
          <PhoneMockup label="Step 1" />
          <PhoneMockup label="Step 2" />
          <PhoneMockup label="Step 3" />
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: <ArrowsPointingOutIcon className="w-8 h-8" />,
      title: "Infinite Canvas & Flow Branching",
      description:
        "Compare 5–10 UX ideas side-by-side in one space—no file/version sprawl, faster convergence.",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      icon: <PaintBrushIcon className="w-8 h-8" />,
      title: "Taste-Trained AI Variants",
      description:
        "One click produces polished, best-practice screens (onboarding, checkout, empty states) so you skip blank-canvas lag.",
      gradient: "from-purple-500 to-pink-500",
    },
    {
      icon: <EyeIcon className="w-8 h-8" />,
      title: "Dive-In Component Editing",
      description:
        "Double-click to tweak props, layout, or copy with instant live re-render—stay in creative flow.",
      gradient: "from-green-500 to-emerald-500",
    },
    {
      icon: <DevicePhoneMobileIcon className="w-8 h-8" />,
      title: "React Native Preview",
      description:
        "Instantly preview your React Native components across platforms and iterate without leaving the canvas.",
      gradient: "from-orange-500 to-red-500",
    },
    {
      icon: <CodeBracketIcon className="w-8 h-8" />,
      title: "One-Click Code Export",
      description:
        "Output clean JSX / RN Web or open a sandbox—eliminates hand-off rebuild time and accelerates implementation.",
      gradient: "from-indigo-500 to-purple-500",
    },
  ];

  return (
    <section id="features" className="relative py-32 bg-black">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-2 mb-6 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full">
            <span className="text-sm text-blue-300 font-medium">
              Core Features
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-6 text-white">
            Built for Speed & Quality
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Every feature designed to eliminate friction and accelerate your
            creative process.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  gradient,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <div className="group relative">
      {/* Hover Glow Effect */}
      <div
        className={`absolute inset-0 bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-20 rounded-3xl blur-xl transition-opacity duration-500`}
      ></div>

      {/* Card */}
      <div className="relative bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-3xl p-8 hover:border-white/30 transition-all duration-500 backdrop-blur-xl group-hover:transform group-hover:scale-105">
        {/* Icon */}
        <div
          className={`inline-flex p-4 bg-gradient-to-r ${gradient} rounded-2xl mb-6 shadow-lg`}
        >
          <div className="text-white">{icon}</div>
        </div>

        {/* Content */}
        <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-gray-100 transition-colors">
          {title}
        </h3>
        <p className="text-gray-300 text-lg leading-relaxed group-hover:text-gray-200 transition-colors">
          {description}
        </p>

        {/* Subtle Arrow Indicator */}
        <div className="flex items-center mt-6 text-gray-400 group-hover:text-white transition-colors">
          <span className="text-sm font-medium mr-2">Learn more</span>
          <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </div>
  );
}

function PricingSection() {
  const pricingTiers = [
    {
      name: "Free",
      productID: ProductKeys.FREE_SUBSCRIPTION,
      price: "$0",
      period: "/month",
      description: "Perfect for getting started with prototyping",
      features: [
        "10 messages per month",
        "Basic React Native components",
        "Infinite canvas access",
        "Code export",
        "Community support",
      ],
      cta: "Get Started",
      ctaStyle:
        "bg-white/10 text-white border border-white/20 hover:bg-white/20",
      popular: false,
    },
    {
      name: "Pro",
      productID: ProductKeys.PRO_SUBSCRIPTION,
      price: "$20",
      period: "/month",
      description: "Ideal for professional developers and teams",
      features: [
        "100 messages included",
        "Pay-per-message scaling:",
        "• 101-300: $0.15/message",
        "• 301-600: $0.10/message",
        "• 600+: $0.07/message",
        "Advanced AI components",
        "Priority support",
        "Team collaboration",
        "Custom templates",
      ],
      cta: "Start Pro Trial",
      ctaStyle:
        "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700",
      popular: true,
    },
  ];

  return (
    <section
      id="pricing"
      className="relative py-32 bg-gradient-to-b from-black to-gray-900"
    >
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-2 mb-6 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-full">
            <SparklesIcon className="w-4 h-4 text-purple-300 mr-2" />
            <span className="text-sm text-purple-300 font-medium">
              Simple Pricing
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-6 text-white">
            Choose Your Plan
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Start free and scale as you grow. Pay only for what you use with
            transparent, developer-friendly pricing.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {pricingTiers.map((tier, index) => (
            <PricingCard key={index} {...tier} theme="dark" />
          ))}
        </div>

        {/* Usage Examples */}
        <div className="mt-20 text-center">
          <h3 className="text-2xl font-bold text-white mb-8">Usage Examples</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <div className="text-2xl font-bold text-white mb-2">
                150 messages
              </div>
              <div className="text-gray-300 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-400">
                $20 + $7.50 = $27.50
              </div>
              <div className="text-sm text-gray-400 mt-2">
                100 included + 50 × $0.15
              </div>
            </div>
            <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <div className="text-2xl font-bold text-white mb-2">
                400 messages
              </div>
              <div className="text-gray-300 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-400">
                $20 + $40 = $60
              </div>
              <div className="text-sm text-gray-400 mt-2">
                100 included + 200×$0.15 + 100×$0.10
              </div>
            </div>
            <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <div className="text-2xl font-bold text-white mb-2">
                800 messages
              </div>
              <div className="text-gray-300 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-400">
                $20 + $84 = $104
              </div>
              <div className="text-sm text-gray-400 mt-2">
                Includes all tiers + 200×$0.07
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

