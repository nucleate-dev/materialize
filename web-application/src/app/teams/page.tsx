"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { Button } from "@/components/ui/button";
import {
    CheckCircleIcon,
    CpuChipIcon,
    CubeTransparentIcon, SparklesIcon
} from "@heroicons/react/24/solid";
import { Suspense } from "react";

// --- Visual Component: Sync/Handoff Engine ---
const SyncVisual = () => (
    <div className="relative w-full h-full flex items-center justify-center">
        {/* Central Core */}
        <div className="relative z-10 w-24 h-24 bg-indigo-500/10 rounded-full border border-indigo-500/30 flex items-center justify-center backdrop-blur-sm animate-pulse">
            <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center">
                <CubeTransparentIcon className="w-8 h-8 text-indigo-400" />
            </div>
        </div>

        {/* Orbiting Elements */}
        <div className="absolute inset-0 animate-[spin_10s_linear_infinite]">
            <div className="absolute top-10 left-1/2 -translate-x-1/2 -translate-y-[80px]">
                <div className="px-3 py-1 rounded-full bg-[#1E1F23] border border-white/10 text-[10px] text-white/70 shadow-xl whitespace-nowrap flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    PM: Specs
                </div>
            </div>
            <div className="absolute top-1/2 left-1/2 translate-x-[60px] translate-y-[40px]">
                <div className="px-3 py-1 rounded-full bg-[#1E1F23] border border-white/10 text-[10px] text-white/70 shadow-xl whitespace-nowrap flex items-center gap-2 transform -rotate-[120deg]">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Eng: Code
                </div>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-[140px] translate-y-[40px]">
                <div className="px-3 py-1 rounded-full bg-[#1E1F23] border border-white/10 text-[10px] text-white/70 shadow-xl whitespace-nowrap flex items-center gap-2 transform rotate-[120deg]">
                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    Des: Tokens
                </div>
            </div>
        </div>

        {/* Connection Lines (Static background rings) */}
        <div className="absolute w-48 h-48 rounded-full border border-white/5 border-dashed" />
        <div className="absolute w-72 h-72 rounded-full border border-white/5 border-dashed opacity-50" />
    </div>
);

// --- Visual Component: Variant Multiverse ---
const VariantVisual = () => (
    <div className="relative w-full h-full flex items-center justify-center p-8 overflow-hidden">
        <div className="flex gap-4 transform perspective-[1000px] rotate-x-12 scale-90">
            {/* Card 1 */}
            <div className="w-32 h-56 bg-[#1A1B1E] rounded-xl border border-white/10 p-3 flex flex-col gap-2 opacity-50 scale-90 translate-x-4 transition-all duration-500 hover:opacity-100 hover:scale-105 hover:z-20 hover:border-indigo-500/50 shadow-2xl">
                <div className="w-full h-2 rounded-full bg-white/10" />
                <div className="flex gap-2">
                    <div className="w-8 h-8 rounded bg-rose-500/20" />
                    <div className="flex-1 space-y-1">
                        <div className="w-full h-1.5 rounded-full bg-white/5" />
                        <div className="w-2/3 h-1.5 rounded-full bg-white/5" />
                    </div>
                </div>
                <div className="mt-auto w-full h-6 rounded bg-rose-500/20 text-[8px] flex items-center justify-center text-rose-300">
                    Variant A
                </div>
            </div>

            {/* Card 2 (Center/Active) */}
            <div className="w-32 h-56 bg-[#1A1B1E] rounded-xl border border-indigo-500/30 p-3 flex flex-col gap-2 z-10 shadow-[0_0_30px_-10px_rgba(99,102,241,0.3)] hover:scale-105 transition-transform">
                <div className="w-full h-2 rounded-full bg-white/10" />
                <div className="flex gap-2">
                    <div className="w-8 h-8 rounded bg-indigo-500/20" />
                    <div className="flex-1 space-y-1">
                        <div className="w-full h-1.5 rounded-full bg-white/10" />
                        <div className="w-2/3 h-1.5 rounded-full bg-white/10" />
                    </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1">
                    <div className="h-12 rounded bg-white/5" />
                    <div className="h-12 rounded bg-white/5" />
                </div>
                <div className="mt-auto w-full h-6 rounded bg-indigo-500 text-[8px] flex items-center justify-center text-white font-medium">
                    Variant B (Winner)
                </div>
            </div>

            {/* Card 3 */}
            <div className="w-32 h-56 bg-[#1A1B1E] rounded-xl border border-white/10 p-3 flex flex-col gap-2 opacity-50 scale-90 -translate-x-4 transition-all duration-500 hover:opacity-100 hover:scale-105 hover:z-20 hover:border-indigo-500/50 shadow-2xl">
                <div className="w-full h-2 rounded-full bg-white/10" />
                <div className="flex gap-2">
                    <div className="w-8 h-8 rounded bg-emerald-500/20" />
                    <div className="flex-1 space-y-1">
                        <div className="w-full h-1.5 rounded-full bg-white/5" />
                        <div className="w-2/3 h-1.5 rounded-full bg-white/5" />
                    </div>
                </div>
                <div className="mt-auto w-full h-6 rounded bg-emerald-500/20 text-[8px] flex items-center justify-center text-emerald-300">
                    Variant C
                </div>
            </div>
        </div>
    </div>
);

