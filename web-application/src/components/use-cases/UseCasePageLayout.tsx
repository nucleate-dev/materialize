"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";
import { ReactNode } from "react";

interface UseCasePageLayoutProps {
  children: ReactNode;
  accentColor?: "blue" | "emerald" | "violet" | "amber" | "rose";
}

/**
 * Shared layout for use case pages
 * Provides consistent header, footer, and background styling
 */
export default function UseCasePageLayout({
  children,
  accentColor = "blue",
}: UseCasePageLayoutProps) {
  const accentClasses = {
    blue: "selection:bg-blue-500/30",
    emerald: "selection:bg-emerald-500/30",
    violet: "selection:bg-violet-500/30",
    amber: "selection:bg-amber-500/30",
    rose: "selection:bg-rose-500/30",
  };

  return (
    <main
      className={`relative min-h-screen bg-background text-foreground ${accentClasses[accentColor]} overflow-hidden font-sans`}
    >
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />
        {children}
        <Footer />
      </div>
    </main>
  );
}
