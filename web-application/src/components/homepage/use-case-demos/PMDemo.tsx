"use client";

import { useEffect, useState } from "react";

/**
 * Product Manager Demo - Shows interactive prototype testing with user feedback
 */
export default function PMDemo() {
  const [step, setStep] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    const stepDurations = [1500, 1200, 1200, 1200, 2000];

    const timer = setTimeout(() => {
      if (step < 4) {
        setStep(step + 1);
      } else {
        // Show feedback then reset
        setShowFeedback(true);
        setTimeout(() => {
          setShowFeedback(false);
          setStep(0);
        }, 2500);
      }
    }, stepDurations[step]);

    return () => clearTimeout(timer);
  }, [step]);

  const screens = [
    { title: "Welcome", content: "onboarding" },
    { title: "Dashboard", content: "dashboard" },
    { title: "Analytics", content: "analytics" },
    { title: "Settings", content: "settings" },
    { title: "Complete", content: "success" },
  ];

  return (
    <div className="flex gap-8 items-center max-w-4xl mx-auto">
      {/* Phone mockup */}
      <div className="flex-shrink-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 text-center">
          User Testing Session
        </div>
        <div className="relative">
          {/* Phone frame */}
          <div className="w-[200px] h-[400px] bg-background border-4 border-foreground/20 rounded-[2rem] p-2 relative overflow-hidden">
            {/* Notch */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-foreground/20 rounded-full z-10" />

            {/* Screen content */}
            <div className="w-full h-full bg-card rounded-[1.5rem] overflow-hidden relative pt-6">
              {screens.map((screen, i) => (
                <div
                  key={i}
                  className={`absolute inset-0 pt-6 p-3 transition-all duration-300 ${
                    step === i ? "opacity-100 translate-x-0" : i < step ? "opacity-0 -translate-x-full" : "opacity-0 translate-x-full"
                  }`}
                >
                  {/* Screen header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-semibold text-foreground">{screen.title}</div>
                    <div className="w-4 h-4 bg-primary/20 rounded" />
                  </div>

                  {/* Screen content based on type */}
                  {screen.content === "onboarding" && (
                    <div className="space-y-3 text-center pt-4">
                      <div className="w-12 h-12 bg-primary/20 rounded-full mx-auto" />
                      <div className="w-2/3 h-2 bg-foreground/60 rounded mx-auto" />
                      <div className="w-1/2 h-1.5 bg-muted rounded mx-auto" />
                      <div className="w-full h-6 bg-primary rounded-lg mt-4" />
                    </div>
                  )}
                  {screen.content === "dashboard" && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-primary/10 rounded-lg p-2 h-16" />
                        <div className="bg-blue-500/10 rounded-lg p-2 h-16" />
                      </div>
                      <div className="bg-muted/30 rounded-lg h-20" />
                    </div>
                  )}
                  {screen.content === "analytics" && (
                    <div className="space-y-2">
                      <div className="h-24 bg-muted/20 rounded-lg flex items-end justify-around p-2">
                        {[40, 65, 45, 80, 55, 70].map((h, i) => (
                          <div key={i} className="w-3 bg-primary/60 rounded-t" style={{ height: `${h}%` }} />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 h-8 bg-muted/30 rounded" />
                        <div className="flex-1 h-8 bg-muted/30 rounded" />
                      </div>
                    </div>
                  )}
                  {screen.content === "settings" && (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-muted/10 rounded">
                          <div className="w-4 h-4 bg-muted rounded" />
                          <div className="flex-1 h-2 bg-muted/60 rounded" />
                          <div className="w-6 h-3 bg-primary/40 rounded-full" />
                        </div>
                      ))}
                    </div>
                  )}
                  {screen.content === "success" && (
                    <div className="flex flex-col items-center justify-center h-full -mt-6">
                      <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-2">
                        <span className="text-green-400 text-lg">✓</span>
                      </div>
                      <div className="text-[10px] font-medium text-foreground">Flow Complete</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tap indicator */}
          <div
            className={`absolute w-8 h-8 rounded-full border-2 border-primary bg-primary/20 transition-all duration-300 ${
              step < 4 ? "opacity-100 scale-100" : "opacity-0 scale-50"
            }`}
            style={{
              bottom: "60px",
              left: "50%",
              transform: "translateX(-50%)",
              animation: step < 4 ? "pulse 1s infinite" : "none",
            }}
          />
        </div>
      </div>

      {/* Right: Testing metrics & feedback */}
      <div className="flex-1 space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Live Metrics
        </div>

        {/* Progress through flow */}
        <div className="bg-background/50 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">User Flow Progress</span>
            <span className="text-xs text-muted-foreground">{Math.min(step + 1, 5)}/5 screens</span>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded transition-colors duration-300 ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Engagement metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-background/50 border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Avg. Time per Screen</div>
            <div className="text-lg font-semibold text-foreground">1.2s</div>
          </div>
          <div className="bg-background/50 border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">Completion Rate</div>
            <div className="text-lg font-semibold text-green-400">94%</div>
          </div>
        </div>

        {/* User feedback appearing */}
        <div
          className={`bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 transition-all duration-500 ${
            showFeedback ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-blue-500/20 rounded-full flex-shrink-0 flex items-center justify-center text-xs">
              👤
            </div>
            <div>
              <div className="text-xs font-medium text-blue-400 mb-1">User Feedback</div>
              <div className="text-sm text-foreground/80">
                "The onboarding flow was smooth! Would love a skip option."
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
