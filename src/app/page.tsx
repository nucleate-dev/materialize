"use client";
import PremiumHeader from "@/components/PremiumHeader";
import {
  ArrowRightIcon,
  ArrowsPointingOutIcon,
  BoltIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CursorArrowRaysIcon,
  DevicePhoneMobileIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  LinkIcon,
  PaintBrushIcon,
  PlayIcon
} from "@heroicons/react/24/outline";
import { useState } from "react";



export default function Home() {
  return (
    <main className="bg-black overflow-hidden">
      <PremiumHeader />
      <HeroSection />
      <UserFlowsSection />
      <FeaturesSection />
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
          <span className="text-sm text-white font-medium">Speed of Thought Prototyping</span>
        </div>

        {/* Main Heading with Gradient */}
        <h1 className="text-7xl md:text-8xl lg:text-9xl font-black mb-8 leading-tight">
          <span className="bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent">
            Materialize
          </span>
        </h1>

        {/* Animated Subtitle */}
        <p className="text-xl md:text-2xl text-gray-300 max-w-5xl mx-auto mb-16 leading-relaxed">
          Prototype your ideas, workshop new designs, and build high-quality user flows at the
          <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent font-semibold"> speed of thought</span>.
          Start with an infinite canvas to rapidly create React and React Native components.
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
              <span className="text-white text-sm font-semibold">React + React Native</span>
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

function UserFlowsSection() {
  const [activeFlow, setActiveFlow] = useState(0);

  const flows = [
    {
      id: 0,
      title: "Fast Component Prototyping",
      subtitle: "One component → 5-10 design variants",
      description: "Input a single component and instantly generate multiple polished design variations. Compare styles, layouts, and approaches side-by-side.",
      icon: <BoltIcon className="w-8 h-8" />,
      features: ["AI-powered style variations", "Instant visual comparison", "Best practice patterns", "One-click refinement"],
      demo: "component-demo"
    },
    {
      id: 1,
      title: "End-to-End Flow Design",
      subtitle: "Visualize complete user journeys",
      description: "Map out entire user flows on an infinite canvas. Edit screens visually, with code, or natural language. Export directly to GitHub.",
      icon: <ArrowsPointingOutIcon className="w-8 h-8" />,
      features: ["Infinite canvas layout", "Multi-modal editing", "Flow connections", "GitHub integration"],
      demo: "flow-demo"
    }
  ];

  return (
    <section id="flows" className="relative py-32 bg-gradient-to-b from-black to-gray-900">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-2 mb-6 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-full">
            <span className="text-sm text-purple-300 font-medium">Core User Flows</span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-6 text-white">
            Two Powerful Workflows
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Materialize excels at two core scenarios that transform how you prototype and design.
          </p>
        </div>

        {/* Flow Selector */}
        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
          {/* Flow Navigation */}
          <div className="lg:w-1/3 space-y-4">
            {flows.map((flow, index) => (
              <div
                key={flow.id}
                onClick={() => setActiveFlow(index)}
                className={`p-6 rounded-2xl border cursor-pointer transition-all duration-300 ${activeFlow === index
                  ? 'bg-gradient-to-r from-white/10 to-white/5 border-white/30 shadow-2xl'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${activeFlow === index ? 'bg-white text-black' : 'bg-white/10 text-white'
                    } transition-colors duration-300`}>
                    {flow.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">{flow.title}</h3>
                    <p className="text-sm text-purple-300 font-medium mb-3">{flow.subtitle}</p>
                    <p className="text-gray-300 text-sm leading-relaxed mb-4">{flow.description}</p>
                    <div className="space-y-2">
                      {flow.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-gray-400">
                          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Flow Demo */}
          <div className="lg:w-2/3">
            <div className="bg-gradient-to-br from-gray-900 to-black rounded-3xl border border-white/20 p-8 shadow-2xl">
              {activeFlow === 0 ? <ComponentDemo /> : <FlowDemo />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComponentDemo() {
  return (
    <div className="space-y-8">
      <div className="text-center mb-10">
        <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent mb-3">
          Component Variation Generator
        </h3>
        <p className="text-lg text-gray-300">Watch one simple input transform into eight stunning design variations</p>
      </div>

      {/* Input Component */}
      <div className="relative bg-gradient-to-br from-gray-900/80 to-black/90 rounded-3xl p-8 border border-white/20 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl"></div>
        <div className="relative">
          <div className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            Input Component
          </div>
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10 backdrop-blur-sm">
            <button className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium shadow-lg hover:shadow-blue-500/25 transition-all duration-300">
              Get Started
            </button>
          </div>
        </div>
      </div>

      {/* Generated Variations */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            style: "Holographic",
            classes: "relative bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-400 text-white font-semibold shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/50 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:rounded-xl hover:scale-105",
            bgStyle: "from-purple-900/30 to-cyan-900/30"
          },
          {
            style: "Neubrutalism",
            classes: "bg-yellow-400 text-black font-black border-4 border-black shadow-[6px_6px_0px_0px_#000] hover:shadow-[8px_8px_0px_0px_#000] hover:translate-x-[-2px] hover:translate-y-[-2px] uppercase tracking-wide",
            bgStyle: "from-yellow-500/20 to-orange-500/20"
          },
          {
            style: "Cyberpunk",
            classes: "relative bg-black border-2 border-cyan-400 text-cyan-400 font-bold overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-cyan-400/20 before:to-transparent before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700 shadow-lg shadow-cyan-400/30 hover:shadow-cyan-400/60",
            bgStyle: "from-cyan-900/30 to-blue-900/30"
          },
          {
            style: "Glassmorphism",
            classes: "bg-white/10 backdrop-blur-2xl border border-white/30 text-white font-medium shadow-2xl hover:bg-white/20 hover:border-white/40 relative before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:rounded-xl",
            bgStyle: "from-white/10 to-gray-500/10"
          },
          {
            style: "Retro Gradient",
            classes: "bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white font-bold shadow-2xl shadow-pink-500/40 hover:shadow-pink-500/60 hover:scale-105 relative before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:rounded-xl",
            bgStyle: "from-pink-900/30 to-yellow-900/30"
          },
          {
            style: "Minimalist Zen",
            classes: "bg-white text-gray-900 font-medium border border-gray-200 shadow-lg hover:shadow-xl hover:border-gray-300 transition-all duration-300 hover:-translate-y-1",
            bgStyle: "from-gray-100/20 to-white/20"
          },
          {
            style: "Dark Luxury",
            classes: "relative bg-gradient-to-br from-gray-800 to-black text-white font-semibold border border-amber-400/30 shadow-2xl shadow-amber-500/20 hover:shadow-amber-500/40 before:absolute before:inset-0 before:bg-gradient-to-br before:from-amber-400/10 before:to-transparent before:rounded-xl hover:scale-105",
            bgStyle: "from-amber-900/30 to-gray-900/30"
          },
          {
            style: "Soft Pastel",
            classes: "bg-gradient-to-br from-rose-300 via-pink-200 to-purple-200 text-purple-900 font-medium shadow-xl shadow-pink-300/40 hover:shadow-pink-300/60 hover:scale-105 border border-pink-200/50",
            bgStyle: "from-rose-200/20 to-purple-200/20"
          }
        ].map((variant, idx) => (
          <div key={idx} className={`relative bg-gradient-to-br ${variant.bgStyle} rounded-2xl p-6 border border-white/10 backdrop-blur-sm hover:border-white/20 transition-all duration-300 group`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-xs font-semibold text-gray-300 mb-4 uppercase tracking-wider">{variant.style}</div>
              <button className={`px-6 py-3 rounded-xl transition-all duration-300 w-full relative overflow-hidden ${variant.classes}`}>
                Get Started
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowDemo() {
  const [selectedFlow, setSelectedFlow] = useState<'onboarding' | 'signup' | 'checkout'>('onboarding');

  const flowTemplates = {
    onboarding: {
      name: "User Onboarding Flow",
      color: "from-blue-500 to-cyan-500",
      steps: [
        { id: 1, title: "Welcome Screen", subtitle: "Hero + value prop", icon: "👋", position: { x: 50, y: 100 } },
        { id: 2, title: "Feature Tour", subtitle: "3 key features", icon: "✨", position: { x: 200, y: 100 } },
        { id: 3, title: "Permissions", subtitle: "Camera, notifications", icon: "🔐", position: { x: 350, y: 100 } },
        { id: 4, title: "Setup Profile", subtitle: "Name, avatar, bio", icon: "👤", position: { x: 500, y: 100 } },
        { id: 5, title: "Dashboard", subtitle: "Main app interface", icon: "🏠", position: { x: 650, y: 100 } }
      ]
    },
    signup: {
      name: "User Signup Flow",
      color: "from-purple-500 to-pink-500",
      steps: [
        { id: 1, title: "Landing Page", subtitle: "Marketing CTA", icon: "🚀", position: { x: 50, y: 100 } },
        { id: 2, title: "Sign Up Form", subtitle: "Email + password", icon: "📝", position: { x: 200, y: 100 } },
        { id: 3, title: "Email Verify", subtitle: "Check inbox", icon: "📧", position: { x: 350, y: 100 } },
        { id: 4, title: "Plan Selection", subtitle: "Free vs Pro", icon: "💳", position: { x: 500, y: 100 } },
        { id: 5, title: "Welcome", subtitle: "Account created", icon: "🎉", position: { x: 650, y: 100 } }
      ]
    },
    checkout: {
      name: "E-commerce Checkout",
      color: "from-green-500 to-emerald-500",
      steps: [
        { id: 1, title: "Cart Review", subtitle: "Items + quantities", icon: "🛒", position: { x: 50, y: 100 } },
        { id: 2, title: "Shipping Info", subtitle: "Address + delivery", icon: "📦", position: { x: 200, y: 100 } },
        { id: 3, title: "Payment", subtitle: "Card + billing", icon: "💳", position: { x: 350, y: 100 } },
        { id: 4, title: "Order Review", subtitle: "Final confirmation", icon: "📋", position: { x: 500, y: 100 } },
        { id: 5, title: "Confirmation", subtitle: "Order success", icon: "✅", position: { x: 650, y: 100 } }
      ]
    }
  };

  const currentFlow = flowTemplates[selectedFlow];

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">Interactive Flow Editor</h3>
        <p className="text-gray-300">Visualize user journeys with drag-and-drop editing</p>
      </div>

      {/* Flow Type Selector */}
      <div className="flex justify-center gap-2 mb-6">
        {Object.entries(flowTemplates).map(([key, flow]) => (
          <button
            key={key}
            onClick={() => setSelectedFlow(key as 'onboarding' | 'signup' | 'checkout')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${selectedFlow === key
              ? `bg-gradient-to-r ${flow.color} text-white shadow-lg`
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
          >
            {flow.name}
          </button>
        ))}
      </div>

      {/* Enhanced Flow Canvas */}
      <div className="bg-gradient-to-br from-gray-900/80 to-black/80 rounded-2xl border border-white/20 overflow-hidden shadow-2xl">
        {/* Canvas Header */}
        <div className="border-b border-white/10 p-4 bg-black/40 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 bg-gradient-to-r ${currentFlow.color} rounded-full animate-pulse`}></div>
              <span className="text-white font-semibold">{currentFlow.name}</span>
              <span className="text-xs text-gray-400 bg-white/10 px-2 py-1 rounded">{currentFlow.steps.length} Steps</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <ArrowsPointingOutIcon className="w-4 h-4" />
              <span>Infinite Canvas</span>
            </div>
          </div>
        </div>

        {/* Interactive Canvas */}
        <div className="relative h-80 overflow-hidden bg-gradient-to-br from-gray-900/50 to-black/50">
          {/* Grid Background */}
          <div className="absolute inset-0 opacity-20">
            <div className="w-full h-full"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}>
            </div>
          </div>

          {/* Flow Steps */}
          <div className="relative h-full p-6">
            <div className="flex items-center justify-between h-full">
              {currentFlow.steps.map((step, idx) => (
                <div key={step.id} className="relative group">
                  {/* Connection Line */}
                  {idx < currentFlow.steps.length - 1 && (
                    <div className="absolute top-1/2 left-full w-8 flex items-center justify-center z-10">
                      <div className={`h-0.5 w-6 bg-gradient-to-r ${currentFlow.color} opacity-80`}></div>
                      <div className={`absolute right-0 w-0 h-0 border-l-4 border-transparent border-b-2 border-t-2 bg-gradient-to-r ${currentFlow.color}`}
                        style={{
                          borderLeftColor: idx === 0 ? '#3b82f6' : idx === 1 ? '#06b6d4' : idx === 2 ? '#8b5cf6' : '#ec4899',
                          borderTopColor: 'transparent',
                          borderBottomColor: 'transparent',
                          transform: 'rotate(90deg)'
                        }}>
                      </div>
                    </div>
                  )}

                  {/* Step Node */}
                  <div className="relative">
                    <div className={`w-32 h-40 bg-gradient-to-br from-white/20 to-white/5 rounded-2xl border border-white/30 cursor-pointer transition-all duration-300 hover:scale-105 hover:border-white/50 hover:shadow-xl group-hover:shadow-lg backdrop-blur-sm`}>
                      <div className="p-4 h-full flex flex-col">
                        {/* Step Icon */}
                        <div className={`w-12 h-12 bg-gradient-to-r ${currentFlow.color} rounded-xl flex items-center justify-center text-white text-xl font-bold mb-3 shadow-lg`}>
                          {step.icon}
                        </div>

                        {/* Step Content */}
                        <div className="flex-1">
                          <h4 className="text-white font-semibold text-sm mb-1 leading-tight">{step.title}</h4>
                          <p className="text-gray-300 text-xs leading-relaxed">{step.subtitle}</p>
                        </div>

                        {/* Step Number */}
                        <div className={`absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r ${currentFlow.color} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg`}>
                          {step.id}
                        </div>
                      </div>
                    </div>

                    {/* Hover Actions */}
                    <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="flex items-center gap-1 bg-black/80 rounded-lg px-2 py-1 backdrop-blur-xl border border-white/20">
                        <CursorArrowRaysIcon className="w-3 h-3 text-white" />
                        <span className="text-xs text-white">Edit</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating Action Panel */}
          <div className="absolute top-4 left-4 bg-black/80 rounded-xl p-3 border border-white/20 backdrop-blur-xl">
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1 text-white">
                <CursorArrowRaysIcon className="w-3 h-3" />
                <span>Drag</span>
              </div>
              <div className="w-px h-4 bg-white/20"></div>
              <div className="flex items-center gap-1 text-gray-400">
                <CommandLineIcon className="w-3 h-3" />
                <span>Code</span>
              </div>
              <div className="flex items-center gap-1 text-gray-400">
                <DocumentDuplicateIcon className="w-3 h-3" />
                <span>AI</span>
              </div>
            </div>
          </div>

          {/* Export Options */}
          <div className="absolute top-4 right-4 bg-black/80 rounded-xl p-3 border border-white/20 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs text-white">
              <LinkIcon className="w-3 h-3" />
              <span>Export Flow</span>
            </div>
          </div>

          {/* Canvas Actions */}
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 backdrop-blur-xl flex items-center justify-center transition-colors">
              <span className="text-white text-lg">+</span>
            </button>
            <button className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 backdrop-blur-xl flex items-center justify-center transition-colors">
              <EyeIcon className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Canvas Footer */}
        <div className="border-t border-white/10 p-3 bg-black/40 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4 text-gray-400">
              <span>Canvas: 2000x1000px</span>
              <span>Zoom: 100%</span>
              <span>Connected: {currentFlow.steps.length} nodes</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span>Auto-save enabled</span>
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: <ArrowsPointingOutIcon className="w-8 h-8" />,
      title: "Infinite Canvas & Flow Branching",
      description: "Compare 5–10 UX ideas side-by-side in one space—no file/version sprawl, faster convergence.",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: <PaintBrushIcon className="w-8 h-8" />,
      title: "Taste-Trained AI Variants",
      description: "One click produces polished, best-practice screens (onboarding, checkout, empty states) so you skip blank-canvas lag.",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      icon: <EyeIcon className="w-8 h-8" />,
      title: "Dive-In Component Editing",
      description: "Double-click to tweak props, layout, or copy with instant live re-render—stay in creative flow.",
      gradient: "from-green-500 to-emerald-500"
    },
    {
      icon: <DevicePhoneMobileIcon className="w-8 h-8" />,
      title: "React + React Native Preview",
      description: "Prototype web and mobile flows together; reuse patterns and decide platform nuances early.",
      gradient: "from-orange-500 to-red-500"
    },
    {
      icon: <CodeBracketIcon className="w-8 h-8" />,
      title: "One-Click Code Export",
      description: "Output clean JSX / RN Web or open a sandbox—eliminates hand-off rebuild time and accelerates implementation.",
      gradient: "from-indigo-500 to-purple-500"
    }
  ];

  return (
    <section id="features" className="relative py-32 bg-black">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-2 mb-6 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full">
            <span className="text-sm text-blue-300 font-medium">Core Features</span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-6 text-white">
            Built for Speed & Quality
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Every feature designed to eliminate friction and accelerate your creative process.
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
  gradient
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <div className="group relative">
      {/* Hover Glow Effect */}
      <div className={`absolute inset-0 bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-20 rounded-3xl blur-xl transition-opacity duration-500`}></div>

      {/* Card */}
      <div className="relative bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-3xl p-8 hover:border-white/30 transition-all duration-500 backdrop-blur-xl group-hover:transform group-hover:scale-105">
        {/* Icon */}
        <div className={`inline-flex p-4 bg-gradient-to-r ${gradient} rounded-2xl mb-6 shadow-lg`}>
          <div className="text-white">
            {icon}
          </div>
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