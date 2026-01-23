import { Badge } from "@/components/ui/badge";
import ClickableImage from "./ClickableImage";

/**
 * FOR DESIGNERS SECTION - Server Component
 * Benefit-focused messaging for designer persona
 */
export default function ForDesignersSection() {
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

            <p className="text-lg text-muted-foreground leading-relaxed">
              Nucleate generates production-ready UIs using your components, so
              you can explore variants fast and ship yourself.
            </p>
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
