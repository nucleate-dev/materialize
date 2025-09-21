import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CSPostHogProvider } from "./providers";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Materialize - Speed of Thought Prototyping",
  description:
    "Materialize helps you prototype your ideas, workshop new designs, and build out high-quality user flows at the speed of thought.",
  keywords: [
    "prototyping",
    "design",
    "UX",
    "React",
    "React Native",
    "user flows",
    "canvas",
  ],
  authors: [{ name: "Materialize" }],
  openGraph: {
    title: "Materialize - Speed of Thought Prototyping",
    description:
      "Prototype your ideas, workshop new designs, and build high-quality user flows at the speed of thought.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Materialize - Speed of Thought Prototyping",
    description:
      "Prototype your ideas, workshop new designs, and build high-quality user flows at the speed of thought.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <CSPostHogProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            storageKey="materialize-theme"
          >
            {children}
          </ThemeProvider>
        </CSPostHogProvider>
      </body>
    </html>
  );
}
