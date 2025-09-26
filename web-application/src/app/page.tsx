"use client";
import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  BoltIcon,
  CheckBadgeIcon,
  ShareIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/solid";
import { useState } from "react";

export default function Home() {
  return (
    <main className="relative bg-background overflow-hidden">
      {/* Premium Background */}
      <div className="absolute inset-0 bg-gradient-radial from-gray-100/20 via-background to-background dark:from-gray-600/8 dark:via-background dark:to-background"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMS41IiBmaWxsPSJncmF5IiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+Cg==')] opacity-30 dark:opacity-10"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-foreground/5 dark:to-foreground/10"></div>

      <div className="relative z-10">
        <PremiumHeader />
        <HeroSection />
        <FeaturesSection />
        <MinimalDepthElements />
      </div>
    </main>
  );
}

function MinimalDepthElements() {
  return (
    <div className="fixed inset-0 z-0 motion-reduce:hidden">
      {/* Subtle depth orbs - smaller, slower, outside focal areas */}
      <div className="absolute top-1/3 -left-1/4 w-64 h-64 bg-gradient-to-r from-blue-100/10 to-emerald-100/10 dark:from-blue-900/5 dark:to-emerald-900/5 rounded-full blur-3xl animate-[drift_20s_ease-in-out_infinite]"></div>
      <div className="absolute bottom-1/3 -right-1/4 w-48 h-48 bg-gradient-to-r from-emerald-100/10 to-blue-100/10 dark:from-emerald-900/5 dark:to-blue-900/5 rounded-full blur-3xl animate-[drift_25s_ease-in-out_infinite_reverse]"></div>
    </div>
  );
}

function HeroSection() {
  const [prompt, setPrompt] = useState("");

  const presetPrompts = {
    onboarding: "Create a React Native onboarding flow with 3 screens: welcome screen with app logo and tagline, features overview with illustrations, and sign-up form with email/password inputs",
    paywall: "Design a React Native paywall screen with pricing tiers (Basic $9.99/month, Premium $19.99/month), feature comparison, and subscription buttons with payment integration",
    recipeApp: "Build a React Native recipe app home screen with search bar, category filters (Breakfast, Lunch, Dinner, Desserts), featured recipes carousel, and recipe cards with images and ratings"
  };

  const handlePresetClick = (presetKey: keyof typeof presetPrompts) => {
    setPrompt(presetPrompts[presetKey]);
  };

  return (
    <section className="relative flex items-start justify-center pt-32 pb-16 bg-background">
      <div className="container mx-auto px-6 text-center relative z-20">
        {/* Floating Badge */}
        <div className="inline-flex items-center px-6 py-3 mt-8 mb-12 bg-gradient-to-r from-white/10 to-white/5 border border-white/20 rounded-full backdrop-blur-xl shadow-2xl hover:scale-105 transition-transform duration-300">
          <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-emerald-400 rounded-full mr-3 animate-pulse"></div>
          <span className="text-sm text-foreground font-medium">
            Prototype at the speed of thought
          </span>
        </div>

        {/* Main Heading with Gradient */}
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-black mb-6 leading-tight">
          <span className="bg-gradient-to-r from-foreground via-foreground/80 to-foreground bg-clip-text text-transparent">
            Materialize
          </span>
        </h1>

        {/* Animated Subtitle */}
        <p className="text-lg md:text-xl text-foreground max-w-4xl mx-auto mb-12 leading-relaxed">
          Prototype React Native screens at the speed of thought—on an infinite
          canvas that turns prompts into production-quality components.
        </p>

        {/* Prompt Input */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-white/10 dark:bg-gray-400/10 rounded-lg blur-xl"></div>
            <Textarea
              placeholder="Describe the React Native screen or flow you want to create..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="relative min-h-[120px] text-xl resize-none bg-white/5 border border-white/20 backdrop-blur-sm focus:ring-2 focus:ring-foreground/20 px-6 py-4"
            />
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <Button
            onClick={() => handlePresetClick("onboarding")}
            variant="outline"
            className="px-6 py-3 bg-white/5 border border-white/20 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
          >
            Onboarding Flow
          </Button>
          <Button
            onClick={() => handlePresetClick("paywall")}
            variant="outline"
            className="px-6 py-3 bg-white/5 border border-white/20 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
          >
            Paywall
          </Button>
          <Button
            onClick={() => handlePresetClick("recipeApp")}
            variant="outline"
            className="px-6 py-3 bg-white/5 border border-white/20 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
          >
            Recipe App
          </Button>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-6">
        <div className="max-w-7xl mx-auto">
          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Iterate Faster - Large card */}
            <div className="lg:col-span-2 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <BoltIcon className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground">
                    Generate React Native apps, screens, and components fast
                  </h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-4">
                  AI generates React Native components and screens from simple
                  prompts—ready to ship in minutes.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                  prompt → components
                </span>
              </div>
            </div>

            {/* Infinite Canvas */}
            <div className="lg:col-span-2 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-700/30 rounded-2xl p-8 hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Squares2X2Icon className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">
                  Create flows across multiple screens at once
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-4">
                Infinite canvas lets you design entire user journeys, from
                onboarding to checkout, in one seamless view.
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                <span className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded">
                  multi-screen flows
                </span>
              </div>
            </div>

            {/* Rapid Prototyping */}
            <div className="lg:col-span-2 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center">
                  <CheckBadgeIcon className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">
                  Export real React Native code
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Design, experiment, and prototype in minutes, then copy or
                export production-ready React Native code.
              </p>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                  prototype → test → ship
                </span>
              </div>
            </div>

            {/* Save, Fork, Edit & Share */}
            <div className="lg:col-span-2 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center">
                  <ShareIcon className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">
                  Versioned riffs you can remix and ship
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-4">
                Fork any design, make it yours, and maintain a living library of
                components your team can build on.
              </p>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                  save → fork → remix
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
