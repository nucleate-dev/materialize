import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Internal Tools - Build Admin Panels Without Engineering | Nucleate",
  description:
    "Ship internal tools without the engineering queue. Build customer dashboards, order management admins, analytics panels, and more in hours, not months.",
  keywords: [
    "internal tools",
    "admin panel builder",
    "no-code admin",
    "operations dashboard",
    "internal dashboard",
    "business tools",
    "back-office tools",
    "admin console",
    "custom internal tools",
    "low-code platform",
  ],
  openGraph: {
    title: "Internal Tools - Build Admin Panels Without Engineering",
    description:
      "Ship internal tools without the engineering queue. Build what your team needs in hours, not months.",
    type: "website",
    url: "https://nucleate.dev/use-cases/internal-tools",
    siteName: "Nucleate",
  },
  twitter: {
    card: "summary_large_image",
    title: "Internal Tools - Build Admin Panels Without Engineering",
    description:
      "Ship internal tools without the engineering queue. Build what your team needs in hours, not months.",
  },
  alternates: {
    canonical: "https://nucleate.dev/use-cases/internal-tools",
  },
};

export default function InternalToolsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
