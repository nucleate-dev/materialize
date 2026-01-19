import { Badge } from "@/components/ui/badge";
import {
  FileCode,
  Github,
  GitPullRequest,
  Code2,
  Layers,
  ShieldCheck,
} from "lucide-react";

/**
 * CODEBASE INTEGRATION SECTION - Server Component
 * Static content showing how Nucleate integrates with existing codebases
 */
export default function CodebaseIntegrationSection() {
  const cards = [
    {
      icon: <Github className="w-6 h-6 text-primary" />,
      iconBg: "bg-primary/10 border-primary/20",
      hoverBorder: "hover:border-primary/40",
      glowColor: "group-hover:bg-primary/5",
      title: "Automatic Repo Sync",
      description:
        "Connect GitHub and we instantly index your components, tokens, and navigation patterns. No manual mapping required.",
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-purple-400" />,
      iconBg: "bg-purple-500/10 border-purple-500/20",
      hoverBorder: "hover:border-purple-500/40",
      glowColor: "group-hover:bg-purple-500/5",
      title: "System-Safe Generation",
      description:
        "Every screen generated strictly respects your design tokens, spacing scales, typography, and existing component props.",
    },
    {
      icon: <GitPullRequest className="w-6 h-6 text-emerald-400" />,
      iconBg: "bg-emerald-500/10 border-emerald-500/20",
      hoverBorder: "hover:border-emerald-500/40",
      glowColor: "group-hover:bg-emerald-500/5",
      title: "Two Shipping Paths",
      description:
        "Ready to go? Copy-paste the clean, system-compliant code or let our agent open a Pull Request directly to your branch.",
    },
  ];

  return (
    <section className="pt-24 pb-12 px-6 bg-background relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-1/2 left-0 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[250px] h-[250px] bg-purple-600/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="text-center mb-16 animate-fade-in-up">
          <Badge
            variant="outline"
            className="mb-4 border-primary/20 bg-primary/10 text-primary"
          >
            System Aware
          </Badge>
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">
            Your design system, automatically.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Nucleate doesn&apos;t just &quot;write code.&quot; It adopts your
            existing primitives to build UI that belongs in your app.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[minmax(200px,auto)]">
          {/* Large featured card - spans 7 columns and 2 rows */}
          <div className="md:col-span-7 md:row-span-2 bg-gradient-to-br from-primary/10 via-card to-card border border-primary/20 rounded-3xl p-8 md:p-10 group hover:border-primary/40 transition-all duration-300 relative overflow-hidden animate-fade-in">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="relative z-10 h-full flex flex-col">
              <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center mb-6 border border-primary/30 transition-transform hover:scale-105">
                <Github className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-2xl md:text-3xl font-medium mb-4">
                {cards[0].title}
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-8 max-w-md">
                {cards[0].description}
              </p>
              {/* Animated file sync visualization - simplified for server */}
              <div className="mt-auto flex items-center gap-6">
                <div className="flex -space-x-2">
                  {[FileCode, FileCode, FileCode].map((Icon, i) => (
                    <div
                      key={i}
                      className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center border border-border animate-pulse"
                      style={{ animationDelay: `${i * 200}ms` }}
                    >
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-px bg-gradient-to-r from-primary to-transparent" />
                  <div className="w-8 h-px bg-gradient-to-r from-primary/60 to-transparent" />
                  <div className="w-8 h-px bg-gradient-to-r from-primary/30 to-transparent" />
                </div>
                <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30 animate-pulse">
                  <Layers className="w-6 h-6 text-primary" />
                </div>
              </div>
            </div>
          </div>

          {/* Top right card - compact */}
          <div className="md:col-span-5 bg-card border border-purple-500/20 rounded-3xl p-6 group hover:border-purple-500/40 transition-all duration-300 relative overflow-hidden animate-fade-in" style={{ animationDelay: '100ms' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20 transition-transform hover:scale-105">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  ))}
                </div>
              </div>
              <h3 className="text-lg font-medium mb-2">{cards[1].title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {cards[1].description}
              </p>
              <div className="flex flex-wrap gap-2">
                {["Button", "Card", "Input", "Modal"].map((token, i) => (
                  <div
                    key={token}
                    className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-sm text-purple-300 font-mono animate-scale-in"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    {token}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom right card - with visual emphasis */}
          <div className="md:col-span-5 bg-card border border-emerald-500/20 rounded-3xl p-6 group hover:border-emerald-500/40 transition-all duration-300 relative overflow-hidden animate-fade-in" style={{ animationDelay: '150ms' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 mb-4 transition-transform hover:scale-105">
                <GitPullRequest className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-lg font-medium mb-2">{cards[2].title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {cards[2].description}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 py-3 bg-accent rounded-xl flex items-center justify-center gap-2 border border-border cursor-pointer hover:bg-accent/80 transition-all hover:scale-105">
                  <Code2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground font-medium">
                    Copy Code
                  </span>
                </div>
                <div className="flex-1 py-3 bg-emerald-500/20 rounded-xl flex items-center justify-center gap-2 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/30 transition-all hover:scale-105">
                  <GitPullRequest className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400 font-medium">
                    Open PR
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Design system visual strip */}
        <div className="mt-6 py-6 px-8 bg-card/50 border border-border rounded-2xl flex flex-wrap items-center justify-center gap-8 md:gap-12 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <div className="w-2 h-2 rounded-full bg-pink-500"></div>
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            </div>
            <span className="text-sm text-muted-foreground">
              Your brand colors
            </span>
          </div>
          <div className="flex gap-2">
            {["Aa", "Bb"].map((text, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium ${i === 0 ? "bg-foreground text-background" : "bg-accent text-foreground border border-border"}`}
              >
                {text}
              </div>
            ))}
            <span className="text-sm text-muted-foreground ml-2">
              Typography
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-3 h-3 bg-accent rounded-sm border border-border" />
              <div className="w-4 h-3 bg-accent rounded-sm border border-border" />
              <div className="w-2 h-3 bg-accent rounded-sm border border-border" />
            </div>
            <span className="text-sm text-muted-foreground">
              Spacing scales
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
