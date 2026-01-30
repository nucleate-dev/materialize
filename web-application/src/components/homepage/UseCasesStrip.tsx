"use client";

import { useState } from "react";
import { Megaphone, ClipboardList, Palette, Lightbulb, ChevronDown } from "lucide-react";
import { MarketerDemo, PMDemo, DesignerDemo, FounderDemo } from "./use-case-demos";

type Persona = "Marketers" | "Product Managers" | "Designers" | "Founders";

/**
 * USE CASES STRIP
 * Interactive section showing use cases for different personas with expandable demos
 */
export default function UseCasesStrip() {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>("Founders");

  const useCases: {
    icon: React.ReactNode;
    persona: Persona;
    description: string;
    color: string;
    activeColor: string;
  }[] = [
    {
      icon: <Lightbulb className="w-5 h-5" />,
      persona: "Founders",
      description: "Validate product ideas before building",
      color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      activeColor: "border-yellow-500/60 bg-yellow-500/5",
    },
    {
      icon: <Megaphone className="w-5 h-5" />,
      persona: "Marketers",
      description: "Launch on-brand landing pages without waiting for dev",
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
      activeColor: "border-orange-500/60 bg-orange-500/5",
    },
    {
      icon: <ClipboardList className="w-5 h-5" />,
      persona: "Product Managers",
      description: "Test interactive prototypes with real users",
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      activeColor: "border-blue-500/60 bg-blue-500/5",
    },
    {
      icon: <Palette className="w-5 h-5" />,
      persona: "Designers",
      description: "Explore component variants in minutes, not days",
      color: "bg-pink-500/10 text-pink-400 border-pink-500/20",
      activeColor: "border-pink-500/60 bg-pink-500/5",
    },
  ];

  const handleCardClick = (persona: Persona) => {
    setSelectedPersona(selectedPersona === persona ? null : persona);
  };

  const renderDemo = () => {
    switch (selectedPersona) {
      case "Marketers":
        return <MarketerDemo />;
      case "Product Managers":
        return <PMDemo />;
      case "Designers":
        return <DesignerDemo />;
      case "Founders":
        return <FounderDemo />;
      default:
        return null;
    }
  };

  return (
    <section className="py-16 bg-card/30 border-t border-border">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-medium text-foreground mb-4">
            Built for your whole team
          </h2>
          <p className="text-muted-foreground">
            Click any role to see it in action
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {useCases.map((useCase) => {
            const isSelected = selectedPersona === useCase.persona;
            return (
              <button
                key={useCase.persona}
                onClick={() => handleCardClick(useCase.persona)}
                className={`text-left bg-card rounded-xl border p-5 transition-all duration-300 cursor-pointer group ${
                  isSelected
                    ? useCase.activeColor
                    : "border-border hover:border-border/80 hover:-translate-y-1"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`w-10 h-10 rounded-lg ${useCase.color} border flex items-center justify-center mb-4`}
                  >
                    {useCase.icon}
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${
                      isSelected ? "rotate-180" : "opacity-0 group-hover:opacity-100"
                    }`}
                  />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  {useCase.persona}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {useCase.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Expandable demo panel */}
        <div
          className={`grid transition-all duration-500 ease-in-out ${
            selectedPersona ? "grid-rows-[1fr] opacity-100 mt-6" : "grid-rows-[0fr] opacity-0 mt-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="bg-card/50 border border-border rounded-2xl p-8 backdrop-blur-sm">
              {renderDemo()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
