import { Megaphone, ClipboardList, Palette, Lightbulb } from "lucide-react";

/**
 * USE CASES STRIP
 * Compact horizontal strip showing use cases for different personas
 */
export default function UseCasesStrip() {
  const useCases = [
    {
      icon: <Megaphone className="w-5 h-5" />,
      persona: "Marketers",
      description: "Launch on-brand landing pages without waiting for dev",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    {
      icon: <ClipboardList className="w-5 h-5" />,
      persona: "Product Managers",
      description: "Test interactive prototypes with real users",
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    },
    {
      icon: <Palette className="w-5 h-5" />,
      persona: "Designers",
      description: "Explore component variants in minutes, not days",
      color: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    },
    {
      icon: <Lightbulb className="w-5 h-5" />,
      persona: "Founders",
      description: "Validate product ideas before building",
      color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    },
  ];

  return (
    <section className="py-16 bg-card/30 border-t border-border">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-10">
          <h3 className="text-lg font-medium text-muted-foreground">
            Built for your whole team
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {useCases.map((useCase) => (
            <div
              key={useCase.persona}
              className="bg-card rounded-xl border border-border p-5 hover:border-border/80 hover:-translate-y-1 transition-all"
            >
              <div
                className={`w-10 h-10 rounded-lg ${useCase.color} border flex items-center justify-center mb-4`}
              >
                {useCase.icon}
              </div>
              <h4 className="text-sm font-semibold text-foreground mb-2">
                {useCase.persona}
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {useCase.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
