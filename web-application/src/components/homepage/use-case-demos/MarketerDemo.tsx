"use client";

import { useEffect, useState } from "react";

/**
 * Marketer Demo - Shows a prompt being typed and a landing page building itself
 */
export default function MarketerDemo() {
  const [phase, setPhase] = useState(0);
  const [typedText, setTypedText] = useState("");

  const prompt = "Create a landing page for our AI analytics product";

  useEffect(() => {
    // Phase 0: Type the prompt
    if (phase === 0) {
      let index = 0;
      const interval = setInterval(() => {
        if (index <= prompt.length) {
          setTypedText(prompt.slice(0, index));
          index++;
        } else {
          clearInterval(interval);
          setTimeout(() => setPhase(1), 400);
        }
      }, 35);
      return () => clearInterval(interval);
    }
  }, [phase]);

  useEffect(() => {
    // Auto-advance phases for the build animation
    if (phase >= 1 && phase < 5) {
      const timer = setTimeout(() => setPhase(phase + 1), 600);
      return () => clearTimeout(timer);
    }
    // Reset loop
    if (phase === 5) {
      const timer = setTimeout(() => {
        setPhase(0);
        setTypedText("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  return (
    <div className="flex gap-8 items-start max-w-4xl mx-auto">
      {/* Left: Prompt input mockup */}
      <div className="flex-1 space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Your prompt
        </div>
        <div className="bg-background/50 border border-border rounded-lg p-4 min-h-[60px]">
          <span className="text-foreground">{typedText}</span>
          <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${phase >= 1 ? "bg-green-500" : "bg-muted"}`} />
          <span>{phase >= 1 ? "Generating..." : "Waiting for input"}</span>
        </div>
      </div>

      {/* Right: Landing page building itself */}
      <div className="flex-1">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Result
        </div>
        <div className="bg-background border border-border rounded-lg overflow-hidden aspect-[4/3] relative">
          {/* Mini landing page mockup */}
          <div className="p-3 space-y-2">
            {/* Nav */}
            <div className={`flex justify-between items-center transition-all duration-500 ${phase >= 1 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}>
              <div className="w-16 h-2 bg-primary/60 rounded" />
              <div className="flex gap-2">
                <div className="w-8 h-2 bg-muted rounded" />
                <div className="w-8 h-2 bg-muted rounded" />
                <div className="w-12 h-4 bg-primary rounded text-[6px] text-primary-foreground flex items-center justify-center font-medium">
                  Get Started
                </div>
              </div>
            </div>

            {/* Hero */}
            <div className={`pt-4 pb-3 text-center transition-all duration-500 delay-100 ${phase >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <div className="w-3/4 h-3 bg-foreground/80 rounded mx-auto mb-2" />
              <div className="w-1/2 h-2 bg-muted-foreground/40 rounded mx-auto mb-3" />
              <div className="w-16 h-4 bg-primary rounded mx-auto" />
            </div>

            {/* Features grid */}
            <div className={`grid grid-cols-3 gap-2 pt-2 transition-all duration-500 delay-200 ${phase >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border/50 rounded p-2">
                  <div className="w-4 h-4 bg-primary/20 rounded mb-1" />
                  <div className="w-full h-1.5 bg-muted rounded mb-1" />
                  <div className="w-2/3 h-1 bg-muted/60 rounded" />
                </div>
              ))}
            </div>

            {/* CTA section */}
            <div className={`bg-card/50 rounded p-2 mt-2 text-center transition-all duration-500 delay-300 ${phase >= 4 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <div className="w-1/2 h-2 bg-foreground/60 rounded mx-auto mb-2" />
              <div className="w-20 h-4 bg-primary rounded mx-auto" />
            </div>
          </div>

          {/* Success overlay */}
          <div className={`absolute inset-0 bg-green-500/10 border-2 border-green-500/30 rounded-lg flex items-center justify-center transition-opacity duration-300 ${phase === 5 ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <div className="bg-green-500/20 text-green-400 px-3 py-1.5 rounded-full text-xs font-medium">
              ✓ Ready to deploy
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
