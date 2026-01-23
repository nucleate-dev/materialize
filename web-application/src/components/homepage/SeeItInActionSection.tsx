"use client";

import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  Layers,
  Workflow,
  GitPullRequest,
  ChevronDown,
  MoreHorizontal,
  Box,
  X,
  RefreshCw,
  CheckCircle2,
  Bell,
  Star,
  Zap,
  Lock,
  Code2,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

/**
 * SEE IT IN ACTION SECTION - Client Component
 * Consolidated demo showing variants, states, flows, and shipping
 */
export default function SeeItInActionSection() {
  const [activeTab, setActiveTab] = useState("variants");

  const tabs = [
    {
      id: "variants",
      label: "Explore Variants",
      icon: <Sparkles className="w-4 h-4" />,
      caption: "Generate 10+ design options. Pick the best one.",
    },
    {
      id: "states",
      label: "Handle States",
      icon: <Layers className="w-4 h-4" />,
      caption: "Every edge case, automatically handled",
    },
    {
      id: "flows",
      label: "Build Flows",
      icon: <Workflow className="w-4 h-4" />,
      caption: "Multi-screen flows with real navigation",
    },
    {
      id: "ship",
      label: "Ship to GitHub",
      icon: <GitPullRequest className="w-4 h-4" />,
      caption: "One click from prototype to production PR",
    },
  ];

  return (
    <section className="py-24 bg-background border-y border-border relative overflow-hidden">
      {/* Static background accents */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-6 max-w-7xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <Badge
            variant="outline"
            className="mb-4 border-border bg-accent text-muted-foreground"
          >
            See It In Action
          </Badge>
          <h2 className="text-4xl md:text-6xl font-medium text-foreground mb-6">
            From idea to working prototype{" "}
            <span className="text-primary">in minutes</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Real components from your repo. Real interactions. Real code.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {tabs.map((tab, index) => (
            <motion.button
              key={tab.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-300 border ${
                activeTab === tab.id
                  ? "bg-foreground text-background border-foreground shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  : "bg-card/50 text-muted-foreground border-border hover:bg-card hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* Tab Caption */}
        <AnimatePresence mode="wait">
          <motion.p
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-center text-muted-foreground text-sm mb-8"
          >
            {tabs.find((t) => t.id === activeTab)?.caption}
          </motion.p>
        </AnimatePresence>

        {/* Content Area */}
        <div className="relative min-h-[600px] bg-card rounded-3xl border border-border p-4 md:p-8 overflow-hidden shadow-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full"
            >
              {/* DEMO CONTENT BASED ON TAB */}
              {activeTab === "variants" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 h-full items-start justify-center">
                  {/* Variant 1: Modern Minimal */}
                  <div className="flex flex-col gap-4">
                    <div className="text-center text-muted-foreground font-mono text-xs uppercase tracking-widest">
                      Variant A: Minimal
                    </div>
                    <div className="aspect-[9/16] bg-white rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 relative group">
                      <div className="absolute top-4 left-6 right-6 flex justify-between items-center z-10">
                        <div className="w-8 h-8 bg-black/5 rounded-full backdrop-blur-sm" />
                        <div className="w-8 h-8 bg-black/5 rounded-full backdrop-blur-sm" />
                      </div>
                      <div className="h-2/3 bg-zinc-100 relative">
                        <Image
                          src="/images/midnight_minimal.png"
                          alt="Minimal Album Art"
                          fill
                          className="object-cover"
                          sizes="(max-width: 1024px) 100vw, 33vw"
                        />
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
                    </div>
                  </div>

                  {/* Variant 2: Dark Brutalist */}
                  <div className="flex flex-col gap-4">
                    <div className="text-center text-muted-foreground font-mono text-xs uppercase tracking-widest">
                      Variant B: Brutalist
                    </div>
                    <div className="aspect-[9/16] bg-card rounded-3xl overflow-hidden shadow-2xl border border-border relative group">
                      <div className="p-6 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-8">
                          <div className="text-white font-mono text-xs">
                            NOW PLAYING
                          </div>
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                        <div className="w-full aspect-square border-2 border-white/20 rounded-none mb-8 relative">
                          <Image
                            src="/images/midnight_brutalist.png"
                            alt="Brutalist Album Art"
                            fill
                            className="object-cover grayscale opacity-60"
                            sizes="(max-width: 1024px) 100vw, 33vw"
                          />
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
                    </div>
                  </div>

                  {/* Variant 3: Glassmorphism */}
                  <div className="flex flex-col gap-4">
                    <div className="text-center text-muted-foreground font-mono text-xs uppercase tracking-widest">
                      Variant C: Glassmorphism
                    </div>
                    <div className="aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 relative group">
                      <div className="absolute inset-0">
                        <Image
                          src="/images/midnight_vibrant.png"
                          className="object-cover opacity-60 blur-xl scale-125"
                          alt="Background Blur"
                          fill
                          sizes="(max-width: 1024px) 100vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-black/20" />
                      </div>
                      <div className="relative z-10 p-6 h-full flex flex-col justify-between">
                        {/* Header */}
                        <div className="flex justify-between items-center w-full">
                          <ChevronDown className="w-6 h-6 text-white/70" />
                          <span className="text-xs font-medium text-white/50 tracking-widest uppercase">
                            Now Playing
                          </span>
                          <MoreHorizontal className="w-6 h-6 text-white/70" />
                        </div>

                        {/* Main Art */}
                        <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/10 mx-auto transform scale-105">
                          <Image
                            src="/images/midnight_vibrant.png"
                            alt="Glassmorphism Album Art"
                            fill
                            className="object-cover"
                            sizes="(max-width: 1024px) 100vw, 33vw"
                          />
                        </div>

                        {/* Controls */}
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
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
                            <div className="w-8 h-8 bg-white text-zinc-900 rounded-full flex items-center justify-center shadow-lg">
                              <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[6px] border-l-zinc-900 border-b-[4px] border-b-transparent ml-0.5" />
                            </div>
                            <div className="w-6 h-6 text-white/60">
                              <div className="w-full h-full border-b-2 border-r-2 border-current -rotate-45 -translate-x-1" />
                            </div>
                          </div>
                        </div>
                      </div>
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
                    <div className="absolute top-4 left-0 right-0 text-center text-xs text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Empty State
                    </div>
                  </div>

                  {/* Loading State */}
                  <div className="bg-card rounded-3xl border border-border p-6 aspect-[9/16] max-h-[500px] flex flex-col relative overflow-hidden group">
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
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-4 left-0 right-0 text-center text-xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">
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
                    <div className="absolute top-4 left-0 right-0 text-center text-xs text-zinc-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      Error State
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "flows" && (
                <div className="flex gap-8 justify-center h-full items-center p-8">
                  {/* Variant 1: Dark Mode / Value Prop (Gymverse Scale) */}
                  <div className="w-[300px] aspect-[9/19] bg-slate-900 rounded-[2.5rem] border-[8px] border-zinc-900 relative shadow-2xl overflow-hidden flex flex-col font-sans">
                    {/* Status Bar */}
                    <div className="px-6 py-4 flex justify-between items-center text-white text-xs font-bold">
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
                        <div className="px-2 py-1 rounded bg-white text-slate-900 text-xs font-bold uppercase tracking-wider">
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
                        <div className="text-xs text-slate-300">
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
                          <div className="absolute -top-3 right-4 bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded">
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
                            <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded">
                              7-day free trial
                            </span>
                            <span className="text-slate-400 text-xs">
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
                        <p className="text-xs text-center text-slate-500 mt-2">
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
                          <div className="text-xs text-slate-500">
                            Full refund anytime, no questions asked.
                          </div>
                        </div>
                      </div>

                      {/* Footer Price & CTA */}
                      <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                        <p className="text-xs text-slate-500 mb-1">
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
                        <p className="text-xs text-slate-400 mt-3">
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
                          <button className="text-xs font-bold text-slate-900">
                            Restore purchases
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
                          Subscriptions renew automatically. Cancel at least 24
                          hours before the end.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "ship" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8 h-full items-center">
                  {/* Export Code */}
                  <div className="bg-gradient-to-br from-card to-primary/5 rounded-2xl border border-border p-8 hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                        <Code2 className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-2xl font-bold">Export Code</h3>
                    </div>
                    <p className="text-muted-foreground mb-6">
                      Copy/paste specific components or export entire screens as
                      clean, modular React files.
                    </p>
                    <div className="bg-background rounded-lg p-4 border border-border font-mono text-sm">
                      <div className="text-pink-400">export default</div>
                      <div className="text-blue-400">function Button()</div>
                      <div className="text-muted-foreground pl-2">
                        {"// Clean code..."}
                      </div>
                    </div>
                  </div>

                  {/* Open PR */}
                  <div className="bg-gradient-to-br from-card to-emerald-500/5 rounded-2xl border border-emerald-500/20 p-8 hover:border-emerald-500/40 transition-all">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                        <GitPullRequest className="w-6 h-6 text-emerald-400" />
                      </div>
                      <h3 className="text-2xl font-bold">Open a PR</h3>
                    </div>
                    <p className="text-muted-foreground mb-6">
                      Nucleate creates a PR against your repo following your
                      naming conventions and file structure.
                    </p>
                    <div className="bg-background rounded-lg p-4 border border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-sm text-emerald-400 font-medium">
                          Open
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-3">
                        feat: Add onboarding flow
                      </div>
                      <div className="px-3 py-1.5 bg-emerald-500/20 rounded text-xs text-emerald-400 w-fit">
                        Ready to merge
                      </div>
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