// --- Visual Component: AI Scanner ---
const AIScannerVisual = () => (
    <div className="relative w-full h-full flex items-center justify-center">
        <div className="relative w-56 h-auto bg-[#141517] border border-white/10 rounded-xl p-4 overflow-hidden">
            {/* Mock Interface */}
            <div className="space-y-3">
                <div className="w-1/2 h-4 rounded bg-white/10" />
                <div className="flex gap-2">
                    <div className="w-full h-24 rounded bg-white/5 border border-white/5 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white/5" />
                    </div>
                </div>
                <div className="w-full h-8 rounded bg-indigo-500/20 border border-indigo-500/20" />
            </div>

            {/* Scanner Bar */}
            <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_rgba(52,211,153,0.5)] animate-[scan_3s_ease-in-out_infinite] top-0" />

            {/* Popups */}
            <div className="absolute top-8 right-2 animate-[fadeInOut_3s_infinite_1s] opacity-0">
                <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded text-[9px] text-emerald-400 flex items-center gap-1">
                    <CheckCircleIcon className="w-3 h-3" />
                    Contrast OK
                </div>
            </div>

            <div className="absolute bottom-12 left-2 animate-[fadeInOut_3s_infinite_2s] opacity-0">
                <div className="px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded text-[9px] text-yellow-400 flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3" />
                    Touch Target Fixed
                </div>
            </div>
        </div>
    </div>
);

function TeamsHero() {
    return (
        <section className="relative min-h-[90vh] flex flex-col justify-center px-6 py-20">
            <div className="container mx-auto max-w-5xl w-full text-center">
                {/* Badge */}
                <div className="flex justify-center mb-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs font-medium text-indigo-300 backdrop-blur-md">
                        <span>Nucleate for Teams</span>
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60 pb-4 mb-6">
                    Create faster.
                    <br />
                    Ship better.
                </h1>

                <p className="text-lg md:text-xl text-[#8A8F98] max-w-3xl mx-auto font-normal leading-relaxed mb-10">
                    The standard for mobile product teams. The workspace where PMs, designers, and engineers stay perfectly in sync.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button
                        size="lg"
                        className="h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 text-sm font-semibold w-full sm:w-auto"
                    >
                        Request Early Access
                    </Button>
                    <Button
                        size="lg"
                        variant="outline"
                        className="h-12 px-8 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white text-sm font-medium w-full sm:w-auto"
                    >
                        Talk to Us
                    </Button>
                </div>

                {/* Hero Visual Abstract */}
                <div className="mt-20 relative max-w-4xl mx-auto h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent">
                    <div className="absolute top-0 left-1/4 w-px h-12 bg-gradient-to-b from-white/20 to-transparent"></div>
                    <div className="absolute top-0 right-1/4 w-px h-12 bg-gradient-to-b from-white/20 to-transparent"></div>
                </div>
            </div>
        </section>
    );
}

