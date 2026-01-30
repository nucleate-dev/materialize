import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design Exploration - Nucleate | See 10 Variants in Minutes",
  description:
    "Explore design options using your real components, not generic mockups. See multiple variants instantly and ship the winner directly to code.",
  keywords: [
    "design exploration",
    "design variants",
    "design system",
    "UI prototyping",
    "component variants",
    "design tools",
    "Figma alternative",
    "design to code",
    "React components",
    "product design",
  ],
  openGraph: {
    title: "Design Exploration - Nucleate",
    description:
      "See 10 variants in minutes, not 1 in a week. Explore design options using your real components.",
    type: "website",
    url: "https://nucleate.dev/use-cases/design-exploration",
    siteName: "Nucleate",
  },
  twitter: {
    card: "summary_large_image",
    title: "Design Exploration - Nucleate",
    description:
      "See 10 variants in minutes, not 1 in a week. Explore design options using your real components.",
  },
  alternates: {
    canonical: "https://nucleate.dev/use-cases/design-exploration",
  },
};

export default function DesignExplorationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
