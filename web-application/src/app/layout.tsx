import { ThemeProvider } from "@/components/theme-provider";
import { MetaPixelPageView } from "@/components/MetaPixelPageView";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { CSPostHogProvider } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Materialize - Speed of Thought Prototyping",
  description:
    "Materialize helps you prototype your ideas, workshop new designs, and build out high-quality user flows.",
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
      "Prototype your ideas, workshop new designs, and build high-quality user flows.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Materialize - Speed of Thought Prototyping",
    description:
      "Prototype your ideas, workshop new designs, and build high-quality user flows.",
  },
  verification: {
    other: {
      "facebook-domain-verification": "hjdft2s0b3rcq8d68yhpav4ppl9mrv",
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Meta Pixel Code */}
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '3308658512608818');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=3308658512608818&ev=PageView&noscript=1"
          />
        </noscript>
      </head>
      <body className={inter.className}>
        <CSPostHogProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            storageKey="materialize-theme"
          >
            <MetaPixelPageView />
            {children}
          </ThemeProvider>
        </CSPostHogProvider>
      </body>
    </html>
  );
}
