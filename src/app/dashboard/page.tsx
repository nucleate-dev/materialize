"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/GlobalConstants";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { getDefaultPrototypeFiles } from "@/templates/defaultApp";
import {
  SparklesIcon,
  PaperAirplaneIcon,
  CommandLineIcon,
  DevicePhoneMobileIcon,
  PaintBrushIcon,
  RocketLaunchIcon,
  LightBulbIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);

    try {
      if (!user?.id) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("prototypes")
        .insert({
          name: "New Prototype",
          owner_id: user.id,
          project_id: null,
          description: null,
          prototype_context: null,
          thumbnail_url: null,
          visibility: "SELF" as const,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating prototype:", error);
        return;
      }

      const { error: filesError } = await supabase
        .from("prototype_files")
        .insert(getDefaultPrototypeFiles(data.id));
      if (filesError) {
        console.error("Error creating default prototype files:", filesError);
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(
          "chat_intent",
          JSON.stringify({
            prototype_id: data.id,
            message: prompt.trim(),
          }),
        );
      }

      router.push(`/dashboard/prototypes/${data.id}`);
    } catch (err) {
      console.error("Error creating prototype:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const examplePrompts = [
    {
      icon: DevicePhoneMobileIcon,
      title: "Social Media App",
      description:
        "Create a modern social media feed with posts, likes, and comments",
      prompt:
        "Build a social media mobile app with a clean feed interface, post creation, and user interactions",
    },
    {
      icon: PaintBrushIcon,
      title: "E-commerce Store",
      description:
        "Design a shopping app with product listings and cart functionality",
      prompt:
        "Create an e-commerce mobile app with product catalog, shopping cart, and checkout flow",
    },
    {
      icon: CommandLineIcon,
      title: "Productivity Tool",
      description: "Build a task management app with to-dos and reminders",
      prompt:
        "Design a productivity app with task lists, reminders, and progress tracking",
    },
    {
      icon: RocketLaunchIcon,
      title: "Fitness Tracker",
      description: "Create a health app with workout tracking and statistics",
      prompt:
        "Build a fitness tracking app with workout logging, progress charts, and goal setting",
    },
  ];

  return (
    <div className="h-full min-h-full bg-gradient-to-br from-gray-2 via-whiter to-gray-3 dark:from-boxdark-2 dark:via-boxdark dark:to-meta-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-primary/20 to-secondary/20 dark:from-primary/10 dark:to-secondary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-meta-5/20 to-meta-3/20 dark:from-meta-5/10 dark:to-meta-3/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-primary/10 via-secondary/10 to-meta-5/10 dark:from-primary/5 dark:via-secondary/5 dark:to-meta-5/5 rounded-full blur-3xl animate-spin"
          style={{ animationDuration: "20s" }}
        ></div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center h-full overflow-hidden">
        {/* Header Section */}
        <div className="text-center mb-12 max-w-4xl">
          <div className="flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-meta-5/20 dark:from-primary/10 dark:via-secondary/10 dark:to-meta-5/10 rounded-full blur-2xl animate-pulse"></div>
            <div className="relative p-4 bg-gradient-to-br from-primary to-secondary dark:from-primary dark:to-secondary rounded-2xl shadow-2xl shadow-primary/25 dark:shadow-primary/40 ring-1 ring-white/20 dark:ring-primary/30">
              <SparklesIcon className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-black dark:text-white mb-6 leading-tight">
            Build Your{" "}
            <span className="bg-gradient-to-r from-primary via-secondary to-meta-5 bg-clip-text text-transparent">
              Dream App
            </span>
          </h1>

          <p className="text-xl text-body dark:text-bodydark mb-8 leading-relaxed max-w-2xl mx-auto">
            Describe your mobile app idea and watch it come to life with
            AI-powered development. From concept to code in seconds.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium text-body dark:text-bodydark2">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-boxdark/50 rounded-full backdrop-blur-sm border border-stroke/50 dark:border-strokedark/50">
              <div className="w-2 h-2 bg-meta-3 rounded-full animate-pulse"></div>
              React Native
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-boxdark/50 rounded-full backdrop-blur-sm border border-stroke/50 dark:border-strokedark/50">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              AI-Powered
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-boxdark/50 rounded-full backdrop-blur-sm border border-stroke/50 dark:border-strokedark/50">
              <div className="w-2 h-2 bg-secondary rounded-full animate-pulse"></div>
              Real-time Preview
            </div>
          </div>
        </div>

        {/* Main Chat Interface */}
        <div className="w-full max-w-4xl relative">
          {/* Glassmorphism Container */}
          <div className="relative bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl rounded-3xl shadow-2xl dark:shadow-black/20 border border-white/20 dark:border-strokedark/30 p-8 md:p-12">
            {/* Inner glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-primary/5 dark:from-white/5 dark:to-primary/10 rounded-3xl pointer-events-none"></div>

            <form onSubmit={handleSubmit} className="relative z-10">
              <div className="relative group">
                {/* Input Container with Enhanced Styling */}
                <div className="relative overflow-hidden rounded-2xl">
                  {/* Animated border gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-meta-5 rounded-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm"></div>
                  <div className="absolute inset-[1px] bg-white dark:bg-boxdark rounded-2xl"></div>

                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the mobile app or screen you want to build... ✨"
                    className="relative w-full px-8 py-6 text-lg font-medium bg-transparent text-black dark:text-white placeholder-body/60 dark:placeholder-bodydark/60 border-0 focus:outline-none focus:ring-0 resize-none transition-all duration-300 min-h-[120px] leading-relaxed"
                    rows={4}
                    disabled={isLoading}
                  />

                  {/* Character counter and status */}
                  <div className="absolute bottom-4 left-8 flex items-center gap-4 text-sm text-body/60 dark:text-bodydark/60">
                    <div className="flex items-center gap-2">
                      <LightBulbIcon className="w-4 h-4" />
                      <span>{prompt.length}/500</span>
                    </div>
                    {prompt.length > 0 && (
                      <div className="flex items-center gap-2 text-meta-3">
                        <div className="w-2 h-2 bg-meta-3 rounded-full animate-pulse"></div>
                        <span>Ready to build</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <div className="absolute bottom-4 right-4">
                  <button
                    type="submit"
                    disabled={!prompt.trim() || isLoading}
                    className={`relative group/btn p-4 rounded-xl transition-all duration-500 transform-gpu ${
                      prompt.trim() && !isLoading
                        ? "bg-gradient-to-r from-primary via-secondary to-meta-5 hover:from-primary/90 hover:via-secondary/90 hover:to-meta-5/90 text-white shadow-2xl shadow-primary/40 hover:shadow-primary/60 dark:shadow-primary/60 dark:hover:shadow-primary/80 scale-100 hover:scale-110 ring-2 ring-white/30 dark:ring-primary/30 hover:ring-white/50 dark:hover:ring-primary/50"
                        : "bg-stroke/50 dark:bg-strokedark/50 text-body/40 dark:text-bodydark/40 cursor-not-allowed scale-95"
                    }`}
                  >
                    {/* Button glow effect */}
                    {prompt.trim() && !isLoading && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/30 to-secondary/30 blur-lg opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"></div>
                    )}

                    <div className="relative flex items-center gap-2">
                      {isLoading ? (
                        <>
                          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span className="font-semibold">Building...</span>
                        </>
                      ) : (
                        <>
                          <PaperAirplaneIcon className="w-6 h-6 transition-transform duration-300 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                          <span className="font-semibold">Create App</span>
                        </>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Example Prompts Section */}
        <div className="w-full max-w-6xl mt-16">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-black dark:text-white mb-3">
              Get Started with These Ideas
            </h3>
            <p className="text-body dark:text-bodydark">
              Click any example to get started instantly
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {examplePrompts.map((example, index) => (
              <button
                key={index}
                onClick={() => setPrompt(example.prompt)}
                className="group relative p-6 bg-white/60 dark:bg-boxdark/60 backdrop-blur-sm rounded-2xl border border-stroke/50 dark:border-strokedark/50 hover:bg-white/80 dark:hover:bg-boxdark/80 transition-all duration-300 hover:scale-105 hover:shadow-xl dark:hover:shadow-black/20 text-left"
              >
                {/* Hover gradient effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-gradient-to-br from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-lg group-hover:scale-110 transition-transform duration-300">
                      <example.icon className="w-5 h-5 text-primary dark:text-secondary" />
                    </div>
                    <ArrowRightIcon className="w-4 h-4 text-body/40 dark:text-bodydark/40 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-[-10px] group-hover:translate-x-0" />
                  </div>

                  <h4 className="font-semibold text-black dark:text-white mb-2 group-hover:text-primary dark:group-hover:text-secondary transition-colors duration-300">
                    {example.title}
                  </h4>

                  <p className="text-sm text-body dark:text-bodydark leading-relaxed">
                    {example.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <p className="text-body/60 dark:text-bodydark/60 text-sm">
            Need inspiration? Check out our{" "}
            <button
              onClick={() => router.push("/dashboard/projects")}
              className="text-primary dark:text-secondary hover:underline font-medium"
            >
              project gallery
            </button>{" "}
            or browse{" "}
            <button
              onClick={() => router.push("/dashboard/whiteboards")}
              className="text-primary dark:text-secondary hover:underline font-medium"
            >
              whiteboards
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
