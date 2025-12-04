import { MetaPixelPageView } from "@/components/MetaPixelPageView";
import { ThemeProvider } from "@/components/theme-provider";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { CSPostHogProvider, QueryProvider } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sanara - Speed of Thought Prototyping",
  description:
    "Sanara helps you prototype your ideas, workshop new designs, and build out high-quality user flows.",
  keywords: [
    "prototyping",
    "design",
    "UX",
    "React",
    "React Native",
    "user flows",
    "canvas",
  ],
  authors: [{ name: "Sanara" }],
  openGraph: {
    title: "Sanara - Speed of Thought Prototyping",
    description:
      "Sanara helps you prototype your ideas, workshop new designs, and build high-quality user flows.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sanara - Speed of Thought Prototyping",
    description:
      "Sanara helps you prototype your ideas, workshop new designs, and build high-quality user flows.",
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
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-LCBNQDDQWB"
          strategy="afterInteractive"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-LCBNQDDQWB');
            `,
          }}
        />

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
          <QueryProvider>
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
          </QueryProvider>
        </CSPostHogProvider>
      </body>
    </html>
  );
}
