"use client";
import PremiumHeader from "@/components/PremiumHeader";
import { PricingCard } from "@/components/PricingCard";
import { ProductKeys } from "@/GlobalConstants";
import {
  SparklesIcon
} from "@heroicons/react/24/outline";
import { useState } from "react";

export default function Home() {
  return (
    <main className="bg-white dark:bg-black overflow-hidden">
      <PremiumHeader />
      <HeroSection />
      <FloatingElements />
      <PricingSection />
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
  const [inputValue, setInputValue] = useState("");

  const componentPrompts = {
    "Action Button": "Create a modern, accessible action button with smooth hover animations, loading states, and multiple variants (primary, secondary, destructive). Include ripple effects, proper focus states, and support for icons. The button should be responsive and follow Material Design 3 principles with elegant shadows and color transitions.",
    "Paywall": "Design a compelling paywall component with pricing tiers, feature comparisons, and payment integration. Include animated progress indicators, testimonials section, money-back guarantee badge, and social proof elements. The design should reduce purchase friction with clear value propositions and urgency indicators.",
    "Onboarding Screen": "Build an engaging onboarding flow with progress indicators, interactive tutorials, and personalization questions. Include skip options, swipe gestures, beautiful illustrations, and micro-interactions. The screens should collect user preferences while showcasing key app features through guided tours.",
    "Login Form": "Create a secure, user-friendly login form with social authentication options, password visibility toggle, and form validation. Include biometric login support, remember me functionality, and smooth error handling. The design should prioritize security while maintaining excellent user experience.",
    "Profile Card": "Design a comprehensive profile card with avatar upload, social links, achievement badges, and activity feeds. Include edit mode with inline editing, privacy controls, and customizable themes. The card should be responsive and include subtle animations and hover effects.",
    "Chat Interface": "Build a modern chat interface with message bubbles, typing indicators, read receipts, and media sharing. Include emoji reactions, voice message support, message search, and conversation threading. The design should prioritize readability with proper spacing and intuitive navigation."
  };

  const handleInputKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim()) {
        // Check if user is authenticated - for now just redirect to waitlist
        // In the future, this would check auth status and either create prototype or show login
        window.open("https://docs.google.com/forms/d/e/1FAIpQLSfQ6d-hfVG5x250NpqnTJVPFmMcMqEfFZKUnmTTET7nzD2GEw/viewform?usp=header", "_blank");
      }
    }
  };

  const handlePillClick = (componentType: string) => {
    const prompt = componentPrompts[componentType as keyof typeof componentPrompts];
    setInputValue(prompt);
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-white dark:bg-black">
      <div className="container mx-auto px-6 text-center relative z-20">
        {/* Floating Badge */}
        <div className="inline-flex items-center px-6 py-3 mt-8 mb-12 bg-gradient-to-r from-white/10 to-white/5 border border-white/20 rounded-full backdrop-blur-xl shadow-2xl hover:scale-105 transition-transform duration-300">
          <div className="w-2 h-2 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full mr-3 animate-pulse"></div>
          <span className="text-sm text-black dark:text-white font-medium">
            Prototype at the speed of thought
          </span>
        </div>

        {/* Main Heading with Gradient */}
        <h1 className="text-7xl md:text-8xl lg:text-9xl font-black mb-8 leading-tight">
          <span className="bg-gradient-to-r from-black via-gray-800 to-black dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent">
            Materialize
          </span>
        </h1>

        {/* Animated Subtitle */}
        <p className="text-xl md:text-2xl text-black dark:text-white max-w-5xl mx-auto mb-16 leading-relaxed">
          Prototype your ideas, workshop new designs, and build high-quality
          React Native components at the
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent font-semibold">
            {" "}
            speed of thought
          </span>
          . Start with an infinite canvas to rapidly create React Native screens
          and components.
        </p>

        {/* Prototype Input Section */}
        <div className="max-w-4xl mx-auto mb-20">
          <div className="relative bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-3xl backdrop-blur-xl p-8 shadow-2xl mb-8">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="What do you want to prototype?"
              onKeyDown={handleInputKeyPress}
              rows={4}
              className="w-full px-0 py-0 text-lg bg-transparent border-none text-black dark:text-white placeholder-black/60 dark:placeholder-white/60 focus:outline-none resize-none"
            />
          </div>

          {/* Component Suggestion Pills */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
            <button
              onClick={() => handlePillClick("Action Button")}
              className="group px-6 py-3 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-full text-black dark:text-white hover:from-purple-600/30 hover:to-pink-600/30 hover:border-purple-400/50 transition-all duration-300 backdrop-blur-xl hover:scale-105"
            >
              <span className="text-sm font-medium">Action Button</span>
            </button>
            <button
              onClick={() => handlePillClick("Paywall")}
              className="group px-6 py-3 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-full text-black dark:text-white hover:from-blue-600/30 hover:to-cyan-600/30 hover:border-blue-400/50 transition-all duration-300 backdrop-blur-xl hover:scale-105"
            >
              <span className="text-sm font-medium">Paywall</span>
            </button>
            <button
              onClick={() => handlePillClick("Onboarding Screen")}
              className="group px-6 py-3 bg-gradient-to-r from-green-600/20 to-emerald-600/20 border border-green-500/30 rounded-full text-black dark:text-white hover:from-green-600/30 hover:to-emerald-600/30 hover:border-green-400/50 transition-all duration-300 backdrop-blur-xl hover:scale-105"
            >
              <span className="text-sm font-medium">Onboarding Screen</span>
            </button>
            <button
              onClick={() => handlePillClick("Login Form")}
              className="group px-6 py-3 bg-gradient-to-r from-orange-600/20 to-red-600/20 border border-orange-500/30 rounded-full text-black dark:text-white hover:from-orange-600/30 hover:to-red-600/30 hover:border-orange-400/50 transition-all duration-300 backdrop-blur-xl hover:scale-105"
            >
              <span className="text-sm font-medium">Login Form</span>
            </button>
            <button
              onClick={() => handlePillClick("Profile Card")}
              className="group px-6 py-3 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-full text-black dark:text-white hover:from-indigo-600/30 hover:to-purple-600/30 hover:border-indigo-400/50 transition-all duration-300 backdrop-blur-xl hover:scale-105"
            >
              <span className="text-sm font-medium">Profile Card</span>
            </button>
            <button
              onClick={() => handlePillClick("Chat Interface")}
              className="group px-6 py-3 bg-gradient-to-r from-pink-600/20 to-rose-600/20 border border-pink-500/30 rounded-full text-black dark:text-white hover:from-pink-600/30 hover:to-rose-600/30 hover:border-pink-400/50 transition-all duration-300 backdrop-blur-xl hover:scale-105"
            >
              <span className="text-sm font-medium">Chat Interface</span>
            </button>
          </div>

          {/* CTA Button */}
          {/* <div className="flex justify-center">
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
          </div> */}
        </div>

        {/* Enhanced Demo Video */}
        {/* <div className="relative max-w-7xl mx-auto group">
          <div className="relative bg-gradient-to-br from-gray-900 to-black rounded-3xl border border-white/20 overflow-hidden shadow-2xl hover:shadow-white/10 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>

            <div className="relative aspect-video bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
              <div className="w-24 h-24 bg-gradient-to-r from-white/20 to-white/10 rounded-full flex items-center justify-center border border-white/30 hover:bg-white/30 transition-all duration-300 cursor-pointer group backdrop-blur-xl">
                <PlayIcon className="w-10 h-10 text-white ml-1 group-hover:scale-110 transition-transform" />
              </div>
            </div>

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
        </div> */}
      </div>
    </section>
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
      className="relative py-32 bg-gradient-to-b from-white to-gray-100 dark:from-black dark:to-gray-900"
    >
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-2 mb-6 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-full">
            <SparklesIcon className="w-4 h-4 text-purple-600 dark:text-purple-300 mr-2" />
            <span className="text-sm text-purple-600 dark:text-purple-300 font-medium">
              Simple Pricing
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-6 text-black dark:text-white">
            Choose Your Plan
          </h2>
          <p className="text-xl text-black dark:text-white max-w-3xl mx-auto">
            Start free and scale as you grow. Pay only for what you use with
            transparent, developer-friendly pricing.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {pricingTiers.map((tier, index) => (
            <div key={index} className="dark:hidden">
              <PricingCard {...tier} theme="light" />
            </div>
          ))}
          {pricingTiers.map((tier, index) => (
            <div key={`dark-${index}`} className="hidden dark:block">
              <PricingCard {...tier} theme="dark" />
            </div>
          ))}
        </div>

        {/* Usage Examples */}
        <div className="mt-20 text-center">
          <h3 className="text-2xl font-bold text-black dark:text-white mb-8">Usage Examples</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <div className="text-2xl font-bold text-black dark:text-white mb-2">
                150 messages
              </div>
              <div className="text-gray-600 dark:text-gray-300 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-400">
                $20 + $7.50 = $27.50
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                100 included + 50 × $0.15
              </div>
            </div>
            <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <div className="text-2xl font-bold text-black dark:text-white mb-2">
                400 messages
              </div>
              <div className="text-gray-600 dark:text-gray-300 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-400">
                $20 + $40 = $60
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                100 included + 200×$0.15 + 100×$0.10
              </div>
            </div>
            <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <div className="text-2xl font-bold text-black dark:text-white mb-2">
                800 messages
              </div>
              <div className="text-gray-600 dark:text-gray-300 mb-2">Pro plan cost:</div>
              <div className="text-lg font-semibold text-green-400">
                $20 + $84 = $104
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Includes all tiers + 200×$0.07
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
