/**
 * DIFFERENTIATION SECTION - Server Component
 * Static comparison table showing why Nucleate is different
 */
export default function DifferentiationSection() {
  return (
    <section className="py-24 bg-background border-t border-border">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-16 animate-fade-in-up">
          <h2 className="text-3xl font-medium text-foreground mb-4">
            Why Nucleate?
          </h2>
          <p className="text-muted-foreground">
            Prototyping that lives in the codebase.
          </p>
        </div>

        <div className="overflow-x-auto animate-fade-in" style={{ animationDelay: '200ms' }}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
                  Feature
                </th>
                <th className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
                  Figma
                </th>
                <th className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
                  AI Builders
                </th>
                <th className="p-4 text-xs uppercase tracking-wider text-primary font-bold border-b border-primary/50 bg-primary/5 rounded-t-xl relative">
                  <span className="relative z-10">Nucleate</span>
                  <div className="absolute inset-0 bg-primary/10 blur-sm rounded-t-xl" />
                </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-border">
                <td className="p-4 text-foreground font-medium">
                  Uses your components
                </td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-foreground font-semibold bg-primary/5">
                  Yes (Automatic)
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="p-4 text-foreground font-medium">
                  Enforces design tokens
                </td>
                <td className="p-4 text-muted-foreground">Manual</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-foreground font-semibold bg-primary/5">
                  Strictly Enforced
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="p-4 text-foreground font-medium">
                  Works on existing codebase
                </td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-foreground font-semibold bg-primary/5">
                  Yes
                </td>
              </tr>
              <tr>
                <td className="p-4 text-foreground font-medium">PR to repo</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-muted-foreground">No</td>
                <td className="p-4 text-foreground font-semibold bg-primary/5 rounded-b-xl">
                  Direct GitHub PR
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
