import { Badge } from "@/components/ui/badge";
import HeroInput from "./HeroInput";

/**
 * HERO SECTION - Server Component
 * Renders static content and includes interactive Client Component
 */
export default function HeroSection() {
  return (
    <section className="relative min-h-[85vh] flex flex-col justify-center px-6 pt-20 pb-12 overflow-hidden">
      {/* Static gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-40" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-primary/15 rounded-full blur-[100px] pointer-events-none opacity-30" />

      <div className="container mx-auto max-w-5xl w-full text-center relative z-10">
        <Badge
          variant="outline"
          className="mb-6 border-primary/30 bg-primary/10 text-primary px-4 py-1"
        >
          Prototyping for Production Teams
        </Badge>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-foreground mb-6">
          Ship on-brand prototypes in minutes
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
          Create production-ready web and mobile prototypes using your design
          system. Explore variants instantly. No engineering required.
        </p>

        <HeroInput />
      </div>
    </section>
  );
}