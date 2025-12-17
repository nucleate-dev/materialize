"use client";

import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { GridBackground } from "@/components/shared/GridComponent";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePrototype } from "@/hooks/useCreatePrototype";
import { useUser } from "@/hooks/useUser";
import { redirectAfterLoginAtom } from "@/lib/atoms/sidebar";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { setChatIntent } from "@/lib/utils/chatIntentUtils";
import { checkSurveyCompleted } from "@/lib/utils/survey/SurveyUtils";
import { SwatchIcon } from "@heroicons/react/24/outline"; // Kept Heroicons
import { PaintBrushIcon } from "@heroicons/react/24/solid";
import { useAtom } from "jotai";
import {
  ChevronDown,
  Command,
  Cpu,
  Layers,
  LayoutTemplate,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react"; // Kept Lucide
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// --- Types ---
type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];
type DesignStyle = Database["public"]["Enums"]["design_style"];

const DESIGN_STYLE_OPTIONS: DesignStyle[] = ["stylesheets", "nativewind"];

const DESIGN_STYLE_LABELS: Partial<Record<DesignStyle, string>> = {
  nativewind: "NativeWind",
  stylesheets: "StyleSheet",
  custom: "Custom",
};

export default function DashboardPage() {
  // --- Logic / Hooks (Preserved) ---
  const logger = useProductLogger();
  const { createPrototype } = useCreatePrototype();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const [redirectAfterLogin, setRedirectAfterLogin] = useAtom(
    redirectAfterLoginAtom,
  );
  const [designSystems, setDesignSystems] = useState<DesignSystemRow[]>([]);
  const [customDesignSystemId, setCustomDesignSystemId] = useState<
    string | null
  >(null);
  const [, setIsLoadingDesignSystems] = useState(false);
  const [designStyle, setDesignStyle] = useState<DesignStyle>("stylesheets");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [isSurveyChecking, setIsSurveyChecking] = useState(true);
  const [hasCheckedIntent, setHasCheckedIntent] = useState(false);

  // Check if user has completed survey (Scenario 2)
  useEffect(() => {
    async function checkSurvey() {
      if (!user?.id) {
        setIsSurveyChecking(false);
        return;
      }

      try {
        const completed = await checkSurveyCompleted(user.id);
        if (!completed) {
          router.push("/welcome-survey");
          return;
        }
        setIsSurveyChecking(false);
      } catch (error) {
        logger.debug("error", "Error checking survey status", {
          error: error instanceof Error ? error.message : String(error),
        });
        setIsSurveyChecking(false);
      }
    }

    checkSurvey();
  }, [user, router, logger]);

  // Pre-fill prompt from chat_intent if user came from landing page
  useEffect(() => {
    if (hasCheckedIntent || isSurveyChecking) return;

    if (typeof window !== "undefined") {
      const chatIntent = localStorage.getItem("chat_intent");
      if (chatIntent) {
        try {
          const parsed = JSON.parse(chatIntent) as {
            prototype_id?: string;
            message: string;
          };
          // Only pre-fill if there's a message but no prototype_id
          // (meaning user typed a prompt before registering)
          if (parsed.message && !parsed.prototype_id) {
            setPrompt(parsed.message);
            // Clear the intent after using it
            localStorage.removeItem("chat_intent");
          }
        } catch (e) {
          logger.debug("error", "Failed to parse chat_intent for pre-fill", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    setHasCheckedIntent(true);
  }, [isSurveyChecking, hasCheckedIntent, logger]);

  // Handle redirect after login
  useEffect(() => {
    if (redirectAfterLogin) {
      setRedirectAfterLogin(null);
      router.push(redirectAfterLogin);
    }
  }, [redirectAfterLogin, setRedirectAfterLogin, router]);

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
          logger.debug("error", "Error fetching design systems:", { ...error });
          return;
        }
        setDesignSystems((data as DesignSystemRow[]) || []);
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

      const result = await createPrototype({
        design_style: designStyle,
        custom_design_system: customDesignSystemId ?? undefined,
        visibility: 'PUBLIC',
      });

      if (result.data) {
        setChatIntent(result.data.prototype_id, content, false);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await submitPrompt(prompt);
  };

  // Keydown handler for "Enter to send"
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Show loading state while checking survey
  if (isSurveyChecking) {
    return (
      <div className="relative min-h-screen text-black dark:text-white selection:bg-purple-500/30 font-sans flex items-center justify-center">
        <GridBackground />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-black dark:text-white selection:bg-purple-500/30 font-sans">
      <GridBackground />

      <div className="container mx-auto px-4 pt-24 pb-16 max-w-4xl relative z-10">
        {/* --- Header Section --- */}
        <div className="text-center mb-12 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* <div className="inline-flex items-center justify-center p-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 backdrop-blur-sm mb-4">
            <span className="px-3 py-1 text-xs font-medium text-black/70 dark:text-white/70 tracking-wide uppercase">
              AI Prototype Engine
            </span>
          </div> */}

          <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-black via-black to-black/60 dark:from-white dark:via-white dark:to-white/60">
            Build Your Ideas
          </h1>
          <p className="text-lg text-gray-600 dark:text-[#8A8F98] max-w-xl mx-auto font-light">
            Describe your mobile app, screen, or flow.{" "}
            <br className="hidden sm:block" />
            We will generate the React Native code instantly.
          </p>
        </div>

        {/* --- Main Input Console --- */}
        <div className="relative group animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
          {/* Glow Effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition duration-500"></div>

          <div className="relative bg-gray-50 dark:bg-[#141517] border border-black/10 dark:border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col transition-all duration-200 focus-within:border-black/20 dark:focus-within:border-white/20 focus-within:bg-gray-100 dark:focus-within:bg-[#18191B] focus-within:ring-1 focus-within:ring-black/5 dark:focus-within:ring-white/5">
            {/* Input Area */}
            <div className="px-5 pt-5">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your app logic, UI components, and design style..."
                className="w-full min-h-[140px] bg-transparent border-none text-lg text-black dark:text-white placeholder:text-black/20 dark:placeholder:text-white/20 resize-none focus-visible:ring-0 p-0 leading-relaxed"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {/* Toolbar / Action Bar */}
            <div className="px-4 py-3 mt-2 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/5 dark:border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              {/* Left: Configuration Tools (Desktop) */}
              <div className="hidden md:flex items-center gap-2">
                {/* Design Style Selector */}
                <Select
                  value={designStyle}
                  onValueChange={(value) =>
                    setDesignStyle(value as DesignStyle)
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-8 border-0 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white text-xs font-medium rounded-md transition-colors gap-2 w-auto min-w-[130px] focus:ring-0">
                    <SwatchIcon className="w-3.5 h-3.5" />
                    <SelectValue placeholder="Style" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#1A1B1E] border-black/10 dark:border-white/10 text-black dark:text-white">
                    {DESIGN_STYLE_OPTIONS.map((style) => (
                      <SelectItem
                        key={style}
                        value={style}
                        className="focus:bg-black/10 dark:focus:bg-white/10 focus:text-black dark:focus:text-white text-black/70 dark:text-white/70 cursor-pointer text-xs py-2"
                      >
                        {DESIGN_STYLE_LABELS[style]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Design System Selector */}
                {designSystems.length > 0 && (
                  <Select
                    value={customDesignSystemId ?? "none"}
                    onValueChange={(value) =>
                      setCustomDesignSystemId(value === "none" ? null : value)
                    }
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-8 border-0 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white text-xs font-medium rounded-md transition-colors gap-2 w-auto max-w-[180px] focus:ring-0">
                      <PaintBrushIcon className="w-3.5 h-3.5" />
                      <SelectValue placeholder="Design System" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#1A1B1E] border-black/10 dark:border-white/10 text-black dark:text-white">
                      <SelectItem
                        value="none"
                        className="focus:bg-black/10 dark:focus:bg-white/10 focus:text-black dark:focus:text-white text-black/70 dark:text-white/70 cursor-pointer text-xs py-2"
                      >
                        Default System
                      </SelectItem>
                      {designSystems.map((system) => (
                        <SelectItem
                          key={system.id}
                          value={String(system.id)}
                          className="focus:bg-black/10 dark:focus:bg-white/10 focus:text-black dark:focus:text-white text-black/70 dark:text-white/70 cursor-pointer text-xs py-2"
                        >
                          {system.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Left: Mobile Collapsible Tools */}
              <div className="md:hidden w-full">
                <Collapsible
                  open={showAdvancedOptions}
                  onOpenChange={setShowAdvancedOptions}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-between text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 text-xs px-2"
                    >
                      <span className="flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5" />
                        Configuration
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvancedOptions ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2 pb-1 animate-in slide-in-from-top-2">
                    {/* Mobile Selects */}
                    <div className="grid grid-cols-1 gap-2">
                      <Select
                        value={designStyle}
                        onValueChange={(v) => setDesignStyle(v as DesignStyle)}
                      >
                        <SelectTrigger className="h-9 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-black dark:text-white text-xs w-full">
                          <div className="flex items-center gap-2">
                            <SwatchIcon className="w-3.5 h-3.5" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-[#1A1B1E] border-black/10 dark:border-white/10 text-black dark:text-white">
                          {DESIGN_STYLE_OPTIONS.map((s) => (
                            <SelectItem
                              key={s}
                              value={s}
                              className="focus:bg-black/10 dark:focus:bg-white/10 text-black/80 dark:text-white/80 text-xs"
                            >
                              {DESIGN_STYLE_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {designSystems.length > 0 && (
                        <Select
                          value={customDesignSystemId ?? "none"}
                          onValueChange={(v) =>
                            setCustomDesignSystemId(v === "none" ? null : v)
                          }
                        >
                          <SelectTrigger className="h-9 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-black dark:text-white text-xs w-full">
                            <div className="flex items-center gap-2">
                              <PaintBrushIcon className="w-3.5 h-3.5" />
                              <SelectValue placeholder="Design System" />
                            </div>
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-[#1A1B1E] border-black/10 dark:border-white/10 text-black dark:text-white">
                            <SelectItem
                              value="none"
                              className="focus:bg-black/10 dark:focus:bg-white/10 text-black/80 dark:text-white/80 text-xs"
                            >
                              Default System
                            </SelectItem>
                            {designSystems.map((s) => (
                              <SelectItem
                                key={s.id}
                                value={String(s.id)}
                                className="focus:bg-black/10 dark:focus:bg-white/10 text-black/80 dark:text-white/80 text-xs"
                              >
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Right: Action Button */}
              <div className="flex items-center justify-between w-full md:w-auto gap-4">
                <div className="hidden md:flex items-center text-[10px] text-black/30 dark:text-white/30 font-medium gap-1 select-none">
                  <Command className="w-3 h-3" />
                  <span>ENTER</span>
                </div>

                <Button
                  onClick={() => handleSubmit()}
                  disabled={!prompt.trim() || isLoading}
                  className="w-full md:w-auto h-8 px-4 rounded-md bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold tracking-wide shadow-[0_0_20px_-5px_rgba(0,0,0,0.3)] dark:shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] transition-all"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      BUILDING...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-3 w-3" />
                      GENERATE
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Helper text underneath */}
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-600 dark:text-[#8A8F98] animate-in fade-in duration-1000 delay-300">
            <div className="flex items-center gap-1.5">
              <LayoutTemplate className="w-3.5 h-3.5 opacity-50" />
              <span>Components</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 opacity-50" />
              <span>Multi-step Flows</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 opacity-50" />
              <span>Whole Apps</span>
            </div>
          </div>
        </div>
      </div>

      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </div>
  );
}
