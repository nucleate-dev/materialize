import {
  GitBranch,
  Code2,
  Layers,
  RefreshCw,
  Palette,
  Camera,
  GitPullRequest,
} from "lucide-react";

/**
 * PROBLEM SECTION - Server Component
 * Static content explaining why teams struggle with UI iteration
 */
export default function ProblemSection() {
  const painPoints = [
    {
      title: "Design Drift",
      desc: "Figma diverges from code. Nucleate uses your repo as the single source of truth.",
      icon: <GitBranch className="w-5 h-5 text-orange-400" />,
      glowColor: "group-hover:bg-orange-500/5",
      hoverBorder: "hover:border-orange-500/30",
    },
    {
      title: "Manual Rebuilds",
      desc: "Engineers rebuild UI from scratch using screenshots. Nucleate outputs production-ready PRs.",
      icon: <Code2 className="w-5 h-5 text-pink-400" />,
      glowColor: "group-hover:bg-pink-500/5",
      hoverBorder: "hover:border-pink-500/30",
    },
    {
      title: "Stifled Exploration",
      desc: "Handoff is too slow to try more than 1 design. Nucleate generates 10 system-safe variants in minutes.",
      icon: <Layers className="w-5 h-5 text-yellow-400" />,
      glowColor: "group-hover:bg-yellow-500/5",
      hoverBorder: "hover:border-yellow-500/30",
    },
    {
      title: "Handoff Friction",
      desc: "The 'design-to-dev' loop takes weeks. Nucleate unifies exploration and implementation in one cycle.",
      icon: <RefreshCw className="w-5 h-5 text-primary" />,
      glowColor: "group-hover:bg-primary/5",
      hoverBorder: "hover:border-primary/30",
    },
  ];

  return (
    <section className="py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-0 left-1/4 w-[300px] h-[300px] bg-orange-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDuration: '10s' }} />
      <div className="absolute bottom-0 right-1/4 w-[250px] h-[250px] bg-pink-600/10 rounded-full blur-[80px] pointer-events-none animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />

      <div className="container mx-auto px-6 max-w-6xl relative z-10">
        <div className="text-center mb-16 animate-fade-in-up">
          <h2 className="text-3xl md:text-5xl font-medium text-foreground mb-4">
            UI iteration is broken when design and code are split.
          </h2>
          <p className="text-muted-foreground text-lg">
            Bridge the gap between vision and production.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {painPoints.map((point, idx) => (
            <div
              key={idx}
              className={`p-6 rounded-2xl bg-card border border-border group transition-all duration-300 relative overflow-hidden hover:-translate-y-2 ${point.hoverBorder} animate-fade-in-up`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div
                className={`absolute inset-0 ${point.glowColor} transition-colors duration-300`}
              />
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4 border border-border transition-transform group-hover:rotate-6">
                  {point.icon}
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {point.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {point.desc}
                </p>

                {/* Simple visual illustrations */}
                {idx === 0 && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <div className="w-6 h-6 bg-purple-500/20 rounded flex items-center justify-center">
                      <Palette className="w-3 h-3 text-purple-400" />
                    </div>
                    <div className="text-muted-foreground text-xs">↔</div>
                    <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center">
                      <Code2 className="w-3 h-3 text-blue-400" />
                    </div>
                  </div>
                )}

                {idx === 1 && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <div className="w-6 h-6 bg-accent rounded flex items-center justify-center">
                      <Camera className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div className="text-pink-400 text-xs">→</div>
                    <div className="w-6 h-6 bg-emerald-500/20 rounded flex items-center justify-center">
                      <GitPullRequest className="w-3 h-3 text-emerald-400" />
                    </div>
                  </div>
                )}

                {idx === 2 && (
                  <div className="mt-4 flex items-center justify-center">
                    <div className="flex -space-x-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-5 h-7 bg-yellow-500/20 rounded border border-yellow-500/30"
                          style={{ transform: `translateX(${i * 4}px)` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {idx === 3 && (
                  <div className="mt-4 flex items-center justify-center">
                    <div className="relative w-full max-w-[80px]">
                      <div className="h-1.5 bg-accent rounded-full" />
                      <div className="absolute top-0 left-0 h-1.5 w-[30%] bg-primary rounded-full transition-all" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
