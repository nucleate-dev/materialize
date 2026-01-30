import { Badge } from "@/components/ui/badge";

/**
 * ON-BRAND SECTION
 * Feature section highlighting design system integration
 */
export default function OnBrandSection() {
  return (
    <section className="py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-6xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Content */}
          <div>
            <Badge
              variant="outline"
              className="mb-4 border-primary/30 bg-primary/10 text-primary"
            >
              Always On-Brand
            </Badge>

            <h2 className="text-4xl md:text-5xl font-medium text-foreground mb-6">
              Your design system. Every prototype.
            </h2>

            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Nucleate reads your components and tokens from GitHub. Every
              prototype uses your real Button, Card, and Modal—not generic
              AI-generated ones.
            </p>

            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span>Prototypes that match your brand automatically</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span>No manual styling, no brand drift</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span>Uses your actual React/RN components</span>
              </li>
            </ul>
          </div>

          {/* Right: Illustration */}
          <div className="relative">
            <DesignSystemAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Illustration showing design system → prototype flow
 */
function DesignSystemAnimation() {
  const tokens = [
    { label: "primary", color: "bg-indigo-500" },
    { label: "secondary", color: "bg-slate-500" },
    { label: "accent", color: "bg-emerald-500" },
  ];

  const components = [
    { name: "Button", icon: "□" },
    { name: "Card", icon: "▢" },
    { name: "Modal", icon: "◇" },
    { name: "Input", icon: "▭" },
  ];

  return (
    <div className="relative bg-card rounded-3xl border border-border p-8 shadow-2xl overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />

      <div className="relative z-10 flex gap-8 items-center">
        {/* Design System Panel */}
        <div className="flex-1 space-y-6">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
            Your Design System
          </div>

          {/* Tokens */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium">
              Tokens
            </div>
            <div className="flex gap-2">
              {tokens.map((token) => (
                <div
                  key={token.label}
                  className="flex items-center gap-1.5 px-2 py-1 bg-background rounded border border-border"
                >
                  <div className={`w-3 h-3 rounded ${token.color}`} />
                  <span className="text-xs font-mono text-muted-foreground">
                    {token.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Components */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium">
              Components
            </div>
            <div className="grid grid-cols-2 gap-2">
              {components.map((comp) => (
                <div
                  key={comp.name}
                  className="flex items-center gap-2 px-3 py-2 bg-background rounded border border-border hover:border-primary/30 transition-colors"
                >
                  <span className="text-primary">{comp.icon}</span>
                  <span className="text-xs font-medium text-foreground">
                    {comp.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Flow Arrow */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-0.5 bg-gradient-to-r from-muted-foreground/20 via-primary to-muted-foreground/20" />
          <span className="text-xs text-muted-foreground">Nucleate</span>
        </div>

        {/* Prototype Preview */}
        <div className="flex-1">
          <div className="bg-background rounded-xl border border-border p-4 shadow-lg">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">
              Prototype Preview
            </div>

            {/* Mini app preview */}
            <div className="bg-card rounded-lg border border-border p-3 space-y-3">
              {/* Header bar */}
              <div className="flex items-center justify-between">
                <div className="w-16 h-2 bg-foreground/10 rounded" />
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30" />
              </div>

              {/* Card component using brand colors */}
              <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
                <div className="w-20 h-2 bg-foreground/20 rounded mb-2" />
                <div className="w-full h-1.5 bg-foreground/10 rounded mb-1" />
                <div className="w-3/4 h-1.5 bg-foreground/10 rounded" />
              </div>

              {/* Button using brand colors */}
              <div className="flex gap-2">
                <div className="px-4 py-1.5 bg-indigo-500 rounded text-xs text-white font-medium">
                  Button
                </div>
                <div className="px-4 py-1.5 bg-transparent border border-slate-500/30 rounded text-xs text-muted-foreground">
                  Secondary
                </div>
              </div>
            </div>

            {/* Brand consistency indicator */}
            <div className="mt-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-emerald-500 font-medium">
                On-brand
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
