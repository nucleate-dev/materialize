"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  Code2,
  GitBranch,
  Github,
  Layers,
  Layout,
  Lock,
  MessageCircle,
  Music2,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Star,
  ThumbsDown,
  ThumbsUp,
  Tv,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Suspense, useState } from "react";

// --- HERO SECTION ---
function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center px-6 pt-32 pb-20 overflow-hidden">
      <div className="container mx-auto max-w-6xl w-full z-10 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs font-semibold text-indigo-300 backdrop-blur-md shadow-[0_0_15px_-3px_rgba(99,102,241,0.3)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <span>Nucleate Teams is in private beta</span>
            </div>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-white mb-6 leading-[1.1]">
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/70">
              Ship faster. <br /> Design better.
            </span>
            <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-purple-400 font-serif italic pr-4">
              Real code.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed mb-10">
            The executable workspace where PMs, designers, and engineers stay
            perfectly in sync. Native React Native output, synced directly to
            GitHub.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSdYLMDDIN6fD6h64EfH2hay5kZvRadegwFNj7cGpnB2iyWcLA/viewform?usp=dialog"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="lg"
                className="h-14 px-8 rounded-full bg-white text-black hover:bg-zinc-200 text-base font-semibold w-full sm:w-auto shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] transition-all hover:scale-105 active:scale-95"
              >
                Request Early Access
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </div>
        </motion.div>

        {/* Hero Visual: Multi-variant grid animating */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-20 relative -mx-4 md:mx-0"
        >
          <div className="relative rounded-t-3xl border border-white/10 bg-[#0F1012] p-4 shadow-2xl overflow-hidden aspect-[16/9] md:aspect-[21/9]">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Grid of screens */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 opacity-80 h-full">
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  className="relative rounded-xl overflow-hidden border border-white/5 bg-[#1A1B1E]"
                  animate={{
                    y: [0, -10, 0],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 4 + Math.random() * 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.2,
                  }}
                >
                  <div className="w-full h-full bg-zinc-900/50 p-3 space-y-2">
                    <div className="w-1/2 h-2 rounded-full bg-white/10" />
                    <div className="flex gap-2">
                      <div className="w-8 h-8 rounded-md bg-white/5" />
                      <div className="flex-1 space-y-1">
                        <div className="w-full h-1.5 rounded-full bg-white/5" />
                        <div className="w-2/3 h-1.5 rounded-full bg-white/5" />
                      </div>
                    </div>
                    <div className="mt-4 w-full h-24 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/5" />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F1012] via-transparent to-transparent pointer-events-none" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// --- PROBLEM SECTION ---
