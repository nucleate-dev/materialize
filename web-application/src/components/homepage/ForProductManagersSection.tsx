import { Badge } from "@/components/ui/badge";
import { BarChart3, Zap, DollarSign, Rocket } from "lucide-react";
import ClickableImage from "./ClickableImage";

/**
 * FOR PRODUCT MANAGERS SECTION - Server Component
 * Benefit-focused messaging for PM persona
 */
export default function ForProductManagersSection() {
  const benefits = [
    {
      icon: <BarChart3 className="w-5 h-5" />,
      text: "Validate before you commit engineering to 3-week sprints",
    },
    {
      icon: <Zap className="w-5 h-5" />,
      text: "Test 5 concepts with users this week, not next quarter",
    },
    {
      icon: <DollarSign className="w-5 h-5" />,
      text: "Stop wasting sprints on features users will hate",
    },
    {
      icon: <Rocket className="w-5 h-5" />,
      text: "Ship winning prototypes as PRs—no rework, instant velocity",
    },
  ];

  return (
    <section className="py-24 bg-card/30 border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-[1600px] relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-16 items-center">
          {/* Left: Screenshot */}
          <div className="order-2 lg:order-1">
            <ClickableImage
              src="/images/nucleate-product-manager-pricing.png"
              alt="Product manager validating pricing and monetization strategies with real prototypes before engineering builds"
              width={2400}
              height={1800}
              hoverColor="purple"
            />
          </div>

          {/* Right: Benefits */}
          <div className="order-1 lg:order-2">
            <Badge
              variant="outline"
              className="mb-4 border-purple-500/30 bg-purple-500/10 text-purple-400"
            >
              For Product Managers
            </Badge>

            <h2 className="text-4xl md:text-5xl font-medium text-foreground mb-6">
              Test ideas before you build them.
            </h2>

            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              Stop guessing what users want. Generate working prototypes in
              hours, test with real users, and ship what actually works—all
              before engineering writes a line of code.
            </p>

            <div className="space-y-6">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 animate-fade-in-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    {benefit.icon}
                  </div>
                  <p className="text-foreground text-base pt-1.5">
                    {benefit.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
