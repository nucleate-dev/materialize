"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/ClientConstants";
import { useUser } from "@/hooks/useUser";
import ProPlanUpsellModal from "@/components/ProPlanUpsellModal";
import {
  ArrowRight,
  Code,
  Lightbulb,
  Loader2,
  Paintbrush,
  Rocket,
  Send,
  Smartphone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const router = useRouter();
  const { user } = useUser();

  const submitPrompt = async (message: string) => {
    const content = message.trim();
    if (!content || isLoading) return;

    setIsLoading(true);

    try {
      if (!user?.id) {
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "chat_intent",
            JSON.stringify({ message: content }),
          );
        }
        router.push("/login");
        return;
      }

      let result;
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          console.error("No authentication token available");
          return;
        }

        const response = await fetch("/api/prototype/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: "New Prototype",
          }),
        });

        result = await response.json();
      } catch (error) {
        console.error("Error creating prototype:", error);
        return;
      }

      if (result.success) {
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "chat_intent",
            JSON.stringify({
              prototype_id: result.data.prototype_id,
              message: content,
            }),
          );
        }

        router.push(`/dashboard/prototypes/${result.data.prototype_id}`);
      } else if (result.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        setShowUpsellModal(true);
      } else {
        console.error("Error creating prototype:", result.message);
      }
    } catch (err) {
      console.error("Error creating prototype:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPrompt(prompt);
  };

  const examplePrompts = [
    {
      icon: Smartphone,
      title: "Social Media App",
      description: "A modern social feed with posts, likes, and comments.",
      prompt:
        "Build a social media mobile app with a clean feed interface, post creation, and user interactions.",
    },
    {
      icon: Paintbrush,
      title: "E-commerce Store",
      description: "A shopping app with product listings and a cart.",
      prompt:
        "Create an e-commerce mobile app with a product catalog, shopping cart, and checkout flow.",
    },
    {
      icon: Code,
      title: "Productivity Tool",
      description: "A task management app with to-dos and reminders.",
      prompt:
        "Design a productivity app with task lists, reminders, and progress tracking.",
    },
    {
      icon: Rocket,
      title: "Fitness Tracker",
      description: "A health app with workout tracking and statistics.",
      prompt:
        "Build a fitness tracking app with workout logging, progress charts, and goal setting.",
    },
  ];

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto px-4 py-16">
          {/* Header Section */}
          <div className="text-center mb-16">
            <div className="inline-block p-4 bg-primary/10 text-primary rounded-lg mb-4">
              <Sparkles className="w-12 h-12" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Build Your Dream App
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Describe your mobile app idea and watch it come to life with
              AI-powered development. From concept to code in seconds.
            </p>
            <div className="flex justify-center gap-4">
              <Badge variant="secondary">React Native</Badge>
              <Badge variant="secondary">AI-Powered</Badge>
              <Badge variant="secondary">Real-time Preview</Badge>
            </div>
          </div>

          {/* Main Chat Interface */}
          <Card className="w-full max-w-4xl mx-auto mb-16">
            <CardHeader>
              <CardTitle>Create a new prototype</CardTitle>
              <CardDescription>
                Describe the mobile app or screen you want to build.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <div className="grid w-full gap-4">
                  <Textarea
                    value={prompt}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setPrompt(e.target.value)
                    }
                    placeholder="e.g., A simple to-do list app with a clean interface."
                    className="min-h-[120px] text-base"
                    rows={4}
                    disabled={isLoading}
                  />
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-muted-foreground flex items-center">
                      <Lightbulb className="w-4 h-4 mr-2" />
                      <span>{prompt.length} / 500</span>
                    </div>
                    <Button
                      type="submit"
                      disabled={!prompt.trim() || isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Building...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Create App
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Example Prompts Section */}
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold mb-2">
              Get Started with These Ideas
            </h3>
            <p className="text-muted-foreground">
              Click any example to get started instantly.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {examplePrompts.map((example, index) => (
              <Card
                key={index}
                onClick={() => submitPrompt(example.prompt)}
                className="cursor-pointer hover:border-primary transition-colors group"
              >
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div className="p-2 bg-primary/10 text-primary rounded-lg">
                      <example.icon className="w-6 h-6" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0" />
                  </div>
                </CardHeader>
                <CardContent>
                  <h4 className="font-semibold text-lg mb-2">
                    {example.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {example.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-16 text-center text-sm text-muted-foreground">
            <p>
              Need inspiration? Check out our{" "}
              <Link
                href="/dashboard/projects"
                className="text-primary hover:underline"
              >
                project gallery
              </Link>{" "}
              or browse{" "}
              <Link
                href="/dashboard/whiteboards"
                className="text-primary hover:underline"
              >
                whiteboards
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </>
  );
}
