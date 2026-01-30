import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Demos - Personalized Demo Environments | Nucleate",
  description:
    "Create personalized demo environments that match your prospect. Always up-to-date, always on-brand, always customized for each deal.",
  keywords: [
    "sales demos",
    "demo environment",
    "personalized demos",
    "sales enablement",
    "customer demos",
    "prospect customization",
    "sales engineering",
    "demo automation",
  ],
  openGraph: {
    title: "Customer Demos - Personalized Demo Environments | Nucleate",
    description:
      "Create personalized demo environments that match your prospect. Always up-to-date, always on-brand.",
    type: "website",
    url: "https://nucleate.dev/use-cases/customer-demos",
    siteName: "Nucleate",
  },
  twitter: {
    card: "summary_large_image",
    title: "Customer Demos - Personalized Demo Environments | Nucleate",
    description:
      "Create personalized demo environments that match your prospect. Always up-to-date, always on-brand.",
  },
  alternates: {
    canonical: "https://nucleate.dev/use-cases/customer-demos",
  },
};

export default function CustomerDemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
