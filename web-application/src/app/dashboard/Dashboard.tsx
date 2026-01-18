"use client";

import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveTeam } from "@/contexts/TeamContext";
import { VIEWER_ROLE_RESTRICTION_MESSAGE } from "@/GlobalConstants";
import { useCreatePrototype } from "@/hooks/useCreatePrototype";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { redirectAfterLoginAtom } from "@/lib/atoms/sidebar";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { type PrototypeVisibility } from "@/lib/types/prototypes";
import { Database } from "@/lib/types/supabase";
import {
  setChatIntent,
  type ChatIntentImage,
} from "@/lib/utils/chatIntentUtils";
import { checkSurveyCompleted } from "@/lib/utils/survey/SurveyUtils";
import { Palette } from "lucide-react";
import { useAtom } from "jotai";
import {
  ChevronDown,
  Command,
  Cpu,
  Globe,
  Layers,
  LayoutTemplate,
  Loader2,
  Lock,
  Paperclip,
  Rocket,
  Share2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react"; // Kept Lucide
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// --- Types ---
type DesignStyle = Database["public"]["Enums"]["design_style"];
type PrototypeFramework = Database["public"]["Enums"]["prototype_framework"];

const DESIGN_STYLE_OPTIONS: DesignStyle[] = ["stylesheets", "nativewind"];
const WEB_DESIGN_STYLE_OPTIONS: DesignStyle[] = ["stylesheets"];

const DESIGN_STYLE_LABELS: Partial<Record<DesignStyle, string>> = {
  nativewind: "NativeWind",
  stylesheets: "React Native StyleSheet",
  custom: "Custom",
};

const WEB_DESIGN_STYLE_LABELS: Partial<Record<DesignStyle, string>> = {
  stylesheets: "Tailwind + Shadcn",
};

const DEFAULT_FRAMEWORK: PrototypeFramework = "web_nextjs_react";
const PLATFORM_OPTIONS: Array<{
  value: PrototypeFramework;
  label: string;
}> = [
  { value: "web_nextjs_react", label: "Web" },
  { value: "mobile_expo_react_native", label: "Mobile" },
];

export default function DashboardPage() {
  // --- Logic / Hooks (Preserved) ---
  const logger = useProductLogger();
  const { createPrototype } = useCreatePrototype();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const { activeTeam, currentUserMembership } = useActiveTeam();
  const { userPlan } = useSubscriptionAccess();
  const [redirectAfterLogin, setRedirectAfterLogin] = useAtom(
    redirectAfterLoginAtom,
  );
  const [designStyle, setDesignStyle] = useState<DesignStyle>("stylesheets");
  const [framework, setFramework] =
    useState<PrototypeFramework>(DEFAULT_FRAMEWORK);
  const [visibility, setVisibility] = useState<PrototypeVisibility>("PUBLIC");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [isSurveyChecking, setIsSurveyChecking] = useState(true);
  const [hasCheckedIntent, setHasCheckedIntent] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<ChatIntentImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isWebFrameworkSelected = framework === "web_nextjs_react";

  // Check if team is on free plan
  const isFreePlan = userPlan === "free";
  const availableDesignStyles = isWebFrameworkSelected
    ? WEB_DESIGN_STYLE_OPTIONS
    : DESIGN_STYLE_OPTIONS;
  const getDesignStyleLabel = (style: DesignStyle): string => {
    if (isWebFrameworkSelected) {
      return (
        WEB_DESIGN_STYLE_LABELS[style] ?? DESIGN_STYLE_LABELS[style] ?? style
      );
    }
    return DESIGN_STYLE_LABELS[style] ?? style;
  };

  // Check if user is a viewer (no edit privileges)
  const isViewer = currentUserMembership?.role === "viewer";

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

  useEffect(() => {
    if (framework === "web_nextjs_react" && designStyle !== "stylesheets") {
      setDesignStyle("stylesheets");
    }
  }, [framework, designStyle]);

  // Process image files
  const processImageFiles = (files: File[]) => {
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(
          `Invalid file type: ${file.name}. Only images are supported.`,
        );
        return;
      }

      if (file.size > 3 * 1024 * 1024) {
        toast.error(`Image too large: ${file.name}. Maximum size is 3MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(",")[1];

        setUploadedImages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            base64: base64Data,
            mediaType: file.type,
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    processImageFiles(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processImageFiles(files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      processImageFiles(imageFiles);
    }
  };

  const removeImage = (imageId: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  const submitPrompt = async (message: string) => {
    const content = message.trim();
    if (!content || isLoading) return;

    setIsLoading(true);
    logger.log({
      event: "client_dashboard_prompt_submitted",
      properties: {
        framework,
        design_style: designStyle,
        has_user: Boolean(user?.id),
        source: "dashboard_prompt",
      },
    });

    const imagesToSend = uploadedImages.length > 0 ? uploadedImages : undefined;

    try {
      if (!user?.id) {
        setChatIntent(undefined, content, false, imagesToSend);
        router.push("/login");
        return;
      }

      const result = await createPrototype({
        design_style: designStyle,
        visibility,
        framework,
        creation_source: "dashboard_prompt",
      });

      if (result.data) {
        logger.log({
          event: "client_dashboard_prototype_creation_success",
          properties: {
            prototype_id: result.data.prototype_id,
            framework,
            design_style: designStyle,
            source: "dashboard_prompt",
          },
        });
        setChatIntent(result.data.prototype_id, content, false, imagesToSend);
        setUploadedImages([]);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        logger.log({
          event: "client_dashboard_prototype_limit_hit",
          properties: {
            framework,
            design_style: designStyle,
            source: "dashboard_prompt",
          },
        });
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
      <div className="relative min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans">
      <div className="container mx-auto px-4 pt-24 pb-16 max-w-4xl relative z-10">
        {/* --- Header Section --- */}
        <div className="text-center mb-12 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* <div className="inline-flex items-center justify-center p-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 backdrop-blur-sm mb-4">
            <span className="px-3 py-1 text-xs font-medium text-black/70 dark:text-white/70 tracking-wide uppercase">
              AI Prototype Engine
            </span>
          </div> */}

          <h1 className="text-4xl md:text-6xl font-serif font-medium tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-foreground via-foreground to-foreground/60 pb-2">
            Make your ideas real
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto font-light">
            Describe your app, screen, or flow.{" "}
            <br className="hidden sm:block" />
          </p>
        </div>

        {/* --- Main Input Console --- */}
        <div
          className="relative group animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag Overlay */}
          {isDragOver && (
            <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm z-50 flex items-center justify-center border-2 border-dashed border-primary rounded-xl pointer-events-none">
              <div className="bg-background/90 rounded-2xl px-8 py-6 shadow-2xl border border-primary/20">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                    <Paperclip className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-foreground mb-1">
                      Drop images here
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upload images to attach to your message
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Glow Effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition duration-500"></div>

          <div className="relative bg-card border border-border rounded-xl overflow-hidden shadow-2xl flex flex-col transition-all duration-200 focus-within:border-primary/30 focus-within:bg-muted focus-within:ring-1 focus-within:ring-primary/10">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />

            {/* Input Area */}
            <div className="px-5 pt-5">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Describe your app logic, UI components, and design style..."
                className="w-full min-h-[140px] bg-transparent border-none text-lg text-foreground placeholder:text-muted-foreground/50 resize-none focus-visible:ring-0 p-0 leading-relaxed"
                disabled={isLoading}
                autoFocus
              />

              {/* Uploaded Images Preview */}
              {uploadedImages.length > 0 && (
                <div className="flex gap-2 mt-3 pb-2 overflow-x-auto">
                  {uploadedImages.map((image) => (
                    <div key={image.id} className="relative group/img shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:${image.mediaType};base64,${image.base64}`}
                        alt={image.name}
                        className="h-16 w-16 object-cover rounded-md border border-border"
                      />
                      <button
                        onClick={() => removeImage(image.id)}
                        className="absolute -top-1.5 -right-1.5 bg-background text-muted-foreground rounded-full p-0.5 border border-border shadow-sm opacity-0 group-hover/img:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Toolbar / Action Bar */}
            <div className="px-4 py-3 mt-2 bg-muted/50 border-t border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              {/* Left: Configuration Tools (Desktop) */}
              <div className="hidden md:flex items-center gap-2">
                <Select
                  value={framework}
                  onValueChange={(value) =>
                    setFramework(value as PrototypeFramework)
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-8 border-0 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-md transition-colors gap-2 w-auto min-w-[120px] focus:ring-0">
                    <Rocket className="w-3.5 h-3.5" />
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    {PLATFORM_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="focus:bg-accent focus:text-accent-foreground text-muted-foreground cursor-pointer text-xs py-2"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Design Style Selector */}
                <Select
                  value={designStyle}
                  onValueChange={(value) =>
                    setDesignStyle(value as DesignStyle)
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-8 border-0 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-md transition-colors gap-2 w-auto min-w-[130px] focus:ring-0">
                    <Palette className="w-3.5 h-3.5" />
                    <SelectValue placeholder="Style" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    {availableDesignStyles.map((style) => (
                      <SelectItem
                        key={style}
                        value={style}
                        className="focus:bg-accent focus:text-accent-foreground text-muted-foreground cursor-pointer text-xs py-2"
                      >
                        {getDesignStyleLabel(style)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Visibility Selector */}
                <Select
                  value={visibility}
                  onValueChange={(value) => {
                    const nextVisibility = value as PrototypeVisibility;

                    // Check if trying to select a locked option
                    if (
                      isFreePlan &&
                      (nextVisibility === "SELF" || nextVisibility === "TEAM")
                    ) {
                      setShowUpsellModal(true);
                      return;
                    }

                    setVisibility(nextVisibility);
                  }}
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-8 border-0 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-md transition-colors gap-2 w-auto min-w-[120px] focus:ring-0">
                    <Share2 className="w-3.5 h-3.5" />
                    <SelectValue placeholder="Visibility" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    <SelectItem
                      value="PUBLIC"
                      className="focus:bg-accent focus:text-accent-foreground text-muted-foreground cursor-pointer text-xs py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5" />
                        <span>Public</span>
                      </div>
                    </SelectItem>
                    {activeTeam && (
                      <SelectItem
                        value="TEAM"
                        className="focus:bg-accent focus:text-accent-foreground text-muted-foreground cursor-pointer text-xs py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Share2 className="w-3.5 h-3.5" />
                          <span>{activeTeam.name}</span>
                          {isFreePlan && (
                            <Lock className="w-3 h-3 text-muted-foreground/50 ml-auto" />
                          )}
                        </div>
                      </SelectItem>
                    )}
                    <SelectItem
                      value="SELF"
                      className="focus:bg-accent focus:text-accent-foreground text-muted-foreground cursor-pointer text-xs py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Private</span>
                        {isFreePlan && (
                          <Lock className="w-3 h-3 text-muted-foreground/50 ml-auto" />
                        )}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
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
                      className="h-8 w-full justify-between text-muted-foreground hover:text-foreground text-xs px-2"
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
                        value={framework}
                        onValueChange={(value) =>
                          setFramework(value as PrototypeFramework)
                        }
                        disabled={isLoading}
                      >
                        <SelectTrigger className="h-9 border-border bg-secondary text-secondary-foreground text-xs w-full">
                          <div className="flex items-center gap-2">
                            <Rocket className="w-3.5 h-3.5" />
                            <SelectValue placeholder="Platform" />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border text-popover-foreground">
                          {PLATFORM_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="focus:bg-accent focus:text-accent-foreground text-muted-foreground text-xs"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={designStyle}
                        onValueChange={(v) => setDesignStyle(v as DesignStyle)}
                        disabled={isLoading}
                      >
                        <SelectTrigger className="h-9 border-border bg-secondary text-secondary-foreground text-xs w-full">
                          <div className="flex items-center gap-2">
                            <Palette className="w-3.5 h-3.5" />
                            <SelectValue placeholder="Style" />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border text-popover-foreground">
                          {availableDesignStyles.map((s) => (
                            <SelectItem
                              key={s}
                              value={s}
                              className="focus:bg-accent focus:text-accent-foreground text-muted-foreground text-xs"
                            >
                              {getDesignStyleLabel(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Visibility Selector */}
                      <Select
                        value={visibility}
                        onValueChange={(v) => {
                          const nextVisibility = v as PrototypeVisibility;

                          // Check if trying to select a locked option
                          if (
                            isFreePlan &&
                            (nextVisibility === "SELF" ||
                              nextVisibility === "TEAM")
                          ) {
                            setShowUpsellModal(true);
                            return;
                          }

                          setVisibility(nextVisibility);
                        }}
                        disabled={isLoading}
                      >
                        <SelectTrigger className="h-9 border-border bg-secondary text-secondary-foreground text-xs w-full">
                          <div className="flex items-center gap-2">
                            <Share2 className="w-3.5 h-3.5" />
                            <SelectValue placeholder="Visibility" />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border text-popover-foreground">
                          <SelectItem
                            value="PUBLIC"
                            className="focus:bg-accent focus:text-accent-foreground text-muted-foreground text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5" />
                              <span>Public</span>
                            </div>
                          </SelectItem>
                          {activeTeam && (
                            <SelectItem
                              value="TEAM"
                              className="focus:bg-accent focus:text-accent-foreground text-muted-foreground text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <Share2 className="w-3.5 h-3.5" />
                                <span>{activeTeam.name}</span>
                                {isFreePlan && (
                                  <Lock className="w-3 h-3 text-muted-foreground/50 ml-auto" />
                                )}
                              </div>
                            </SelectItem>
                          )}
                          <SelectItem
                            value="SELF"
                            className="focus:bg-accent focus:text-accent-foreground text-muted-foreground text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <Lock className="w-3.5 h-3.5" />
                              <span>Private</span>
                              {isFreePlan && (
                                <Lock className="w-3 h-3 text-muted-foreground/50 ml-auto" />
                              )}
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Right: Action Button */}
              <div className="flex items-center justify-between w-full md:w-auto gap-4">
                {/* Attach Image Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                      >
                        <Paperclip className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Attach Images</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="hidden md:flex items-center text-[10px] text-muted-foreground/50 font-medium gap-1 select-none">
                  <Command className="w-3 h-3" />
                  <span>ENTER</span>
                </div>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full md:w-auto">
                        <Button
                          onClick={() => handleSubmit()}
                          disabled={!prompt.trim() || isLoading || isViewer}
                          className="w-full md:w-auto h-8 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold tracking-wide shadow-lg shadow-primary/25 transition-all"
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
                    </TooltipTrigger>
                    {isViewer && (
                      <TooltipContent>
                        <p>{VIEWER_ROLE_RESTRICTION_MESSAGE}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* Helper text underneath */}
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground animate-in fade-in duration-1000 delay-300">
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
        reason="visibility_restriction"
      />
    </div>
  );
}
