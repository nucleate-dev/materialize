import type { Metadata } from "next";
import { ReactNode } from "react";

/**
 * SEO metadata for the Vibe Coding use case page
 */
export const metadata: Metadata = {
  title: "Vibe Coding - Build Apps with AI | Nucleate",
  description:
    "From vibes to code in one conversation. Build apps the way you think about them - describe, see, refine, ship. Real development environment with full file access.",
  keywords: [
    "vibe coding",
    "AI coding",
    "AI development",
    "code generation",
    "React Native",
    "Next.js",
    "Expo",
    "MCP integration",
    "Claude Code",
  ],
  openGraph: {
    title: "Vibe Coding - Build Apps with AI | Nucleate",
    description:
      "From vibes to code in one conversation. Build apps the way you think about them.",
    type: "website",
    url: "https://nucleate.dev/use-cases/vibe-coding",
    siteName: "Nucleate",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vibe Coding - Build Apps with AI | Nucleate",
    description:
      "From vibes to code in one conversation. Build apps the way you think about them.",
  },
  alternates: {
    canonical: "https://nucleate.dev/use-cases/vibe-coding",
  },
};

export default function VibeCodingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
