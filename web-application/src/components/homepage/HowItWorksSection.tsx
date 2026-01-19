import { CheckCircle2, Github } from "lucide-react";
import { ENABLE_DESIGN_SYSTEM } from "@/GlobalConstants";

/**
 * HOW IT WORKS SECTION - Server Component
 * Static content showing the 3-step process
 */
export default function HowItWorksSection() {
  const steps = [
    {
      number: 1,
      title: "Connect Repo",
      description: ENABLE_DESIGN_SYSTEM
        ? "Connect GitHub. Nucleate auto-detects your design system, components, and styling primitives."
        : "Connect GitHub. Nucleate auto-detects your components and styling primitives.",
      color: "primary",
    },
    {
      number: 2,
      title: "Prototype & Explore",
      description:
        "Describe a flow. Generate variants and screens using your real system components instantly.",
      color: "purple",
    },
    {
      number: 3,
      title: "Ship Real Code",
      description:
        "Export production-ready web or mobile code. Or, have Nucleate open a PR directly against your repo.",
      color: "emerald",
    },
  ];

  return (
    <section className="py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/3 left-0 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDuration: '15s' }} />

      <div className="container mx-auto px-6 max-w-4xl relative z-10">
        <div className="text-center mb-16 animate-fade-in-up">
          <h2 className="text-3xl md:text-5xl font-medium text-foreground mb-4">
            How It Works
          </h2>
          <p className="text-muted-foreground">
            No manual setup. No component tagging. No config hell.
          </p>
        </div>

        <div className="space-y-12 relative">
          {/* Connecting Line - simplified for server rendering */}
          <div className="absolute left-[27px] top-4 bottom-4 w-0.5 md:left-1/2 md:-ml-px">
            <div className="w-full h-full bg-gradient-to-b from-indigo-500 via-purple-500 to-emerald-500 animate-fade-in" style={{ animationDuration: '1.5s' }} />
          </div>

          {steps.map((step, index) => (
            <div
              key={step.number}
              className="relative flex flex-col md:flex-row items-center gap-8 group animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Step Number */}
              <div className="absolute left-0 w-14 h-14 rounded-full bg-card border-4 border-background z-10 flex items-center justify-center text-foreground font-bold md:left-1/2 md:-ml-7 shadow-xl transition-all group-hover:scale-110 animate-scale-in">
                <span>{step.number}</span>
              </div>

              {/* Content - alternating sides */}
              {index % 2 === 0 ? (
                <>
                  <div className="pl-20 md:pl-0 md:w-1/2 md:pr-12 md:text-right">
                    <div className="bg-card p-6 rounded-2xl border border-border hover:border-border transition-all hover:-translate-y-1">
                      <h3 className="text-xl font-medium text-foreground mb-2 flex items-center gap-2 md:justify-end">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {step.description}
                      </p>

                      {/* Step 1 illustration */}
                      {index === 0 && (
                        <div className="mt-4 flex items-center justify-center md:justify-end gap-2">
                          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center border border-border animate-scale-in" style={{ animationDelay: '100ms' }}>
                            <Github className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="w-6 h-px bg-primary animate-fade-in" style={{ animationDelay: '250ms' }} />
                          <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center border border-primary/30 animate-scale-in" style={{ animationDelay: '400ms' }}>
                            <CheckCircle2 className="w-3 h-3 text-primary" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="md:w-1/2" />
                </>
              ) : (
                <>
                  <div className="md:w-1/2" />
                  <div className="pl-20 md:pl-0 md:w-1/2 md:pl-12">
                    <div className="bg-card p-6 rounded-2xl border border-border hover:border-border transition-all hover:-translate-y-1">
                      <h3 className="text-xl font-medium text-foreground mb-2 flex items-center gap-2">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {step.description}
                      </p>

                      {/* Step 2 illustration */}
                      {index === 1 && (
                        <div className="mt-4 flex items-center justify-center md:justify-start gap-1">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="w-6 h-9 bg-purple-500/10 rounded border border-purple-500/20 animate-scale-in"
                              style={{
                                animationDelay: `${100 + i * 30}ms`,
                                transform: i === 0 ? 'rotate(-5deg)' : i === 2 ? 'rotate(5deg)' : 'none'
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Step 3 illustration */}
                      {index === 2 && (
                        <div className="mt-4 flex items-center justify-center md:justify-start">
                          <div className="px-3 py-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/30 flex items-center gap-2 animate-scale-in" style={{ animationDelay: '150ms' }}>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span className="text-xs text-emerald-400 font-medium">
                              PR Created
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
