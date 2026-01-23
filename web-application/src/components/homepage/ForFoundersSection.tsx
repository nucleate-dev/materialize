import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target, DollarSign, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/**
 * FOR FOUNDERS SECTION - Server Component
 * Benefit-focused messaging for founder/business leader persona
 */
export default function ForFoundersSection() {
  const benefits = [
    {
      icon: <TrendingUp className="w-5 h-5" />,
      text: "Ship MVPs in days and capture market opportunities before competitors",
    },
    {
      icon: <DollarSign className="w-5 h-5" />,
      text: "Extend runway by 3-6 months—validate ideas without scaling your team",
    },
    {
      icon: <Target className="w-5 h-5" />,
      text: "Test product-market fit with real users before committing serious capital",
    },
    {
      icon: <Users className="w-5 h-5" />,
      text: "Make data-driven pivots in days, not quarters—stay nimble as you scale",
    },
  ];

  return (
    <section className="py-24 bg-background border-t border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-6 max-w-[1600px] relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-16 items-center">
          {/* Left: Benefits */}
          <div>
            <Badge
              variant="outline"
              className="mb-4 border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            >
              For Founders
            </Badge>

            <h2 className="text-4xl md:text-5xl font-medium text-foreground mb-6">
              Move faster. Burn less. Win.
            </h2>

            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              Every week spent building the wrong thing costs you runway and
              competitive advantage. Nucleate lets you validate with users
              before you scale—so you only build what wins.
            </p>

            <div className="space-y-6">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 animate-fade-in-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
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
          <div className="relative">
            <Link
              href="https://www.nucleate.dev/p/2f7b405b-b48c-4cd1-a186-62407593b9e5"
              target="_blank"
              rel="noopener noreferrer"
              className="relative group cursor-pointer block"
            >
              <div className="rounded-2xl border-2 border-border overflow-hidden bg-card shadow-2xl hover:shadow-emerald-500/20 hover:border-emerald-500/50 transition-all duration-300">
                <Image
                  src="/images/founders-1.png"
                  alt="Founder dashboard showing multiple projects and rapid iteration demonstrating speed and capital efficiency"
                  width={2400}
                  height={1800}
                  className="w-full h-auto"
                />
              </div>
              <div className="absolute bottom-4 right-4 bg-black/80 text-white text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                Click to view live demo
              </div>
            </Link>

            {/* Hand-drawn arrow annotation */}
            <div className="absolute -left-32 top-[15%] hidden xl:flex items-center gap-3 animate-bounce-slow">
              <span className="text-2xl font-handwritten text-emerald-400 whitespace-nowrap animate-pulse font-bold">
                Click me!
              </span>
              <svg
                width="100"
                height="80"
                viewBox="0 0 100 80"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-emerald-400 -mr-8"
              >
                {/* Hand-drawn curved arrow pointing right */}
                <path
                  d="M10 40 Q30 25, 50 35 T80 40"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                {/* Arrow head pointing right into image */}
                <path
                  d="M75 35 L85 40 L75 45 L78 40 Z"
                  fill="currentColor"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
