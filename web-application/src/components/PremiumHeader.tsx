"use client";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { useEffect, useState } from "react";

export default function PremiumHeader() {
  const { user, userIsLoading } = useUser();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled 
        ? 'bg-white/90 dark:bg-black/90 backdrop-blur-xl border-b border-gray-200/20 dark:border-gray-700/20 py-3' 
        : 'bg-transparent py-6'
    }`}>
      <div className="container mx-auto px-6">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-bold text-black dark:text-white">Materialize</span>
          </div>

          {/* Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#product"
              className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white transition-all duration-200 text-sm font-medium"
            >
              Product
            </a>
            <a
              href="#canvas"
              className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white transition-all duration-200 text-sm font-medium"
            >
              Canvas
            </a>
            <a
              href="#pricing"
              className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white transition-all duration-200 text-sm font-medium"
            >
              Pricing
            </a>
            <a
              href="#changelog"
              className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white transition-all duration-200 text-sm font-medium"
            >
              Changelog
            </a>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center space-x-3">
            {userIsLoading ? (
              <div className="px-4 py-2 rounded-full border border-black/20 dark:border-white/20 text-black/80 dark:text-white/80 text-sm">
                Loading...
              </div>
            ) : user ? (
              <Link
                href="/dashboard"
                className="bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-full font-medium transition-all duration-300 hover:scale-105 text-sm"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-black/70 dark:text-white/70 transition-all duration-200 hover:text-black dark:hover:text-white text-sm font-medium"
                >
                  Sign in
                </Link>
                <a
                  href="https://docs.google.com/forms/d/e/1FAIpQLSfQ6d-hfVG5x250NpqnTJVPFmMcMqEfFZKUnmTTET7nzD2GEw/viewform?usp=header"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-full font-medium transition-all duration-300 hover:scale-105 text-sm"
                >
                  Join Waitlist
                </a>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
