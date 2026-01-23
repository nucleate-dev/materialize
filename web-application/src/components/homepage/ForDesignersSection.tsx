import { Badge } from "@/components/ui/badge";
import { Sparkles, Palette, GitPullRequest, Users } from "lucide-react";
import ClickableImage from "./ClickableImage";

/**
 * FOR DESIGNERS SECTION - Server Component
 * Benefit-focused messaging for designer persona
 */
export default function ForDesignersSection() {
  const benefits = [
    {
      icon: <Sparkles className="w-5 h-5" />,
      text: "Explore 10+ variants in the time Figma takes for one",
    },
    {
      icon: <Palette className="w-5 h-5" />,
      text: "Automatic design system compliance—uses only your existing components",
    },
    {
      icon: <GitPullRequest className="w-5 h-5" />,
      text: "Ship PRs yourself—no dev handoff, no \"lost in translation\"",
    },
    {
      icon: <Users className="w-5 h-5" />,
      text: "Share working prototypes with stakeholders and users, not clickthrough mocks",
    },
  ];

  return (
    <section className="py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-[1600px] relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-16 items-center">
          {/* Left: Benefits */}
          <div>
            <Badge
              variant="outline"
              className="mb-4 border-primary/30 bg-primary/10 text-primary"
            >
              For Designers
            </Badge>

            <h2 className="text-4xl md:text-5xl font-medium text-foreground mb-6">
              Design and ship. Same day.
            </h2>

            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              Stop waiting for engineering to build what you already designed.
              Nucleate generates production-ready UIs using your components, so
              you can iterate fast and ship yourself.
            </p>

            <div className="space-y-6">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 animate-fade-in-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    {benefit.icon}
                  </div>
                  <p className="text-foreground text-base pt-1.5">
                    {benefit.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Screenshot */}
          <ClickableImage
            src="/images/nucleate-variants-screenshot.png"
            alt="Designer workflow showing AI generating multiple design variants with chat interface and live preview"
            width={2400}
            height={1800}
            hoverColor="primary"
          />
        </div>
      </div>
    </section>
  );
}
