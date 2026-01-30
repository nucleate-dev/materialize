import type { Metadata } from "next";
import LandingPagesContent from "./LandingPagesContent";

/**
 * SEO Metadata for Landing Pages use case page
 */
export const metadata: Metadata = {
  title: "Landing Pages - Launch Marketing Pages Without Waiting for Dev | Nucleate",
  description:
    "Create on-brand landing pages in minutes, not sprints. Product launches, feature announcements, event registration, and more. No engineering required.",
  keywords: [
    "landing page builder",
    "marketing pages",
    "no-code landing pages",
    "product launch page",
    "event registration page",
    "AI landing page generator",
    "marketing automation",
    "conversion optimization",
  ],
  openGraph: {
    title: "Landing Pages - Launch Without Waiting for Dev",
    description: "Create on-brand marketing pages in minutes with Nucleate",
    type: "website",
    url: "https://nucleate.dev/use-cases/landing-pages",
    siteName: "Nucleate",
  },
  twitter: {
    card: "summary_large_image",
    title: "Landing Pages - Launch Without Waiting for Dev",
    description: "Create on-brand marketing pages in minutes with Nucleate",
  },
  alternates: {
    canonical: "https://nucleate.dev/use-cases/landing-pages",
  },
};

/**
 * Landing Pages Use Case Page
 * Server component wrapper for SEO metadata
 */
export default function LandingPagesPage() {
  return <LandingPagesContent />;
}
