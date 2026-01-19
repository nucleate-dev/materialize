import {
  FileCode,
  GitPullRequest,
  Search,
  Github,
  GitBranch,
  Code2,
} from "lucide-react";

/**
 * SHIPPING SECTION - Server Component
 * Static content showing how to ship prototypes to production
 */
export default function ShippingSection() {
  const cards = [
    {
      icon: <FileCode className="w-8 h-8 text-primary" />,
      title: "Export Code",
      description:
        "Copy/paste specific components or export entire screens as clean, modular React files.",
      hoverBorder: "hover:border-primary/40",
    },
    {
      icon: <GitPullRequest className="w-8 h-8 text-emerald-400" />,
      title: "Open a PR",
      description:
        "Nucleate creates a PR against your repo following your naming conventions and file structure.",
      hoverBorder: "hover:border-emerald-500/40",
    },
    {
      icon: <Search className="w-8 h-8 text-purple-400" />,
      title: "Reviewable Diffs",
      description:
        'No "black box" code. Small, readable diffs that match your coding style and are easy to iterate on.',
      hoverBorder: "hover:border-purple-500/40",
    },
  ];

  return (
    <section className="py-24 px-6 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 right-0 w-[300px] h-[300px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[250px] h-[250px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Split header layout */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16">
          <div className="max-w-xl animate-fade-in-up">
            <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-4">
              From prototype → PR
            </h2>
            <p className="text-muted-foreground">
              Nucleate isn&apos;t a playground. It&apos;s a delivery tool that
              lives in your engineering workflow.
            </p>
          </div>
          <div className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-full border border-border">
              <Github className="w-4 h-4" />
              <span className="text-sm text-muted-foreground">Git-native</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <GitBranch className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-400">PR Ready</span>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {cards.map((card, index) => (
            <div
              key={card.title}
              className="relative animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Card content */}
              <div
                className={`bg-card border rounded-2xl p-6 transition-all duration-300 h-full hover:-translate-y-2 hover:scale-[1.02] ${
                  index === 0
                    ? "border-primary/20 hover:border-primary/40"
                    : index === 1
                      ? "border-emerald-500/20 hover:border-emerald-500/40"
                      : "border-purple-500/20 hover:border-purple-500/40"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="transition-transform hover:scale-110">
                    {card.icon}
                  </div>
                  <h3 className="text-xl font-bold">{card.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {card.description}
                </p>

                {/* Illustrations */}
                {index === 0 && (
                  <div className="mt-4 bg-background rounded-lg p-3 border border-border font-mono text-sm overflow-hidden">
                    <div className="text-pink-400">
                      export default
                    </div>
                    <div className="text-blue-400">
                      function Button()
                    </div>
                    <div className="text-muted-foreground pl-2">
                      {"// Clean code..."}
                    </div>
                  </div>
                )}

                {index === 1 && (
                  <div className="mt-4 bg-background rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-sm text-emerald-400 font-medium">Open</span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      feat: Add onboarding flow
                    </div>
                    <div className="px-2 py-1 bg-emerald-500/20 rounded text-xs text-emerald-400 w-fit animate-scale-in" style={{ animationDelay: '300ms' }}>
                      Ready to merge
                    </div>
                  </div>
                )}

                {index === 2 && (
                  <div className="mt-4 bg-background rounded-lg p-2 border border-border space-y-1">
                    {[
                      {
                        color: "bg-emerald-500/20 text-emerald-400",
                        text: '+ <Button variant="primary" />',
                      },
                      {
                        color: "bg-red-500/20 text-red-400",
                        text: '- <button className="btn" />',
                      },
                    ].map((line, i) => (
                      <div
                        key={i}
                        className={`text-xs font-mono px-2 py-1 rounded ${line.color} opacity-0 animate-fade-in`}
                        style={{ animationDelay: `${(i + 1) * 150}ms` }}
                      >
                        {line.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA strip */}
        <div className="mt-20 bg-gradient-to-r from-card via-card to-emerald-500/10 border border-border rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <GitPullRequest className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium mb-1">
                Ship to your repo in seconds
              </h3>
              <p className="text-sm text-muted-foreground">
                Design and engineering work in the same source of truth: Git.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 rounded-full text-white font-medium text-sm cursor-pointer hover:bg-emerald-600 transition-all hover:scale-105">
              <GitPullRequest className="w-4 h-4" />
              Open PR
            </div>
            <div className="text-muted-foreground text-sm">or</div>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-accent rounded-full border border-border text-sm font-medium cursor-pointer hover:bg-accent/80 transition-all hover:scale-105">
              <Code2 className="w-4 h-4" />
              Copy Code
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
