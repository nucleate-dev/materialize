"use client";

import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { setChatIntent } from "@/lib/utils/chatIntentUtils";
import { SwatchIcon } from "@heroicons/react/24/outline";
import {
  Lightbulb,
  Loader2, Send, Sparkles
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];
type DesignStyle = Database["public"]["Enums"]["design_style"];

const DESIGN_STYLE_OPTIONS: DesignStyle[] = [
  "tamagui",
  "nativewind",
  "stylesheets",
];

const DESIGN_STYLE_LABELS: Record<DesignStyle, string> = {
  tamagui: "Tamagui",
  nativewind: "NativeWind",
  stylesheets: "React Native StyleSheet",
};

export default function DashboardPage() {
  const logger = useProductLogger();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const [designSystems, setDesignSystems] = useState<DesignSystemRow[]>([]);
  const [customDesignSystemId, setCustomDesignSystemId] = useState<string | null>(null);
  const [, setIsLoadingDesignSystems] = useState(false);
  const [designStyle, setDesignStyle] = useState<DesignStyle>("nativewind");

  // Fetch design systems
  useEffect(() => {
    async function fetchDesignSystems() {
      if (!user) return;

      setIsLoadingDesignSystems(true);
      try {
        const { data, error } = await supabase
          .from("design_systems")
          .select("id, name, description, design_rules, updated_at")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          logger.debug("error", "Error fetching design systems:", {
            ...error,
          });
          return;
        }
        setDesignSystems(data as DesignSystemRow[] || []);
      } catch (error) {
        logger.debug("error", "Error fetching design systems:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        setIsLoadingDesignSystems(false);
      }
    }

    if (user?.id) {
      fetchDesignSystems();
    }
  }, [user, logger]);

  const submitPrompt = async (message: string) => {
    const content = message.trim();
    if (!content || isLoading) return;

    setIsLoading(true);

    try {
      if (!user?.id) {
        setChatIntent(undefined, content, false);
        router.push("/login");
        return;
      }

      let result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      >;
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          return;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: "New Prototype",
              design_style: designStyle,
              custom_design_system: customDesignSystemId ?? undefined,
            } as CreatePrototypeRequestBody),
          },
        );

        result = await response.json();
      } catch (error) {
        logger.debug("error", "Error creating prototype:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return;
      }

      if (result.data) {
        setChatIntent(result.data.prototype_id, content, false);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        setShowUpsellModal(true);
      } else {
        logger.debug("error", "Error creating prototype:", {
          error: result.error?.message,
        });
      }
    } catch (err) {
      logger.debug("error", "Error creating prototype:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPrompt(prompt);
  };

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
              Build Your Ideas
            </h1>
          </div>

          {/* Main Chat Interface */}
          <Card className="w-full max-w-4xl mx-auto mb-16">
            <CardHeader>
              <CardTitle>Create a new prototype</CardTitle>
              <CardDescription>
                Describe the mobile app, screen, or flow you want to build.
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
                  <div className="flex justify-between items-center gap-4">
                    <div className="text-sm text-muted-foreground flex items-center">
                      <Lightbulb className="w-4 h-4 mr-2" />
                      <span>{prompt.length} / 500</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={designStyle}
                        onValueChange={(value) => {
                          setDesignStyle(value as DesignStyle);
                        }}
                        disabled={isLoading}
                      >
                        <SelectTrigger className="h-9 w-[200px]">
                          <div className="flex items-center gap-2">
                            <SwatchIcon className="w-4 h-4 text-primary" />
                            <SelectValue placeholder="Choose a design style" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {DESIGN_STYLE_OPTIONS.map((style) => (
                            <SelectItem key={style} value={style}>
                              {DESIGN_STYLE_LABELS[style]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {designSystems.length > 0 && (
                        <Select
                          value={customDesignSystemId ?? "none"}
                          onValueChange={(value) => {
                            const systemValue = value === "none" ? null : value;
                            setCustomDesignSystemId(systemValue);
                          }}
                          disabled={isLoading}
                        >
                          <SelectTrigger className="h-9 w-[200px] pr-3">
                            <SelectValue placeholder="Design System (Optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No design system</SelectItem>
                            {designSystems.map((system) => (
                              <SelectItem key={system.id} value={String(system.id)}>
                                {system.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
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
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Example Prompts Section */}
          {/* <div className="text-center mb-8">
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
          </div> */}
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
