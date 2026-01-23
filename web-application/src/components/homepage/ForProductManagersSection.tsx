import { Badge } from "@/components/ui/badge";
import ClickableImage from "./ClickableImage";

/**
 * FOR PRODUCT MANAGERS SECTION - Server Component
 * Benefit-focused messaging for PM persona
 */
export default function ForProductManagersSection() {
  return (
    <section className="py-24 bg-card/30 border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-[1600px] relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-16 items-center">
          {/* Left: Screenshot */}
          <div className="order-2 lg:order-1">
            <ClickableImage
              src="/images/founders-1.png"
              alt="Product manager validating ideas with real prototypes before engineering builds"
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

            <p className="text-lg text-muted-foreground leading-relaxed">
              Generate working prototypes in hours, test with real users, and
              ship what actually works—all before engineering writes a line of
              code.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
