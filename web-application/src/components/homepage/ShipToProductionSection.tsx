import { Badge } from "@/components/ui/badge";
import { GitPullRequest, Check, Code2, Plug } from "lucide-react";

/**
 * SHIP TO PRODUCTION SECTION
 * Feature section highlighting shipping code to production
 */
export default function ShipToProductionSection() {
  return (
    <section className="py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-6xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Content */}
          <div>
            <Badge
              variant="outline"
              className="mb-4 border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            >
              Ship Ready
            </Badge>

            <h2 className="text-4xl md:text-5xl font-medium text-foreground mb-6">
              From prototype to production in one click.
            </h2>

            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              These aren&apos;t throwaway mockups. Export clean code or open a
              PR directly to your repo. No handoff, no rebuild.
            </p>

            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Export production-ready code</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Open PRs directly to your repo</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>MCP integration with Claude Code, Cursor, and more</span>
              </li>
            </ul>
          </div>

          {/* Right: Illustration */}
          <div className="relative">
            <ShipAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Illustration showing prototype → PR flow
 */
function ShipAnimation() {
  return (
    <div className="relative bg-card rounded-3xl border border-border p-8 shadow-2xl overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />

      <div className="relative z-10 space-y-6">
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          Ship to Production
        </div>

        {/* Prototype Preview */}
        <div className="bg-background rounded-xl border border-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
            <div className="flex-1 h-5 bg-muted rounded mx-4" />
          </div>

          {/* Mini prototype */}
          <div className="bg-card rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary/20" />
              <div className="w-24 h-2 bg-foreground/10 rounded" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-muted/50 rounded border border-border"
                />
              ))}
            </div>
            <div className="w-full h-8 bg-primary rounded" />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-400 font-medium">
              Ready to ship
            </span>
          </div>
        </div>

        {/* Arrow down */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className="w-0.5 h-8 bg-gradient-to-b from-muted-foreground/20 via-emerald-500 to-muted-foreground/20" />
          </div>
        </div>

        {/* Code + PR + MCP options */}
        <div className="grid grid-cols-3 gap-3">
          {/* Code Export */}
          <div className="bg-background rounded-xl border border-border p-3 hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Code2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-foreground">
                Export Code
              </span>
            </div>
            <div className="bg-card rounded-lg p-2 font-mono text-[10px] space-y-0.5">
              <div className="text-pink-400">export default</div>
              <div className="text-blue-400">function Button()</div>
              <div className="text-muted-foreground pl-2">{"// ..."}</div>
            </div>
          </div>

          {/* GitHub PR */}
          <div className="bg-background rounded-xl border border-emerald-500/30 p-3 hover:border-emerald-500/50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequest className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-foreground">
                Open PR
              </span>
            </div>
            <div className="bg-card rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-emerald-400">Open</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                feat: Add pricing page
              </div>
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 rounded w-fit">
                <Check className="w-2.5 h-2.5 text-emerald-400" />
                <span className="text-[10px] text-emerald-400">Ready</span>
              </div>
            </div>
          </div>

          {/* MCP Integration */}
          <div className="bg-background rounded-xl border border-purple-500/30 p-3 hover:border-purple-500/50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Plug className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-foreground">
                Nucleate MCP
              </span>
            </div>
            <div className="bg-card rounded-lg p-2 space-y-1.5">
              <div className="text-[10px] text-muted-foreground">
                Integrate with:
              </div>
              <div className="flex flex-wrap gap-1">
                {["Claude Code", "Cursor", "Codex"].map((tool) => (
                  <span
                    key={tool}
                    className="text-[9px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
