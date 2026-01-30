import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prototyping & Validation - Test Ideas Faster | Nucleate",
  description:
    "From PRD to prototype in a conversation. Test ideas with users before writing production code. Built for PMs, founders, and researchers.",
  keywords: [
    "prototyping",
    "product validation",
    "user testing",
    "PRD to prototype",
    "product management",
    "rapid prototyping",
    "design validation",
    "user feedback",
    "MVP testing",
  ],
  openGraph: {
    title: "Prototyping & Validation - Test Ideas Faster | Nucleate",
    description:
      "From PRD to prototype in a conversation. Test ideas with users before writing production code.",
    type: "website",
    url: "https://nucleate.dev/use-cases/prototyping",
    siteName: "Nucleate",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prototyping & Validation - Test Ideas Faster | Nucleate",
    description:
      "From PRD to prototype in a conversation. Test ideas with users before writing production code.",
  },
  alternates: {
    canonical: "https://nucleate.dev/use-cases/prototyping",
  },
};

export default function PrototypingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