function TeamsFeaturesGrid() {
    return (
        <section className="py-24 bg-[#0B0C0E] relative border-t border-white/5">
            <div className="container mx-auto px-6 max-w-6xl">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Card 1: Handoff Drift */}
                    <div className="group relative h-[480px] lg:col-span-2 rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/10 via-transparent to-transparent z-0" />

                        <div className="absolute inset-0 z-10 p-10 flex items-center justify-center">
                            <SyncVisual />
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 p-8 z-20 bg-gradient-to-t from-[#141517] via-[#141517]/80 to-transparent">
                            <h3 className="text-2xl font-medium text-white mb-2">
                                Stop Handoff Drift. Ship With Clarity.
                            </h3>
                            <p className="text-[#8A8F98] leading-relaxed max-w-lg">
                                Design files get outdated the moment development starts. Nucleate
                                keeps everything aligned automatically—one shared prototype repo
                                that syncs with your GitHub repo.
                            </p>
                        </div>
                    </div>

                    {/* Card 2: AI Ops */}
                    <div className="group relative h-[480px] rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50 z-10" />

                        <div className="absolute inset-0 p-6 pt-12 overflow-hidden">
                            <AIScannerVisual />
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
                            <h3 className="text-xl font-medium text-white mb-2">
                                AI Product Ops
                            </h3>
                            <p className="text-[#8A8F98] text-sm leading-relaxed">
                                It flags technical debt and UX blockers before they reach the repo.
                            </p>
                        </div>
                    </div>

                    {/* Card 3: Variants */}
                    <div className="group relative h-[480px] rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50 z-10" />

                        <div className="absolute inset-0 p-6 pt-12 overflow-hidden">
                            <VariantVisual />
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
                            <h3 className="text-xl font-medium text-white mb-2">
                                Explore Variants
                            </h3>
                            <p className="text-[#8A8F98] text-sm leading-relaxed">
                                Spin up unlimited screen & flow variants. View them side-by-side
                                in a unified canvas.
                            </p>
                        </div>
                    </div>

                    {/* Card 4: Feature List */}
                    <div className="group relative h-[480px] lg:col-span-2 rounded-2xl bg-[#141517] border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300">
                        <div className="absolute inset-0 p-10 flex flex-col justify-center z-20">
                            <h3 className="text-2xl font-medium text-white mb-8">
                                Designed for Mobile Product Teams
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                                        <CpuChipIcon className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h4 className="text-white font-medium mb-1">Production Ready</h4>
                                        <p className="text-sm text-[#8A8F98]">Native React Native code output with no lock-in. Export anytime.</p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                                        <CubeTransparentIcon className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h4 className="text-white font-medium mb-1">System Sync</h4>
                                        <p className="text-sm text-[#8A8F98]">Works with your GitHub repo and existing design system tokens.</p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                                        <CheckCircleIcon className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h4 className="text-white font-medium mb-1">Audit Trails</h4>
                                        <p className="text-sm text-[#8A8F98]">Versioned changes, history tracking, and strict approval flows.</p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                                        <div className="w-5 h-5 text-white font-bold text-xs flex items-center justify-center">SSO</div>
                                    </div>
                                    <div>
                                        <h4 className="text-white font-medium mb-1">Enterprise Ready</h4>
                                        <p className="text-sm text-[#8A8F98]">Private, secure, SSO enabled, with custom SLAs available.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function TeamsCTA() {
    return (
        <section className="py-32 bg-[#0B0C0E] border-t border-white/5">
            <div className="container mx-auto px-6 max-w-4xl text-center">
                <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
                    Finally, one place for PMs, designers, <br /> and engineers to build together.
                </h2>
                <div className="flex justify-center mb-10">
                    <p className="text-xl text-[#8A8F98] max-w-2xl">
                        Nucleate for Teams. Prototype faster. Ship better.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
                        <Button size="lg" className="relative h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 text-sm font-semibold">
                            Request Early Access
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}

function TeamsContent() {
    return (
        <main className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
            {/* Custom Keyframes Styles */}
            <style jsx global>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes fadeInOut {
          0%, 100% { opacity: 0; transform: translateY(5px); }
          20%, 80% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

            <GridBackground forceDarkMode />

            <div className="relative z-10">
                <PremiumHeader forceDarkMode />
                <TeamsHero />
                <TeamsFeaturesGrid />
                <TeamsCTA />
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
                    <div className="text-white/50">Loading...</div>
                </div>
            }
        >
            <TeamsContent />
        </Suspense>
    );
}