"use client";

import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import { GridBackground } from "@/components/shared/GridComponent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

// --- FAQ DATA ---
const FAQ_DATA = [
    {
        category: "General",
        items: [
            {
                q: "How does Materialize work?",
                a: "Describe your app idea in plain English and Materialize generates a working app using React Native and Expo. You can test it instantly on your phone by downloading the Materialize app for iOS or Expo Go app for Android and scanning the QR code, or view it in your browser. The browser preview is a great way to quickly see how your app feels, but the details may vary and not all native features are available in the browser."
            },
            {
                q: "Do I need coding experience to make my mobile app?",
                a: "Materialize makes a working prototype in minutes just from plain English descriptions. If you want to make a complex mobile app with authentication, database, payments, push notifications, etc. – you'll currently need engineering help at some point or spend time researching how to implement these features."
            },
            {
                q: "What types of apps can I build?",
                a: "Materialize makes a beautiful v1 of your app, allows you to prototype any number of screens, and easily build AI-powered applications like Chat, Voice Transcription, or Image Generation. Materialize apps also store data on the device and integrate with any third-party APIs. However, integrating features like database, authentication, notifications, and payments will take more time to figure out or will require engineering help. We are working on making it super easy for non-technical people to build complex apps."
            },
            {
                q: "Can I use Materialize for professional purposes? E.g. for my work or my business?",
                a: "Yes, you can use Materialize for professional purposes."
            }
        ]
    },
    {
        category: "Technical",
        items: [
            {
                q: "Are Materialize apps actually native iOS/Android apps? Or is it just web apps?",
                a: "Yes, Materialize apps are fully native apps built with React Native and powered by Expo, the #1 cross-platform framework that powers Discord, Shopify, Coinbase, Instagram, and nearly 30% of top 100 apps on the App Store. They work on both iOS and Android devices, but often can also be exported to web. It is a common misconception that native apps can only be built in Swift or Kotlin and require expensive development. React Native is a great way to build native apps with TypeScript that covers more than 95% of the native features, and allows you to write Swift/Kotlin native code later if needed."
            },
            {
                q: "Can I use Materialize to build production-ready apps?",
                a: "Our team is focused on building the best support for native mobile apps. Materialize is a great way to build production-ready apps. Materialize starts with a working prototype built in a production-ready tech stack used by Discord, Shopify, Coinbase, Instagram, and nearly 30% of top 100 apps on the App Store. Materialize can complete lots of simple apps and publish them to App Store or Google Play. If you hit a wall at some point, you can always sync with GitHub and find engineers on Upwork/Fiverr to finish complex features for your app."
            },
            {
                q: "Does it work on iOS and Android?",
                a: "Yes! Materialize builds cross-platform apps that work on both iOS and Android devices."
            },
            {
                q: "Can I use Materialize to build a web app?",
                a: "Materialize apps also work on the web, but we do not offer a hosting service for them. You can download your Materialize app code and host it on Expo, Vercel or Netlify. Here's a guide from Expo to host your app on the web: https://docs.expo.dev/guides/publishing-websites/"
            }
        ]
    },
    {
        category: "Integrations",
        items: [
            {
                q: "Can I integrate Materialize with a database like Supabase or Firebase?",
                a: "Yes, you can ask Materialize to integrate with Supabase or Firebase, but we do not offer an easy way to do this yet, so you'll need to spend time with it. Note that if you want Supabase/Firebase Auth or Firebase Push Notifications, you'll need to export the code locally and use external guidance/tutorials to implement them."
            },
            {
                q: "What is Materialize Backend? Does it have a database or authentication service?",
                a: "Materialize Backend are serverless backend functions that auto-scale with your demand and can securely call any third-party API or securely connect to external database. It doesn't require a server and works similarly to Supabase Functions. The reason we built backend functions is it's much more secure than connecting to Supabase directly like other platforms do – Materialize Backend can use Supabase in a fully secure way, no RLS policies needed. We do not support built-in database or authentication yet as this is a harder problem to solve for native iOS/Android apps, but we will support it soon. We are committed to hosting the backend for all paid users, so you can use it on production – though keep in mind that it's a beta feature."
            },
            {
                q: "How can I build apps that use AI features like chat, voice transcription, or image generation?",
                a: "Materialize easily integrates with OpenAI API. We are committed to hosting the AI for you on paid plans and you do not need to struggle with API keys. You can simply ask Materialize to build an app that uses AI chat, voice transcription, or image generation. If you want to use OpenAI API directly, you can export the code and ask Cursor to use your own OpenAI API key."
            },
            {
                q: "Can I integrate Materialize with my business tools like Google Sheets, Airtable, Notion, or my own API?",
                a: "Yes, you can integrate Materialize with your business tools like Google Sheets, Airtable, Notion, or your own API. Just ask Materialize to integrate with the service you want. It will ask for an API key and might make mistakes in the API calls unless you send it the link to the API documentation."
            },
            {
                q: "Can I import Figma files into Materialize?",
                a: "You can use Figma designs by copying your Figma app screen frames as an image and copy-pasting them into the Materialize AI chat input. Also, you can bulk export all of your Figma screens as images and drag-and-drop all of them into the Materialize AI chat input. We're working on a better way to import Figma designs into Materialize."
            },
            {
                q: "How can I add payments into my app with Stripe, RevenueCat, Superwall or Adapty?",
                a: "Right now we do not offer native payments integration, but you can export the code and use Cursor to add payments to your app, or find an engineer on Fiverr/Upwork to help you with it. We recommend using RevenueCat for in-app purchases and subscriptions since they integrate with native payment systems of App Store and Google Play, and also support Stripe for web. You will need to make a custom Expo Development Build to integrate with RevenueCat. You can export the code, setup Expo EAS CLI, and follow the official Expo guide on how to setup payments with RevenueCat."
            },
            {
                q: "How can I add authentication into my app?",
                a: "First, make sure you really need authentication, because most mobile apps on the App Store do not have authentication as most of user data can be stored on the mobile device itself. If you really do need authentication (e.g. your app is a social media app, needs cloud sync or collaboration), we recommend integrating email/password or magic link authentication with Supabase Auth – ask Materialize to integrate it. If you want to use Social Login (Google, Apple, etc.), you will need to make a custom Expo Development Build and it's only possible with external guidance."
            },
            {
                q: "How can I add push notifications into my app?",
                a: "First, make sure you really need push notifications, because Materialize supports in-app local notifications out-of-the-box. If you do, we recommend integrating with Firebase Cloud Messaging. You can export the code and use Cursor to guide you through the setup, or find an engineer on Fiverr/Upwork to help you with it."
            }
        ]
    },
    {
        category: "Publishing",
        items: [
            {
                q: "What is App Preview? Can I share my mobile app with friends/colleagues without TestFlight?",
                a: "App Preview is a feature that allows you to share your app with friends or colleagues in minutes, before it's published to App Store. It's a great way to get feedback and test your app before it's released. You can publish your app to App Preview and share the `.materialize.app` link that is generated for your app. Your friend will need to install the Materialize iOS app or Expo Go to open the shared app. They can also scan the QR code if they opened the link on their desktop."
            },
            {
                q: "How can I publish to App Store or TestFlight?",
                a: "First, make sure you really need to publish to App Store or TestFlight, because App Preview is a great way to use or share your app and can be good to publish the app for every day use. If you do, Materialize has an easy App Store publishing feature – just click Publish and follow the instructions. You'll need to have an Apple Developer Account and Expo account (you'll need a subscription if you use it too much)."
            },
            {
                q: "How can I publish to Google Play? Or download an .apk file?",
                a: "First, make sure you really need to publish to Google Play, because App Preview is a great way to use or share your app every day. If you do, right now Materialize does not have a native Google Play publishing feature, but it's coming! You can download your Materialize app code via GitHub integration, create an Expo account and publish your app via Expo Application Services (EAS)."
            },
            {
                q: "How can I publish to web?",
                a: "Materialize apps also work on the web, but we do not offer a hosting service for them. You can download your Materialize app code and host it on Expo, Vercel or Netlify."
            }
        ]
    },
    {
        category: "Code Export",
        items: [
            {
                q: "Can I export the code?",
                a: "Yes, you own all generated code, but only on paid plans. You can download the code via GitHub integration to continue coding in Cursor, or deploy your app to Expo, Vercel or Netlify."
            },
            {
                q: "How can I export the code?",
                a: "You should subscribe to a paid plan to export the code, sign in to your GitHub account and then use Materialize's GitHub integration to export the code."
            },
            {
                q: "How can I make changes locally and import them back to Materialize?",
                a: "You should use Materialize's GitHub integration to sync your code with GitHub. It is a two-way sync, so you can make changes locally and import them back to Materialize."
            }
        ]
    },
    {
        category: "Collaboration",
        items: [
            {
                q: "Can I collaborate with others?",
                a: "We do not have a team collaboration feature yet, but you can invite engineers through GitHub integration to help you with your Materialize project."
            }
        ]
    },
    {
        category: "Billing",
        items: [
            {
                q: "How much does it cost?",
                a: "We offer a free tier plus plans ranging from $25 to $1000 per month with different credit limits. Check our pricing page for details."
            },
            {
                q: "I hit my credit limit, what should I do? Can I buy more credits without upgrading my plan?",
                a: "You'll need to upgrade to a higher package ($25/$50/$100/$200+) or wait until the date of first purchase when credits reset. There's currently no way to separately buy additional credits."
            }
        ]
    },
    {
        category: "Support",
        items: [
            {
                q: "Do you have priority support?",
                a: "Paid subscribers starting from $50/month get chat support, but as we have a small team right now, we can't offer fast support or engineering help. We usually reply within 24 hours. If you're on Free or Junior plan, you can contact our support email. We are always hiring great support engineers, so if you're interested in working with us, please apply at hq.materialize.com."
            },
            {
                q: "Materialize broke my app, what should I do? Can I revert to a previous version?",
                a: "Yes, Materialize has a 'Restore' feature that allows you to revert to a previous version of the app. If you're unsure which version to restore, you can press on the version card to preview the version before restoring it."
            },
            {
                q: "I got stuck, will support fix the issue with my code?",
                a: "Unfortunately, we can't offer support for fixing issues with your code that AI made – though we update the AI every day so it makes less mistakes. Good news is we don't charge you credits for errors that AI makes. Try to ask Materialize to search the web or restore to a previous version of the app which didn't have the issue, and then ask Materialize to implement the original feature again."
            },
            {
                q: "Materialize got in an error loop and can't fix the issue, what should I do?",
                a: "You can ask Materialize to search the web to fix your problem, or try reverting to a previous version of the app and then ask Materialize to implement the original feature again."
            }
        ]
    }
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
                    item.a.toLowerCase().includes(searchQuery.toLowerCase())
            ),
        })).filter((cat) => cat.items.length > 0)
        : FAQ_DATA;

    const scrollToCategory = (category: string) => {
        setActiveCategory(category);
        const element = document.getElementById(`category-${category}`);
        if (element) {
            const headerOffset = 120;
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });
        }
    };

    return (
        <main className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
            <GridBackground forceDarkMode />

            <div className="relative z-10">
                <PremiumHeader forceDarkMode />

                {/* Hero Section */}
                <section className="pt-32 pb-12 lg:pt-48 px-6 border-b border-white/5 bg-gradient-to-b from-transparent to-[#0B0C0E]">
                    <div className="container mx-auto max-w-4xl text-center">
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-white mb-6">
                            Frequently Asked Questions
                        </h1>
                        <p className="text-xl text-[#8A8F98] max-w-2xl mx-auto mb-10">
                            Quick answers about building apps with Materialize.
                        </p>

                        <div className="relative max-w-xl mx-auto group">
                            <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="relative relative bg-[#141517] border border-white/10 rounded-xl flex items-center shadow-2xl transition-colors focus-within:border-white/30 focus-within:bg-[#18191B]">
                                <MagnifyingGlassIcon className="w-5 h-5 text-white/40 ml-4" />
                                <Input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search questions... (Press / to focus)"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent border-none text-white placeholder:text-white/30 h-12 text-base focus-visible:ring-0 px-3"
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
                                                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeCategory === cat.category
                                                        ? "bg-white/10 text-white"
                                                        : "text-[#8A8F98] hover:text-white hover:bg-white/5"
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
                                    filteredData.map((section, idx) => (
                                        <div
                                            key={section.category}
                                            id={`category-${section.category}`}
                                            className="scroll-mt-32"
                                        >
                                            {/* Section Header */}
                                            <h2 className="text-2xl font-medium text-white mb-8 border-b border-white/5 pb-4 flex items-center gap-2">
                                                {section.category}
                                                {searchQuery && (
                                                    <span className="text-sm font-normal text-white/40 ml-2">
                                                        ({section.items.length} result{section.items.length !== 1 ? 's' : ''})
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
                                                        className="group bg-[#141517] border border-white/10 rounded-2xl p-6 md:p-8 hover:border-white/20 transition-colors duration-300"
                                                    >
                                                        <h3 className="text-lg font-medium text-white/90 mb-3 leading-snug">
                                                            {item.q}
                                                        </h3>
                                                        <div className="text-[#8A8F98] leading-relaxed text-[15px] space-y-2 whitespace-pre-wrap">
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
                                        <p className="text-white/40 text-lg">No matching questions found.</p>
                                        <Button
                                            variant="link"
                                            className="text-indigo-400 mt-2"
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
function ParsedAnswer({ text }: { text: string; }) {
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
                            className="text-indigo-400 hover:text-indigo-300 transition-colors break-all"
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
        <footer className="py-12 border-t border-white/5 bg-[#0B0C0E] text-sm relative z-10">
            <div className="container mx-auto px-6 max-w-6xl flex flex-col md:flex-row justify-between items-center text-[#8A8F98] gap-6">
                <div className="flex gap-6">
                    <span className="hover:text-white cursor-pointer transition-colors">Twitter</span>
                    <span className="hover:text-white cursor-pointer transition-colors">GitHub</span>
                    <span className="hover:text-white cursor-pointer transition-colors">Discord</span>
                </div>
                <div className="flex gap-6">
                    <span className="hover:text-white cursor-pointer transition-colors">Privacy</span>
                    <span className="hover:text-white cursor-pointer transition-colors">Terms</span>
                    <span>© 2025 Materialize Inc.</span>
                </div>
            </div>
        </footer>
    );
}