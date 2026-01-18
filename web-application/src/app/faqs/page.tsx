"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import { GridBackground } from "@/components/shared/GridComponent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// --- FAQ DATA ---
const FAQ_DATA = [
  {
    category: "General",
    items: [
      {
        q: "How does Nucleate work?",
        a: "Describe your app idea in plain English and Nucleate generates a working app using React Native and Expo. You can test it instantly on your phone by downloading the Nucleate app for iOS or Expo Go app for Android and scanning the QR code, or view it in your browser. The browser preview is a great way to quickly see how your app feels, but the details may vary and not all native features are available in the browser.",
      },
      {
        q: "Do I need coding experience to make my mobile app?",
        a: "Nucleate makes a working prototype in minutes just from plain English descriptions. If you want to make a complex mobile app with authentication, database, payments, push notifications, etc. – you'll currently need engineering help at some point or spend time researching how to implement these features.",
      },
      {
        q: "What types of apps can I build?",
        a: "Nucleate makes a beautiful v1 of your app, allows you to prototype any number of screens, and easily build AI-powered applications like Chat, Voice Transcription, or Image Generation. Nucleate apps also store data on the device and integrate with any third-party APIs. However, integrating features like database, authentication, notifications, and payments will take more time to figure out or will require engineering help. We are working on making it super easy for non-technical people to build complex apps.",
      },
      {
        q: "Can I use Nucleate for professional purposes? E.g. for my work or my business?",
        a: "Yes, you can use Nucleate for professional purposes.",
      },
    ],
  },
  {
    category: "Technical",
    items: [
      {
        q: "Are Nucleate apps actually native iOS/Android apps? Or is it just web apps?",
        a: "Yes, Nucleate apps are fully native apps built with React Native and powered by Expo, the #1 cross-platform framework that powers Discord, Shopify, Coinbase, Instagram, and nearly 30% of top 100 apps on the App Store. They work on both iOS and Android devices, but often can also be exported to web. It is a common misconception that native apps can only be built in Swift or Kotlin and require expensive development. React Native is a great way to build native apps with TypeScript that covers more than 95% of the native features, and allows you to write Swift/Kotlin native code later if needed.",
      },
      {
        q: "Can I use Nucleate to build production-ready apps?",
        a: "Our team is focused on building the best support for native mobile apps. Nucleate is a great way to build production-ready apps. Nucleate starts with a working prototype built in a production-ready tech stack used by Discord, Shopify, Coinbase, Instagram, and nearly 30% of top 100 apps on the App Store. Nucleate can complete lots of simple apps and publish them to App Store or Google Play. If you hit a wall at some point, you can always sync with GitHub and find engineers on Upwork/Fiverr to finish complex features for your app.",
      },
      {
        q: "Does it work on iOS and Android?",
        a: "Yes! Nucleate builds cross-platform apps that work on both iOS and Android devices.",
      },
      {
        q: "Can I use Nucleate to build a web app?",
        a: "Nucleate apps also work on the web, but we do not offer a hosting service for them. You can download your Nucleate app code and host it on Expo, Vercel or Netlify. Here's a guide from Expo to host your app on the web: https://docs.expo.dev/guides/publishing-websites/",
      },
    ],
  },
  {
    category: "Integrations",
    items: [
      {
        q: "Can I integrate Nucleate with a database like Supabase or Firebase?",
        a: "Yes, you can ask Nucleate to integrate with Supabase or Firebase, but we do not offer an easy way to do this yet, so you'll need to spend time with it. Note that if you want Supabase/Firebase Auth or Firebase Push Notifications, you'll need to use external guidance/tutorials to implement them.",
      },
      {
        q: "How can I build apps that use AI features like chat, voice transcription, or image generation?",
        a: "Nucleate easily integrates with OpenAI API. We are committed to hosting the AI for you on paid plans and you do not need to struggle with API keys. You can simply ask Nucleate to build an app that uses AI chat, voice transcription, or image generation. If you want to use OpenAI API directly, you can export the code and ask Cursor to use your own OpenAI API key.",
      },
      {
        q: "Can I integrate Nucleate with my business tools like Google Sheets, Airtable, Notion, or my own API?",
        a: "Yes, you can integrate Nucleate with your business tools like Google Sheets, Airtable, Notion, or your own API. Just ask Nucleate to integrate with the service you want. It will ask for an API key. It's recommended you send it the link to the API documentation.",
      },
      {
        q: "Can I import Figma files into Nucleate?",
        a: "You can use Figma designs by copying your Figma app screen frames as an image and copy-pasting them into the Nucleate AI chat input. Also, you can bulk export all of your Figma screens as images and drag-and-drop all of them into the Nucleate AI chat input. We're working on a better way to import Figma designs into Nucleate.",
      },
      {
        q: "How can I add payments into my app with Stripe, RevenueCat, Superwall or Adapty?",
        a: "Right now we do not offer native payments integration, but you can export the code and use Cursor to add payments to your app, or find an engineer on Fiverr/Upwork to help you with it. We recommend using RevenueCat for in-app purchases and subscriptions since they integrate with native payment systems of App Store and Google Play, and also support Stripe for web. You will need to make a custom Expo Development Build to integrate with RevenueCat. You can export the code, setup Expo EAS CLI, and follow the official Expo guide on how to setup payments with RevenueCat.",
      },
      {
        q: "How can I add authentication into my app?",
        a: "First, make sure you really need authentication, because most mobile apps on the App Store do not have authentication as most of user data can be stored on the mobile device itself. If you really do need authentication (e.g. your app is a social media app, needs cloud sync or collaboration), we recommend integrating email/password or magic link authentication with Supabase Auth. Just ask Nucleate to integrate it. If you want to use Social Login (Google, Apple, etc.), you will need to make a custom Expo Development Build and it's only possible with external guidance.",
      },
      {
        q: "How can I add push notifications into my app?",
        a: "First, make sure you really need push notifications, because Nucleate supports in-app local notifications out-of-the-box. If you do, we recommend integrating with Firebase Cloud Messaging. You can export the code and use Cursor to guide you through the setup, or find an engineer on Fiverr/Upwork to help you with it.",
      },
    ],
  },
  // {
  //     category: "Publishing",
  //     items: [
  //         {
  //             q: "What is App Preview? Can I share my mobile app with friends/colleagues without TestFlight?",
  //             a: "App Preview is a feature that allows you to share your app with friends or colleagues in minutes, before it's published to App Store. It's a great way to get feedback and test your app before it's released. You can publish your app to App Preview and share the `.Nucleate.app` link that is generated for your app. Your friend will need to install the Nucleate iOS app or Expo Go to open the shared app. They can also scan the QR code if they opened the link on their desktop."
  //         },
  //         {
  //             q: "How can I publish to App Store or TestFlight?",
  //             a: "First, make sure you really need to publish to App Store or TestFlight, because App Preview is a great way to use or share your app and can be good to publish the app for every day use. If you do, Nucleate has an easy App Store publishing feature – just click Publish and follow the instructions. You'll need to have an Apple Developer Account and Expo account (you'll need a subscription if you use it too much)."
  //         },
  //         {
  //             q: "How can I publish to Google Play? Or download an .apk file?",
  //             a: "First, make sure you really need to publish to Google Play, because App Preview is a great way to use or share your app every day. If you do, right now Nucleate does not have a native Google Play publishing feature, but it's coming! You can download your Nucleate app code via GitHub integration, create an Expo account and publish your app via Expo Application Services (EAS)."
  //         },
  //         {
  //             q: "How can I publish to web?",
  //             a: "Nucleate apps also work on the web, but we do not offer a hosting service for them. You can download your Nucleate app code and host it on Expo, Vercel or Netlify."
  //         }
  //     ]
  // },
  {
    category: "Code Export",
    items: [
      {
        q: "Can I export the code?",
        a: "Yes, you own all generated code, but only on paid plans.",
      },
      {
        q: "How can I export the code?",
        a: "You should subscribe to a paid plan to export the code and then you can download it from the Code Editor view.",
      },
      // {
      //     q: "How can I make changes locally and import them back to Nucleate?",
      //     a: "You should use Nucleate's GitHub integration to sync your code with GitHub. It is a two-way sync, so you can make changes locally and import them back to Nucleate."
      // }
    ],
  },
  {
    category: "Collaboration",
    items: [
      {
        q: "Can I collaborate with others?",
        a: "We do not have a team collaboration feature yet, but you can invite engineers through GitHub integration to help you with your Nucleate project.",
      },
    ],
  },
  {
    category: "Billing",
    items: [
      {
        q: "How much does it cost?",
        a: "We offer a free tier and a simple Nucleate Plus plan ($25 per month). If you hit your credit limits on the plan, you can purchase credit packs to use Nucleate as much as you need.",
      },
      {
        q: "I hit my credit limit, what should I do?",
        a: "You can purchase credits on the Account page. There are various options and price points available for credit packs.",
      },
    ],
  },
  // {
  //     category: "Support",
  //     items: [
  //         {
  //             q: "Do you have priority support?",
  //             a: "Our enterprise plans have priority support. You can email us and we will respond as soon as we can."
  //         },
  //         {
  //             q: "Nucleate broke my app, what should I do? Can I revert to a previous version?",
  //             a: "Yes, Nucleate has a 'Restore' feature that allows you to revert to a previous version of the app. If you're unsure which version to restore, you can press on the version card to preview the version before restoring it."
  //         },
  //         {
  //             q: "I got stuck, will support fix the issue with my code?",
  //             a: "Unfortunately, we can't offer support for fixing issues with your code that AI made – though we update the AI every day so it makes less mistakes. Good news is we don't charge you credits for errors that AI makes. Try to ask Nucleate to search the web or restore to a previous version of the app which didn't have the issue, and then ask Nucleate to implement the original feature again."
  //         },
  //         {
  //             q: "Nucleate got in an error loop and can't fix the issue, what should I do?",
  //             a: "You can ask Nucleate to search the web to fix your problem, or try reverting to a previous version of the app and then ask Nucleate to implement the original feature again."
  //         }
  //     ]
  // }
];

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("General");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on slash key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter logic
  const filteredData = searchQuery.trim()
    ? FAQ_DATA.map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.a.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      })).filter((cat) => cat.items.length > 0)
    : FAQ_DATA;

  const scrollToCategory = (category: string) => {
    setActiveCategory(category);
    const element = document.getElementById(`category-${category}`);
    if (element) {
      const headerOffset = 120;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <main className="relative min-h-screen bg-background text-foreground selection:bg-primary/20 overflow-hidden font-sans">
      <GridBackground />

      <div className="relative z-10">
        <PremiumHeader />

        {/* Hero Section */}
        <section className="pt-32 pb-12 lg:pt-48 px-6 border-b border-border bg-gradient-to-b from-transparent to-background">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-foreground mb-6">
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Quick answers about building apps with Nucleate.
            </p>

            <div className="relative max-w-xl mx-auto group">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative relative bg-card border border-border rounded-xl flex items-center shadow-2xl transition-colors focus-within:border-primary/50 focus-within:bg-card">
                <Search className="w-5 h-5 text-muted-foreground ml-4" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Search questions... (Press / to focus)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-foreground placeholder:text-muted-foreground h-12 text-base focus-visible:ring-0 px-3"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-16 px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="flex flex-col lg:flex-row gap-12">
              {/* Sidebar Navigation (Desktop) */}
              {!searchQuery && (
                <aside className="hidden lg:block w-64 shrink-0">
                  <div className="sticky top-32 space-y-1">
                    {FAQ_DATA.map((cat) => (
                      <button
                        key={cat.category}
                        onClick={() => scrollToCategory(cat.category)}
                        className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          activeCategory === cat.category
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                      >
                        {cat.category}
                      </button>
                    ))}
                  </div>
                </aside>
              )}

              {/* Questions Area */}
              <div className="flex-1 min-w-0 space-y-16 pb-32">
                {filteredData.length > 0 ? (
                  filteredData.map((section) => (
                    <div
                      key={section.category}
                      id={`category-${section.category}`}
                      className="scroll-mt-32"
                    >
                      {/* Section Header */}
                      <h2 className="text-2xl font-medium text-foreground mb-8 border-b border-border pb-4 flex items-center gap-2">
                        {section.category}
                        {searchQuery && (
                          <span className="text-sm font-normal text-muted-foreground ml-2">
                            ({section.items.length} result
                            {section.items.length !== 1 ? "s" : ""})
                          </span>
                        )}
                      </h2>

                      {/* Questions Grid */}
                      <div className="grid gap-6">
                        {section.items.map((item, i) => (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.3, delay: i * 0.05 }}
                            key={i}
                            className="group bg-card border border-border rounded-2xl p-6 md:p-8 hover:border-primary/20 transition-colors duration-300"
                          >
                            <h3 className="text-lg font-medium text-foreground/90 mb-3 leading-snug">
                              {item.q}
                            </h3>
                            <div className="text-muted-foreground leading-relaxed text-[15px] space-y-2 whitespace-pre-wrap">
                              {/* Parse links in the answer text */}
                              <ParsedAnswer text={item.a} />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-24">
                    <p className="text-muted-foreground text-lg">
                      No matching questions found.
                    </p>
                    <Button
                      variant="link"
                      className="text-primary mt-2"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear search
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}

// Utility to parse URLs in text and make them clickable
function ParsedAnswer({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.match(/https?:\/\/[^\s]+/)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors break-all"
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}

function Footer() {
  return (
    <footer className="py-12 border-t border-border bg-background text-sm relative z-10">
      <div className="container mx-auto px-6 max-w-6xl flex flex-col md:flex-row justify-between items-center text-muted-foreground gap-6">
        <div className="flex gap-6">
          <span className="hover:text-foreground cursor-pointer transition-colors">
            Twitter
          </span>
          <span className="hover:text-foreground cursor-pointer transition-colors">
            GitHub
          </span>
        </div>
        <div className="flex gap-6">
          <span className="hover:text-foreground cursor-pointer transition-colors">
            Privacy
          </span>
          <span className="hover:text-foreground cursor-pointer transition-colors">
            Terms
          </span>
          <span>© 2025 Nucleate Inc.</span>
        </div>
      </div>
    </footer>
  );
}
