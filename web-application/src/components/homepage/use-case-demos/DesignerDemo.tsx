"use client";

import { useEffect, useState } from "react";

/**
 * Designer Demo - Shows component variants being explored
 */
export default function DesignerDemo() {
  const [activeVariant, setActiveVariant] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const variants = [
    {
      name: "Default",
      button: "bg-primary text-primary-foreground rounded-lg px-4 py-2",
      card: "bg-card border border-border rounded-lg",
      input: "bg-background border border-border rounded-lg",
    },
    {
      name: "Rounded",
      button: "bg-primary text-primary-foreground rounded-full px-6 py-2",
      card: "bg-card border border-border rounded-2xl",
      input: "bg-background border border-border rounded-full",
    },
    {
      name: "Sharp",
      button: "bg-primary text-primary-foreground rounded-none px-4 py-2",
      card: "bg-card border border-border rounded-none",
      input: "bg-background border border-border rounded-none",
    },
    {
      name: "Outlined",
      button: "bg-transparent border-2 border-primary text-primary rounded-lg px-4 py-2",
      card: "bg-transparent border-2 border-border rounded-lg",
      input: "bg-transparent border-2 border-border rounded-lg",
    },
    {
      name: "Gradient",
      button: "bg-gradient-to-r from-primary to-purple-500 text-primary-foreground rounded-lg px-4 py-2",
      card: "bg-gradient-to-br from-card to-primary/5 border border-border rounded-lg",
      input: "bg-gradient-to-r from-background to-primary/5 border border-border rounded-lg",
    },
  ];

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setActiveVariant((prev) => (prev + 1) % variants.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, variants.length]);

  const currentVariant = variants[activeVariant];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex gap-8">
        {/* Left: Variant selector */}
        <div className="w-48 flex-shrink-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Style Variants
          </div>
          <div className="space-y-2">
            {variants.map((variant, i) => (
              <button
                key={variant.name}
                onClick={() => {
                  setActiveVariant(i);
                  setIsAutoPlaying(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                  activeVariant === i
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground border border-transparent"
                }`}
              >
                {variant.name}
              </button>
            ))}
          </div>
          {!isAutoPlaying && (
            <button
              onClick={() => setIsAutoPlaying(true)}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ▶ Resume auto-play
            </button>
          )}
        </div>

        {/* Right: Live preview */}
        <div className="flex-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Live Preview — {currentVariant.name}
          </div>

          <div className="bg-background border border-border rounded-xl p-6 space-y-6">
            {/* Component showcase */}
            <div className="grid grid-cols-3 gap-4">
              {/* Button variants */}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Buttons</div>
                <div className="space-y-2">
                  <button className={`${currentVariant.button} text-sm font-medium transition-all duration-300 w-full`}>
                    Primary
                  </button>
                  <button className={`${currentVariant.button} text-sm font-medium transition-all duration-300 w-full opacity-60`}>
                    Secondary
                  </button>
                </div>
              </div>

              {/* Card variant */}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Cards</div>
                <div className={`${currentVariant.card} p-3 transition-all duration-300`}>
                  <div className="w-8 h-8 bg-primary/20 rounded mb-2" />
                  <div className="w-full h-2 bg-muted rounded mb-1" />
                  <div className="w-2/3 h-2 bg-muted/60 rounded" />
                </div>
              </div>

              {/* Input variant */}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Inputs</div>
                <div className="space-y-2">
                  <div className={`${currentVariant.input} px-3 py-2 text-sm text-muted-foreground transition-all duration-300`}>
                    Text input...
                  </div>
                  <div className={`${currentVariant.input} px-3 py-2 text-sm transition-all duration-300 flex items-center justify-between`}>
                    <span className="text-muted-foreground">Select</span>
                    <span className="text-muted-foreground">▼</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mini UI preview */}
            <div className={`${currentVariant.card} p-4 transition-all duration-300`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary/20 rounded-full" />
                  <div>
                    <div className="w-20 h-2 bg-foreground/60 rounded mb-1" />
                    <div className="w-14 h-1.5 bg-muted rounded" />
                  </div>
                </div>
                <button className={`${currentVariant.button} text-xs font-medium transition-all duration-300`}>
                  Follow
                </button>
              </div>
              <div className={`${currentVariant.input} p-3 text-sm text-muted-foreground transition-all duration-300`}>
                What&apos;s on your mind?
              </div>
            </div>
          </div>

          {/* Variant indicator */}
          <div className="flex justify-center gap-2 mt-4">
            {variants.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  activeVariant === i ? "bg-primary w-4" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
