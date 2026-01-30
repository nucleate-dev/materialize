"use client";

import { useEffect, useState } from "react";

const phases = ["sketch", "wireframe", "styled", "polished"] as const;

/**
 * Founder Demo - Shows an idea transforming into a working prototype
 */
export default function FounderDemo() {
  const [phase, setPhase] = useState<"sketch" | "wireframe" | "styled" | "polished">("sketch");

  useEffect(() => {
    const phaseDurations = {
      sketch: 2000,
      wireframe: 1500,
      styled: 1500,
      polished: 2500,
    };

    const timer = setTimeout(() => {
      const currentIndex = phases.indexOf(phase);
      if (currentIndex < phases.length - 1) {
        setPhase(phases[currentIndex + 1]);
      } else {
        // Reset
        setPhase("sketch");
      }
    }, phaseDurations[phase]);

    return () => clearTimeout(timer);
  }, [phase]);

  const getPhaseStyles = () => {
    switch (phase) {
      case "sketch":
        return {
          container: "bg-amber-50/5 border-2 border-dashed border-amber-500/30",
          text: "font-handwriting text-amber-400/80",
          button: "border-2 border-dashed border-amber-500/40 bg-transparent text-amber-400/60 rounded",
          card: "border-2 border-dashed border-amber-500/30 bg-transparent",
          nav: "border-b-2 border-dashed border-amber-500/30",
        };
      case "wireframe":
        return {
          container: "bg-muted/20 border border-border",
          text: "font-mono text-muted-foreground",
          button: "bg-muted text-muted-foreground rounded",
          card: "border border-border bg-muted/30",
          nav: "border-b border-border",
        };
      case "styled":
        return {
          container: "bg-card border border-border rounded-lg",
          text: "font-sans text-foreground",
          button: "bg-primary/80 text-primary-foreground rounded-lg",
          card: "border border-border bg-card rounded-lg",
          nav: "border-b border-border",
        };
      case "polished":
        return {
          container: "bg-card border border-border rounded-xl shadow-lg shadow-primary/5",
          text: "font-sans text-foreground",
          button: "bg-primary text-primary-foreground rounded-lg shadow-md shadow-primary/20",
          card: "border border-border bg-card rounded-xl shadow-sm",
          nav: "border-b border-border bg-card/50 backdrop-blur-sm",
        };
    }
  };

  const styles = getPhaseStyles();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Phase indicators */}
      <div className="flex items-center justify-between mb-6 max-w-md mx-auto">
        {phases.map((p, i) => (
          <div key={p} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-500 ${
                  phases.indexOf(phase) >= i
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 capitalize">{p}</div>
            </div>
            {i < phases.length - 1 && (
              <div className="w-12 h-0.5 bg-muted mx-2 mt-[-12px]">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: phases.indexOf(phase) > i ? "100%" : "0%" }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* App preview */}
      <div className={`transition-all duration-700 overflow-hidden ${styles.container}`}>
        {/* Navigation */}
        <div className={`flex items-center justify-between p-3 ${styles.nav} transition-all duration-500`}>
          <div className={`text-sm font-semibold ${styles.text} transition-all duration-500`}>
            {phase === "sketch" ? "TaskFlow" : "TaskFlow"}
          </div>
          <div className="flex items-center gap-2">
            {phase === "sketch" ? (
              <>
                <span className={`text-xs ${styles.text}`}>Home</span>
                <span className={`text-xs ${styles.text}`}>Tasks</span>
                <span className={`text-xs ${styles.text}`}>Team</span>
              </>
            ) : (
              <>
                <div className="w-8 h-2 bg-muted rounded" />
                <div className="w-8 h-2 bg-muted rounded" />
                <div className="w-8 h-2 bg-muted rounded" />
              </>
            )}
            <button className={`px-2 py-1 text-xs ${styles.button} transition-all duration-500`}>
              Sign Up
            </button>
          </div>
        </div>

        {/* Hero section */}
        <div className="p-6 text-center">
          <h1 className={`text-lg font-bold mb-2 ${styles.text} transition-all duration-500`}>
            {phase === "sketch" ? "Manage tasks with your team!" : "Manage tasks with your team"}
          </h1>
          <p className={`text-xs mb-4 ${styles.text} opacity-70 transition-all duration-500`}>
            {phase === "sketch" ? "Simple & powerful" : "Simple and powerful task management"}
          </p>
          <button className={`px-4 py-2 text-sm font-medium ${styles.button} transition-all duration-500`}>
            Get Started Free
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-3 p-4">
          {[
            { icon: "📋", title: "Organize", desc: "Keep tasks in order" },
            { icon: "👥", title: "Collaborate", desc: "Work with your team" },
            { icon: "📊", title: "Track", desc: "Monitor progress" },
          ].map((feature, i) => (
            <div
              key={i}
              className={`p-3 transition-all duration-500 ${styles.card}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="text-lg mb-2">{feature.icon}</div>
              <div className={`text-xs font-semibold mb-1 ${styles.text} transition-all duration-500`}>
                {feature.title}
              </div>
              <div className={`text-[10px] ${styles.text} opacity-60 transition-all duration-500`}>
                {feature.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Task preview */}
        <div className="p-4">
          <div className={`p-3 ${styles.card} transition-all duration-500`}>
            <div className={`text-xs font-semibold mb-2 ${styles.text}`}>Today&apos;s Tasks</div>
            <div className="space-y-2">
              {["Design homepage", "Review feedback", "Ship v1.0"].map((task, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 p-2 rounded transition-all duration-300 ${
                    phase === "polished" ? "bg-muted/30" : "bg-transparent"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 transition-all duration-500 ${
                      phase === "sketch"
                        ? "border-dashed border-amber-500/40"
                        : phase === "polished" && i === 0
                        ? "bg-primary border-primary"
                        : "border-border"
                    }`}
                  >
                    {phase === "polished" && i === 0 && (
                      <span className="text-[10px] text-primary-foreground flex items-center justify-center h-full">
                        ✓
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs ${styles.text} transition-all duration-500 ${
                      phase === "polished" && i === 0 ? "line-through opacity-50" : ""
                    }`}
                  >
                    {task}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Phase label */}
      <div className="text-center mt-4">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={`w-2 h-2 rounded-full ${
              phase === "polished" ? "bg-green-500" : "bg-primary animate-pulse"
            }`}
          />
          {phase === "sketch" && "Starting with a rough idea..."}
          {phase === "wireframe" && "Building the structure..."}
          {phase === "styled" && "Applying styles..."}
          {phase === "polished" && "Production ready!"}
        </span>
      </div>
    </div>
  );
}
