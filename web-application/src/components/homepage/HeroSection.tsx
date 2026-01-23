"use client";

import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import {
  setChatIntent,
  type ChatIntentImage,
} from "@/lib/utils/chatIntentUtils";
import { Lock, Paperclip, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { usePrototypeVisibilityOptions } from "@/hooks/usePrototypeVisibilityOptions";

type PrototypeFramework = Database["public"]["Enums"]["prototype_framework"];

const DEFAULT_FRAMEWORK: PrototypeFramework = "web_nextjs_react";
const PLATFORM_OPTIONS: Array<{
  value: PrototypeFramework;
  label: string;
}> = [
  { value: "web_nextjs_react", label: "Web" },
  { value: "mobile_expo_react_native", label: "Mobile" },
];

/**
 * HERO SECTION - Client Component
 * Interactive form with file upload, framework selection, and prompt submission
 */
export default function HeroSection() {
  const logger = useProductLogger();
  const { createPrototype } = useCreatePrototype();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const [framework, setFramework] =
    useState<PrototypeFramework>(DEFAULT_FRAMEWORK);
  const [uploadedImages, setUploadedImages] = useState<ChatIntentImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    visibilityOptions,
    visibility,
    handleVisibilityChange,
    showUpsellModal,
    setShowUpsellModal,
  } = usePrototypeVisibilityOptions();

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

  // Keydown handler for "Enter to send"
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const removeImage = (imageId: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  const handleSend = async () => {
    const content = prompt.trim();
    if (!content || isLoading) return;

    setIsLoading(true);
    logger.log({
      event: "client_landing_prompt_submitted",
      properties: {
        has_user: Boolean(user?.id),
        framework,
        source: "landing_hero",
      },
    });

    const imagesToSend = uploadedImages.length > 0 ? uploadedImages : undefined;

    try {
      if (!user?.id) {
        setChatIntent(undefined, content, false, visibility, imagesToSend);
        router.push("/login");
        return;
      }

      const result = await createPrototype({
        framework,
        creation_source: "landing_prompt",
        visibility,
      });

      if (result.data) {
        setChatIntent(result.data.prototype_id, content, false, visibility, imagesToSend);
        setUploadedImages([]);
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        setShowUpsellModal(true);
      }
    } catch (err) {
      logger.debug("error", "Error creating prototype", { error: err });
    } finally {
      setIsLoading(false);
    }
  };

  const suggestionChips = [
    {
      label: "Paywall variant",
      prompt:
        "Personal health dashboard. Widgets for heart rate graph, sleep quality score with moon icon, daily caloric intake vs burn, hydration water level tracker, and recovery battery percentage. Activity rings and step counter.\n\nCreate also the other screens.\n\nMobile dashboard, Bento Grid layout, Soft Neo-Brutalism. Dark mode, deep charcoal background, rounded cards with vivid pastel accents (salmon, periwinkle, yellow). Bold all-caps sans-serif typography, modular fintech SaaS aesthetic with high contrast.",
    },
    {
      label: "Onboarding",
      prompt:
        "Personal health dashboard. Widgets for heart rate graph, sleep quality score with moon icon, daily caloric intake vs burn, hydration water level tracker, and recovery battery percentage. Activity rings and step counter.\n\nCreate also the other screens.\n\nMobile dashboard, Bento Grid layout, Soft Neo-Brutalism. Dark mode, deep charcoal background, rounded cards with vivid pastel accents (salmon, periwinkle, yellow). Bold all-caps sans-serif typography, modular fintech SaaS aesthetic with high contrast.",
    },
    {
      label: "Landing Page",
      prompt:
        "Personal health dashboard. Widgets for heart rate graph, sleep quality score with moon icon, daily caloric intake vs burn, hydration water level tracker, and recovery battery percentage. Activity rings and step counter.\n\nCreate also the other screens.\n\nMobile dashboard, Bento Grid layout, Soft Neo-Brutalism. Dark mode, deep charcoal background, rounded cards with vivid pastel accents (salmon, periwinkle, yellow). Bold all-caps sans-serif typography, modular fintech SaaS aesthetic with high contrast.",
    },
  ];

  return (
    <section className="relative min-h-[85vh] flex flex-col justify-center px-6 pt-20 pb-12 overflow-hidden">
      {/* Static gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-40" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-primary/15 rounded-full blur-[100px] pointer-events-none opacity-30" />

      <div className="container mx-auto max-w-5xl w-full text-center relative z-10">
        <Badge
          variant="outline"
          className="mb-6 border-primary/30 bg-primary/10 text-primary px-4 py-1"
        >
          Prototyping for Production Teams
        </Badge>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-foreground mb-6">
          The AI Design Engineer
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
          Go from idea to working prototype in minutes, always on-brand with
          your design system. Explore variants quickly, iterate with real
          interactions, and ship to your codebase when ready.
        </p>

        <div
          className="max-w-3xl mx-auto relative group"
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

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />

          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-primary/20 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative bg-card border border-border rounded-xl overflow-hidden shadow-2xl flex flex-col focus-within:border-primary/30">
            <div className="px-4 pt-4 flex gap-3">
              <Sparkles className="w-5 h-5 text-muted-foreground mt-1" />
              <div className="flex-1 flex flex-col">
                <Textarea
                  placeholder="Describe a screen or flow you want to prototype..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-lg text-foreground placeholder:text-muted-foreground border-none p-0 focus-visible:ring-0 resize-none min-h-[80px]"
                />

                {/* Uploaded Images Preview */}
                {uploadedImages.length > 0 && (
                  <div className="flex gap-2 mt-3 pb-2 overflow-x-auto">
                    {uploadedImages.map((image) => (
                      <div
                        key={image.id}
                        className="relative group/img shrink-0"
                      >
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
            </div>
            <div className="px-4 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border mt-2 pt-2 bg-accent/50">
              <div className="flex gap-4 items-center">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                  Try:
                </span>
                {suggestionChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => setPrompt(chip.prompt)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {/* Attach Image Button */}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                {/* Visibility Selector - Only show if user is logged in */}
                {user && (
                  <Select
                    value={visibility}
                    onValueChange={handleVisibilityChange}
                  >
                    <SelectTrigger className="h-9 w-32 border-border bg-accent text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {visibilityOptions.map((option) => {
                        const Icon = option.icon;
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="w-3 h-3" />
                              <span>{option.label}</span>
                              {option.isLocked && (
                                <Lock className="w-3 h-3 text-muted-foreground/50 ml-auto" />
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
                <Select
                  value={framework}
                  onValueChange={(v) => setFramework(v as PrototypeFramework)}
                >
                  <SelectTrigger className="h-9 w-32 border-border bg-accent text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {PLATFORM_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleSend}
                  disabled={!prompt.trim() || isLoading}
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-6"
                >
                  {isLoading ? "Loading..." : "Create prototype"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </section>
  );
}
