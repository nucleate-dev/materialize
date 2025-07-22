"use client";
import { SparklesIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

export default function PremiumHeader() {
  return (
    <header className="relative z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
      <div className="container mx-auto px-6 py-4">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-white to-gray-300 rounded-xl flex items-center justify-center shadow-lg">
                <SparklesIcon className="w-6 h-6 text-black" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-pulse"></div>
            </div>
            <span className="text-2xl font-bold text-white">
              Materialize
            </span>
          </div>

          {/* Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-white/80 hover:text-white transition-all duration-200 hover:scale-105">
              Features
            </a>
            <a href="#flows" className="text-white/80 hover:text-white transition-all duration-200 hover:scale-105">
              Flows
            </a>
            <a href="#pricing" className="text-white/80 hover:text-white transition-all duration-200 hover:scale-105">
              Pricing
            </a>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="px-6 py-3 rounded-xl border border-white/20 text-white/80 backdrop-blur-xl transition-all duration-300 hover:text-white hover:bg-white/10 hover:scale-105"
            >
              Sign in
            </Link>
            <button className="group relative bg-white text-black px-6 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-white/20 hover:bg-gray-50">
              <span className="relative z-10">Get started</span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}