function ProblemSection() {
  const painPoints = [
    {
      title: "Lost Time",
      desc: "Months lost to design → handoff → rebuild cycles.",
      icon: <RefreshCw className="w-5 h-5 text-red-400" />,
    },
    {
      title: "Drift",
      desc: "Outdated designs and drift between Figma & Code.",
      icon: <GitBranch className="w-5 h-5 text-orange-400" />,
    },
    {
      title: "Limited Exploration",
      desc: "One variant delivered when teams really need 10.",
      icon: <Layers className="w-5 h-5 text-yellow-400" />,
    },
    {
      title: "Rebuilds",
      desc: "Engineers rebuilding UI that already exists.",
      icon: <Code2 className="w-5 h-5 text-pink-400" />,
    },
  ];

  return (
    <section className="py-24 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-medium text-white mb-4">
            Why Teams Struggle Today
          </h2>
          <p className="text-zinc-400 text-lg">
            The modern mobile stack is broken.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {painPoints.map((point, idx) => (
            <motion.div
              key={idx}
              whileHover={{ y: -5 }}
              className="p-6 rounded-2xl bg-[#141517] border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                {point.icon}
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                {point.title}
              </h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                {point.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --- CORE VALUE PROP SECTION ---
function ValuePropSection() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0C0E] via-[#0F1012] to-[#0B0C0E]" />
      <div className="container mx-auto px-6 max-w-6xl relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Pillar 1 */}
          <div className="bg-[#141517] rounded-3xl p-8 border border-white/5 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/20 blur-[60px] rounded-full group-hover:bg-indigo-500/30 transition-all duration-500" />
            <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20 text-indigo-400">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-medium text-white mb-3">
              Ship Faster
            </h3>
            <p className="text-zinc-400 leading-relaxed">
              Idea → prototype → real RN screens in minutes. Skip the
              wireframing phase entirely.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="bg-[#141517] rounded-3xl p-8 border border-white/5 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-emerald-500/20 blur-[60px] rounded-full group-hover:bg-emerald-500/30 transition-all duration-500" />
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 text-emerald-400">
              <RefreshCw className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-medium text-white mb-3">
              No More Rework
            </h3>
            <p className="text-zinc-400 leading-relaxed">
              Prototype, design tokens, and GitHub stay in sync. What you see is
              literally what you ship.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="bg-[#141517] rounded-3xl p-8 border border-white/5 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-purple-500/20 blur-[60px] rounded-full group-hover:bg-purple-500/30 transition-all duration-500" />
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20 text-purple-400">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-medium text-white mb-3">
              Production Quality
            </h3>
            <p className="text-zinc-400 leading-relaxed">
              Every variant uses your system: tokens, spacing, components. No
              &ldquo;throwaway&rdquo; code.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// --- VARIANTS MEGA-SECTION ---
function VariantsSection() {
  const [activeTab, setActiveTab] = useState("refreshes");

  const tabs = [
    {
      id: "refreshes",
      label: "Refreshes",
      icon: <Layout className="w-4 h-4" />,
    },
    { id: "states", label: "States", icon: <Layers className="w-4 h-4" /> },
    { id: "paywalls", label: "Paywalls", icon: <Lock className="w-4 h-4" /> },
    {
      id: "onboarding",
      label: "User Flows",
      icon: <Smartphone className="w-4 h-4" />,
    },
  ];

  return (
    <section className="py-24 bg-black border-y border-white/5 relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        <div className="text-center mb-16 max-w-4xl mx-auto">
          <Badge
            variant="outline"
            className="mb-4 border-white/10 bg-white/5 text-zinc-300"
          >
            Infinite Exploration
          </Badge>
          <h2 className="text-4xl md:text-6xl font-medium text-white mb-6">
            Instant Variants.
            <span className="text-zinc-500 block text-2xl md:text-3xl mt-4 font-normal">
              Explore more ideas in 10 minutes than your team could in 2 weeks.
            </span>
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-300 border ${
                activeTab === tab.id
                  ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  : "bg-zinc-900/50 text-zinc-400 border-white/5 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="relative min-h-[600px] bg-[#0F1012] rounded-3xl border border-white/10 p-4 md:p-8 overflow-hidden shadow-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="h-full w-full"
            >
              {/* DEMO CONTENT BASED ON TAB */}
              {activeTab === "refreshes" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 h-full items-start justify-center">
                  {/* Variant 1: Modern Minimal */}
                  <div className="aspect-[9/16] bg-white rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 relative group">
                    <div className="absolute top-4 left-6 right-6 flex justify-between items-center z-10">
                      <div className="w-8 h-8 bg-black/5 rounded-full backdrop-blur-sm" />
                      <div className="w-8 h-8 bg-black/5 rounded-full backdrop-blur-sm" />
                    </div>
                    <div className="h-2/3 bg-zinc-100 relative">
                      <div className="w-full h-full object-cover bg-zinc-200" />
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-zinc-900 mb-1">
                        Midnight City
                      </h3>
                      <p className="text-zinc-500 text-sm mb-6">
                        M83 • Hurry Up, We&apos;re Dreaming
                      </p>
                      <div className="flex justify-between items-center gap-4">
                        <div className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center">
                          <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-black border-b-[5px] border-b-transparent ml-0.5" />
                        </div>
                        <div className="h-1 flex-1 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full w-1/3 bg-black" />
                        </div>
                        <div className="text-xs font-mono text-zinc-400">
                          1:24
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Variant A: Minimal
                    </div>
                  </div>

                  {/* Variant 2: Dark Brutalist */}
                  <div className="aspect-[9/16] bg-[#121212] rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 relative group">
                    <div className="p-6 h-full flex flex-col">
                      <div className="flex justify-between items-center mb-8">
                        <div className="text-white font-mono text-xs">
                          NOW PLAYING
                        </div>
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      </div>
                      <div className="w-full aspect-square border-2 border-white/20 rounded-none mb-8 relative">
                        <div className="w-full h-full object-cover grayscale opacity-60 bg-zinc-600" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full border border-white flex items-center justify-center">
                            <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[12px] border-l-white border-b-[8px] border-b-transparent ml-1" />
                          </div>
                        </div>
                      </div>
                      <h3 className="text-3xl font-black text-white leading-none mb-2 mix-blend-difference">
                        MIDNIGHT
                        <br />
                        CITY
                      </h3>
                      <p className="text-zinc-500 font-mono text-xs uppercase">
                        M83 / Hurry Up, We&apos;re Dreaming
                      </p>
                      <div className="mt-auto pt-8 border-t border-white/10 flex justify-between items-end">
                        <div className="text-4xl font-mono text-white/20">
                          01
                        </div>
                        <div className="h-16 w-32 flex items-end gap-1">
                          {[40, 70, 30, 80, 50, 90, 20, 60].map((h, i) => (
                            <div
                              key={i}
                              className="flex-1 bg-white"
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-zinc-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Variant B: Brutalist
                    </div>
                  </div>

                  {/* Variant 3: Glassmorphism */}
                  <div className="aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative group">
                    <div className="absolute inset-0">
                      <div className="w-full h-full object-cover opacity-60 blur-xl scale-125 bg-indigo-500" />
                      <div className="absolute inset-0 bg-black/20" />
                    </div>
                    <div className="relative z-10 p-6 h-full flex flex-col justify-end">
                      <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl mb-8 border border-white/10">
                        <div className="w-full h-full object-cover bg-indigo-400" />
                      </div>
                      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          Midnight City
                        </h3>
                        <p className="text-white/60 text-xs mb-4">M83</p>
                        <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-4">
                          <div className="h-full w-2/3 bg-white shadow-[0_0_10px_white]" />
                        </div>
                        <div className="flex justify-between px-4">
                          <div className="w-6 h-6 text-white/60">
                            <div className="w-full h-full border-b-2 border-l-2 border-current rotate-45 translate-x-1" />
                          </div>
                          <div className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center shadow-lg">
                            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-black border-b-[4px] border-b-transparent ml-0.5" />
                          </div>
                          <div className="w-6 h-6 text-white/60">
                            <div className="w-full h-full border-b-2 border-r-2 border-current -rotate-45 -translate-x-1" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-4 left-0 right-0 text-center text-[10px] text-white/50 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Variant C: Glassmorphism
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "states" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center justify-center h-full p-8">
                  {/* Empty State */}
                  <div className="bg-zinc-50 rounded-3xl p-8 aspect-[9/16] max-h-[500px] flex flex-col items-center justify-center text-center shadow-lg relative group">
                    <div className="bg-white p-6 rounded-full shadow-sm mb-6 relative">
                      <div className="w-16 h-16 text-zinc-300">
                        <Box className="w-full h-full" strokeWidth={1} />
                      </div>
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        +
                      </div>
                    </div>
                    <h3 className="text-zinc-900 font-semibold text-lg mb-2">
                      No Projects Yet
                    </h3>
                    <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
                      Create your first project to start tracking your tasks.
                    </p>
                    <div className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium text-sm shadow-xl shadow-zinc-200">
                      New Project
                    </div>
                    <div className="absolute top-4 left-0 right-0 text-center text-[10px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Empty State
                    </div>
                  </div>

                  {/* Loading State */}
                  <div className="bg-[#0F1012] rounded-3xl border border-zinc-800 p-6 aspect-[9/16] max-h-[500px] flex flex-col relative overflow-hidden group">
                    <div className="flex items-center justify-between mb-8">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
                      <div className="w-24 h-4 bg-zinc-800 rounded animate-pulse" />
                    </div>
                    <div className="space-y-6">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex gap-4">
                          <div className="w-12 h-12 rounded-xl bg-zinc-800 animate-pulse shrink-0" />
                          <div className="flex-1 space-y-2 py-1">
                            <div className="w-3/4 h-3 bg-zinc-800 rounded animate-pulse" />
                            <div className="w-1/2 h-3 bg-zinc-800/50 rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0F1012] via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-4 left-0 right-0 text-center text-[10px] text-zinc-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Loading State
                    </div>
                  </div>

                  {/* Error State */}
                  <div className="bg-white rounded-3xl p-8 aspect-[9/16] max-h-[500px] flex flex-col items-center justify-center relative shadow-xl overflow-hidden group">
                    <div className="absolute top-0 inset-x-0 h-1 bg-red-500" />
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 text-red-500">
                      <div className="w-10 h-10 border-4 border-red-500 rounded-full border-t-transparent animate-spin absolute opacity-20" />
                      <X className="w-8 h-8" />
                    </div>
                    <h3 className="text-zinc-900 font-bold text-xl mb-2">
                      Connection Failed
                    </h3>
                    <p className="text-zinc-500 text-sm mb-8 text-center px-4">
                      We couldn&apos;t load your feed. Please check your
                      internet connection.
                    </p>
                    <button className="flex items-center gap-2 px-6 py-2.5 bg-red-50 text-red-600 rounded-full font-medium text-sm hover:bg-red-100 transition-colors">
                      <RefreshCw className="w-4 h-4" /> Try Again
                    </button>
                    <div className="absolute top-4 left-0 right-0 text-center text-[10px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Error State
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "paywalls" && (
                <div className="flex gap-8 justify-center h-full items-center p-8">
                  {/* Variant 1: Dark Mode / Value Prop (Gymverse Scale) */}
                  <div className="w-[300px] aspect-[9/19] bg-slate-900 rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    {/* Status Bar */}
                    <div className="px-6 py-4 flex justify-between items-center text-white text-[10px] font-bold">
                      <span>9:41</span>
                      <div className="flex gap-1">
                        <div className="w-3 h-3 bg-white rounded-full opacity-20" />
                        <div className="w-4 h-2.5 border border-white/50 rounded-[2px]" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col px-6 relative z-10">
                      <div className="absolute top-4 right-6 text-white/50">
                        <X className="w-6 h-6" />
                      </div>

                      <div className="mt-4 mb-2 flex justify-center">
                        <div className="px-2 py-1 rounded bg-white text-slate-900 text-[10px] font-bold uppercase tracking-wider">
                          PRO
                        </div>
                      </div>

                      <h3 className="text-2xl font-bold text-center text-white leading-tight mb-6">
                        Workouts Made
                        <br />
                        Simple Every Day
                      </h3>

                      {/* Social Proof */}
                      <div className="flex justify-center items-center gap-2 mb-8">
                        <div className="flex -space-x-2">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="w-6 h-6 rounded-full bg-slate-700 border border-slate-900"
                            />
                          ))}
                        </div>
                        <div className="text-[10px] text-slate-300">
                          <span className="font-bold text-white">150K+</span>{" "}
                          5-Star Reviews
                        </div>
                      </div>

                      {/* Benefits List */}
                      <div className="space-y-4 mb-8">
                        {[
                          "Always know what to do at the gym",
                          "Improve with every workout",
                          "Stay motivated and consistent",
                        ].map((item, i) => (
                          <div
                            key={i}
                            className="flex gap-3 text-sm text-slate-200"
                          >
                            <Zap className="w-5 h-5 text-white shrink-0 fill-white" />
                            <span className="text-xs font-medium">{item}</span>
                          </div>
                        ))}
                      </div>

                      {/* Pricing Cards */}
                      <div className="mt-auto space-y-3 mb-4">
                        <div className="relative p-4 rounded-xl border-2 border-white bg-slate-800/50 cursor-pointer">
                          <div className="absolute -top-3 right-4 bg-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded">
                            BEST VALUE
                          </div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white font-bold text-sm">
                              Yearly Plan
                            </span>
                            <span className="text-white font-bold text-sm">
                              $119.99
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded">
                              7-day free trial
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              only $10.00/mo
                            </span>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-white/10 bg-slate-800/20 cursor-pointer flex justify-between items-center">
                          <span className="text-white font-medium text-sm">
                            Monthly
                          </span>
                          <span className="text-white font-medium text-sm">
                            $19.99
                          </span>
                        </div>

                        <button className="w-full py-3.5 rounded-full bg-yellow-400 text-black font-bold text-sm shadow-lg hover:bg-yellow-300 transition-colors mt-2">
                          START MY FREE TRIAL
                        </button>
                        <p className="text-[9px] text-center text-slate-500 mt-2">
                          No Payment Now. Cancel Anytime.
                        </p>
                      </div>
                    </div>

                    {/* Background Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-900 opacity-90 pointer-events-none" />
                  </div>

                  {/* Variant 2: Light Mode / Green Timeline */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans z-10 scale-105">
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex justify-center items-center gap-2 mb-4 text-green-600">
                        <CheckCircle2 className="w-4 h-4 fill-green-600 text-white" />
                        <span className="text-xs font-bold">
                          One-time offer applied
                        </span>
                      </div>

                      <h3 className="text-xl font-black text-center text-slate-900 mb-8">
                        Start your 7-day
                        <br />
                        FREE trial
                      </h3>

                      {/* Timeline */}
                      <div className="relative pl-4 space-y-8 mb-8">
                        {/* Line */}
                        <div className="absolute left-[27px] top-4 bottom-8 w-1 bg-gradient-to-b from-indigo-500 via-indigo-300 to-green-400 rounded-full" />

                        <div className="relative flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white z-10 shrink-0 shadow-lg">
                            <Lock className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              Today
                            </div>
                            <div className="text-xs text-slate-500 leading-snug">
                              Get instant access and see how it changes your
                              life.
                            </div>
                          </div>
                        </div>

                        <div className="relative flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center text-white z-10 shrink-0 shadow-lg">
                            <Bell className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              Day 5
                            </div>
                            <div className="text-xs text-slate-500 leading-snug">
                              We&apos;ll remind you with a notification that
                              your trial is ending.
                            </div>
                          </div>
                        </div>

                        <div className="relative flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white z-10 shrink-0 shadow-lg">
                            <Star className="w-4 h-4 fill-white" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              Day 7
                            </div>
                            <div className="text-xs text-slate-500 leading-snug">
                              You will be charged on Oct 17. Cancel anytime
                              before.
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Satisfaction */}
                      <div className="bg-slate-50 p-3 rounded-lg flex gap-3 items-center mb-auto">
                        <ShieldCheck className="w-8 h-8 text-green-500 fill-green-100" />
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            100% Satisfaction Guaranteed
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Full refund anytime, no questions asked.
                          </div>
                        </div>
                      </div>

                      {/* Footer Price & CTA */}
                      <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                        <p className="text-[10px] text-slate-500 mb-1">
                          Unlimited free access for 7 days, then
                        </p>
                        <p className="text-xs text-slate-900 font-bold mb-4">
                          <span className="line-through text-slate-400 font-normal">
                            $69.99
                          </span>{" "}
                          $39.99 per year{" "}
                          <span className="text-green-600">(save 43%)</span>
                        </p>

                        <button className="w-full py-4 rounded-xl bg-green-500 text-white font-bold text-base shadow-xl shadow-green-200 hover:bg-green-600 transition-colors">
                          Start my free trial now
                        </button>
                        <p className="text-[10px] text-slate-400 mt-3">
                          Skip this one-time offer
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Variant 3: Clean / Red CTA */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    <div className="p-6 flex flex-col h-full">
                      <div className="text-center mt-6 mb-8">
                        <h3 className="text-xl font-bold text-slate-900">
                          How does trial work?
                        </h3>
                      </div>

                      {/* Timeline Clean */}
                      <div className="relative pl-2 mb-8 space-y-6">
                        <div className="absolute left-[19px] top-2 bottom-6 w-0.5 bg-green-100" />

                        <div className="flex gap-4 relative">
                          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white shrink-0 z-10 border-4 border-white shadow-sm">
                            <Lock className="w-4 h-4" />
                          </div>
                          <div className="pt-1">
                            <div className="text-sm font-bold text-slate-900">
                              Today
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Unlock premium access. You don&apos;t have to pay
                              anything.
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-4 relative">
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white shrink-0 z-10 mx-1">
                            <Bell className="w-4 h-4" />
                          </div>
                          <div className="pt-1">
                            <div className="text-sm font-bold text-slate-900">
                              Day 5
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Get a notification reminder.
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-4 relative">
                          <div className="w-8 h-8 bg-white border-2 border-green-500 rounded-full flex items-center justify-center text-green-500 shrink-0 z-10 mx-1">
                            <Star className="w-4 h-4" />
                          </div>
                          <div className="pt-1">
                            <div className="text-sm font-bold text-slate-900">
                              Day 7
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Subscription starts. Cancel easily before this
                              date.
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-center mb-6">
                        <p className="text-xs text-slate-500">
                          Subscription starts at{" "}
                          <span className="font-bold text-slate-900">
                            $14.99 per month
                          </span>
                        </p>
                      </div>

                      {/* Toggle */}
                      <div className="bg-slate-100 p-4 rounded-xl flex justify-between items-center mb-6">
                        <span className="text-xs font-medium text-slate-700">
                          Unlock trial and reminder
                        </span>
                        <div className="w-10 h-6 bg-slate-300 rounded-full relative">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                        </div>
                      </div>

                      <div className="mt-auto">
                        <button className="w-full py-4 rounded-full bg-red-500 text-white font-bold text-sm shadow-xl shadow-red-100 hover:bg-red-600 transition-colors mb-3">
                          SUBSCRIBE NOW
                        </button>
                        <div className="flex justify-center">
                          <button className="text-[10px] font-bold text-slate-900">
                            Restore purchases
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 text-center mt-4 leading-relaxed">
                          Subscriptions renew automatically. Cancel at least 24
                          hours before the end.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "onboarding" && (
                <div className="flex gap-8 justify-center h-full items-center p-8">
                  {/* Screen 1: Survey (Source) */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    <div className="px-6 pt-2 pb-4">
                      <div className="flex items-center gap-4 mb-6">
                        <ChevronLeft className="w-6 h-6 text-slate-900" />
                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="w-1/4 h-full bg-slate-900" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 leading-tight mb-6">
                        Where did you hear about us?
                      </h3>
                    </div>

                    <div className="flex-1 px-4 overflow-y-auto no-scrollbar space-y-3 pb-20">
                      <div className="p-4 bg-slate-950 rounded-2xl flex items-center gap-4 text-white shadow-lg">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 flex items-center justify-center">
                          <Camera className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-medium text-sm">Instagram</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                          <Music2 className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-medium text-sm">TikTok</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                          <Tv className="w-4 h-4 text-slate-600" />
                        </div>
                        <span className="font-medium text-sm">TV</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                          <Users className="w-4 h-4 text-slate-600" />
                        </div>
                        <span className="font-medium text-sm">
                          Friend or family
                        </span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                          <MessageCircle className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-medium text-sm">Facebook</span>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900">
                        <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                        <span className="font-medium text-sm">Youtube</span>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent">
                      <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl">
                        Continue
                      </button>
                    </div>
                  </div>

                  {/* Screen 2: Binary Choice (Experience) */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans scale-105 z-10">
                    <div className="px-6 pt-2 pb-4">
                      <div className="flex items-center gap-4 mb-6">
                        <ChevronLeft className="w-6 h-6 text-slate-900" />
                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="w-1/3 h-full bg-slate-900" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 leading-tight mb-2">
                        Have you tried other calorie tracking apps?
                      </h3>
                    </div>

                    <div className="flex-1 px-6 flex flex-col justify-center gap-4 -mt-20">
                      <div className="p-5 bg-black rounded-2xl flex items-center gap-4 text-white shadow-xl ring-2 ring-black ring-offset-2">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                          <ThumbsDown className="w-5 h-5 text-black" />
                        </div>
                        <span className="font-bold text-lg">No</span>
                      </div>
                      <div className="p-5 bg-slate-50 rounded-2xl flex items-center gap-4 text-slate-900 opacity-60">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                          <ThumbsUp className="w-5 h-5 text-slate-900" />
                        </div>
                        <span className="font-bold text-lg">Yes</span>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl">
                        Continue
                      </button>
                      <div className="w-32 h-1 bg-slate-200 mx-auto mt-4 rounded-full" />
                    </div>
                  </div>

                  {/* Screen 3: Chart (Potential) */}
                  <div className="w-[300px] aspect-[9/19] bg-white rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    <div className="px-6 pt-2 pb-4">
                      <div className="flex items-center gap-4 mb-6">
                        <ChevronLeft className="w-6 h-6 text-slate-900" />
                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="w-1/2 h-full bg-slate-900" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 leading-tight mb-2">
                        You have great potential to crush your goal
                      </h3>
                    </div>

                    <div className="px-6 mt-4">
                      <div className="bg-slate-50 rounded-3xl p-6 relative overflow-hidden">
                        <h4 className="font-semibold text-slate-900 mb-6">
                          Your weight transition
                        </h4>

                        <div className="h-40 relative w-full">
                          {/* Chart Lines */}
                          <div className="absolute inset-x-0 bottom-8 h-px bg-slate-200 border-t border-dashed border-slate-300" />
                          <div className="absolute inset-x-0 bottom-24 h-px bg-slate-200 border-t border-dashed border-slate-300" />

                          {/* SVG Curve */}
                          <svg
                            className="absolute inset-0 w-full h-full overflow-visible"
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient
                                id="chartGradient"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#D4A373"
                                  stopOpacity="0.2"
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#D4A373"
                                  stopOpacity="0"
                                />
                              </linearGradient>
                            </defs>
                            <path
                              d="M 10 120 Q 80 110 120 70 T 230 20"
                              fill="none"
                              stroke="#A98467"
                              strokeWidth="2.5"
                            />
                            <path
                              d="M 10 120 Q 80 110 120 70 T 230 20 V 150 H 10 Z"
                              fill="url(#chartGradient)"
                            />

                            {/* Point 1 */}
                            <circle
                              cx="10"
                              cy="120"
                              r="4"
                              fill="white"
                              stroke="#333"
                              strokeWidth="2"
                            />
                            {/* Point 2 */}
                            <circle
                              cx="120"
                              cy="70"
                              r="4"
                              fill="white"
                              stroke="#333"
                              strokeWidth="2"
                            />
                            {/* Point 3 (Trophy) */}
                            <circle cx="230" cy="20" r="14" fill="#D4A373" />
                          </svg>
                          {/* Trophy Icon Overlay */}
                          <div className="absolute right-[1px] top-[9px]">
                            <Star className="w-3 h-3 text-white fill-white" />
                          </div>

                          {/* X Axis */}
                          <div className="absolute bottom-0 left-0 text-[10px] font-medium text-slate-500">
                            3 Days
                          </div>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
                            7 Days
                          </div>
                          <div className="absolute bottom-0 right-0 text-[10px] font-medium text-slate-500">
                            30 Days
                          </div>
                        </div>

                        <div className="mt-6 text-xs text-slate-500 leading-relaxed">
                          Based on historical data, weight gain is usually
                          delayed at first, but after 7 days, you can reach your
                          goal quickly!
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl">
                        Continue
                      </button>
                      <div className="w-32 h-1 bg-slate-200 mx-auto mt-4 rounded-full" />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

// --- HOW IT WORKS SECTION ---
function HowItWorksSection() {
  return (
    <section className="py-24 bg-[#0B0C0E]">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-medium text-white mb-4">
            How It Works
          </h2>
          <p className="text-zinc-400">Streamlined for modern product teams.</p>
        </div>

        <div className="space-y-12 relative">
          {/* Connecting Line */}
          <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-indigo-500 via-purple-500 to-transparent md:left-1/2 md:-ml-px" />

          {/* Step 1 */}
          <div className="relative flex flex-col md:flex-row items-center gap-8 group">
            <div className="absolute left-0 w-14 h-14 rounded-full bg-[#141517] border-4 border-[#0B0C0E] z-10 flex items-center justify-center text-white font-bold md:left-1/2 md:-ml-7 shadow-xl">
              1
            </div>
            <div className="pl-20 md:pl-0 md:w-1/2 md:pr-12 md:text-right">
              <div className="bg-[#141517] p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                <h3 className="text-xl font-medium text-white mb-2 flex items-center gap-2 md:justify-end">
                  <Github className="w-5 h-5" /> Connect Repo
                </h3>
                <p className="text-zinc-400 text-sm">
                  Nucleate syncs your components, tokens, and theme
                  automatically. No manual configuration.
                </p>
              </div>
            </div>
            <div className="md:w-1/2" />
          </div>

          {/* Step 2 */}
          <div className="relative flex flex-col md:flex-row items-center gap-8 group">
            <div className="absolute left-0 w-14 h-14 rounded-full bg-[#141517] border-4 border-[#0B0C0E] z-10 flex items-center justify-center text-white font-bold md:left-1/2 md:-ml-7 shadow-xl">
              2
            </div>
            <div className="md:w-1/2" />
            <div className="pl-20 md:pl-0 md:w-1/2 md:pl-12">
              <div className="bg-[#141517] p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                <h3 className="text-xl font-medium text-white mb-2 flex items-center gap-2">
                  <Zap className="w-5 h-5" /> Generate & Explore
                </h3>
                <p className="text-zinc-400 text-sm">
                  Spin up variants instantly using your real system. No
                  drag-and-drop, just prompt and refine.
                </p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative flex flex-col md:flex-row items-center gap-8 group">
            <div className="absolute left-0 w-14 h-14 rounded-full bg-[#141517] border-4 border-[#0B0C0E] z-10 flex items-center justify-center text-white font-bold md:left-1/2 md:-ml-7 shadow-xl">
              3
            </div>
            <div className="pl-20 md:pl-0 md:w-1/2 md:pr-12 md:text-right">
              <div className="bg-[#141517] p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                <h3 className="text-xl font-medium text-white mb-2 flex items-center gap-2 md:justify-end">
                  <Box className="w-5 h-5" /> Ship Real Code
                </h3>
                <p className="text-zinc-400 text-sm">
                  Commit directly or export. The output is production-ready
                  React Native code.
                </p>
              </div>
            </div>
            <div className="md:w-1/2" />
          </div>
        </div>
      </div>
    </section>
  );
}

// --- DIFFERENTIATION SECTION ---
function DifferentiationSection() {
  return (
    <section className="py-24 bg-[#0B0C0E] border-t border-white/5">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-medium text-white mb-4">
            Why Nucleate?
          </h2>
          <p className="text-zinc-400">Not just another design tool.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-4 text-xs uppercase tracking-wider text-zinc-500 font-medium border-b border-white/10">
                  Feature
                </th>
                <th className="p-4 text-xs uppercase tracking-wider text-zinc-500 font-medium border-b border-white/10">
                  Figma
                </th>
                <th className="p-4 text-xs uppercase tracking-wider text-zinc-500 font-medium border-b border-white/10">
                  AI Builders
                </th>
                <th className="p-4 text-xs uppercase tracking-wider text-indigo-400 font-bold border-b border-indigo-500/50 bg-indigo-500/5 rounded-t-xl">
                  Nucleate
                </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-white/5">
                <td className="p-4 text-white font-medium">Output</td>
                <td className="p-4 text-zinc-500">Vector Shapes</td>
                <td className="p-4 text-zinc-500">Throwaway UI</td>
                <td className="p-4 text-white font-semibold bg-indigo-500/5">
                  Production RN Code
                </td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="p-4 text-white font-medium">Design System</td>
                <td className="p-4 text-zinc-500">Decoupled</td>
                <td className="p-4 text-zinc-500">Ignored</td>
                <td className="p-4 text-white font-semibold bg-indigo-500/5">
                  Strictly Enforced
                </td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="p-4 text-white font-medium">Variant Speed</td>
                <td className="p-4 text-zinc-500">Manual</td>
                <td className="p-4 text-zinc-500">Fast but sloppy</td>
                <td className="p-4 text-white font-semibold bg-indigo-500/5">
                  Instant & System-Aware
                </td>
              </tr>
              <tr>
                <td className="p-4 text-white font-medium">Source of Truth</td>
                <td className="p-4 text-zinc-500">Design File</td>
                <td className="p-4 text-zinc-500">None</td>
                <td className="p-4 text-white font-semibold bg-indigo-500/5 rounded-b-xl">
                  GitHub Repo
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// --- MAIN PAGE LAYOUT ---
function TeamsContent() {
  return (
    <main className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
      <GridBackground forceDarkMode />

      <div className="relative z-10">
        <PremiumHeader />
        <HeroSection />
        <ProblemSection />
        <ValuePropSection />
        <VariantsSection />
        <HowItWorksSection />
        <DifferentiationSection />

        <section className="py-32 bg-[#0B0C0E] border-t border-white/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/10 to-transparent pointer-events-none" />
          <div className="container mx-auto px-6 max-w-4xl text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
              Ready to build?
            </h2>
            <div className="flex justify-center mb-10">
              <p className="text-xl text-zinc-400 max-w-2xl">
                Join the product teams building the future of mobile with
                Nucleate.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="h-12 px-8 rounded-full bg-white text-black hover:bg-zinc-200 text-sm font-semibold"
              >
                Request Early Access
              </Button>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}

export default function TeamsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B0C0E] flex items-center justify-center">
          <div className="text-white/50 animate-pulse">
            Loading Nucleate Teams...
          </div>
        </div>
      }
    >
      <TeamsContent />
    </Suspense>
  );
}
