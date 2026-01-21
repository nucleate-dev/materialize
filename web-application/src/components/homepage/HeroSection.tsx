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
import { motion } from "framer-motion";
import { Globe, Lock, Paperclip, Share2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  usePrototypeVisibilityOptions,
  type PrototypeVisibility,
} from "@/hooks/usePrototypeVisibilityOptions";

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
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const [framework, setFramework] =
    useState<PrototypeFramework>(DEFAULT_FRAMEWORK);
  const [uploadedImages, setUploadedImages] = useState<ChatIntentImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visibilityOptions = usePrototypeVisibilityOptions();
  const [visibility, setVisibility] = useState<PrototypeVisibility>("PUBLIC");

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
        setChatIntent(undefined, content, false, imagesToSend);
        router.push("/login");
        return;
      }

      const result = await createPrototype({
        framework,
        creation_source: "landing_prompt",
        visibility,
      });

      if (result.data) {
        setChatIntent(result.data.prototype_id, content, false, imagesToSend);
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
      {/* Floating gradient orbs */}
      <motion.div
        animate={{ y: [0, -30, 0], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px] pointer-events-none"
      />
      <motion.div
        animate={{ y: [0, 20, 0], opacity: [0.2, 0.4, 0.2] }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-primary/15 rounded-full blur-[100px] pointer-events-none"
      />
      <motion.div
        animate={{ y: [0, -15, 0], x: [0, 10, 0] }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute top-1/2 right-1/3 w-[200px] h-[200px] bg-primary/10 rounded-full blur-[80px] pointer-events-none"
      />

      <div className="container mx-auto max-w-5xl w-full text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Badge
            variant="outline"
            className="mb-6 border-primary/30 bg-primary/10 text-primary px-4 py-1"
          >
            Prototyping for Production Teams
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-foreground mb-6"
        >
          The AI Design Engineer
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          Nucleate ingests your codebase&apos;s styles and components, so every
          prototype is on-brand. Explore variants quickly, then export real
          code.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
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
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Sparkles className="w-5 h-5 text-muted-foreground mt-1" />
              </motion.div>
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
                {suggestionChips.map((chip, index) => (
                  <motion.button
                    key={chip.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 + index * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setPrompt(chip.prompt)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {chip.label}
                  </motion.button>
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
                    onValueChange={(v) => setVisibility(v as PrototypeVisibility)}
                  >
                    <SelectTrigger className="h-9 w-32 border-border bg-accent text-xs">
                      <div className="flex items-center gap-1.5">
                        {visibility === "PUBLIC" && <Globe className="w-3 h-3" />}
                        {visibility === "TEAM" && <Share2 className="w-3 h-3" />}
                        {visibility === "SELF" && <Lock className="w-3 h-3" />}
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {visibilityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            {option.value === "PUBLIC" && <Globe className="w-3 h-3" />}
                            {option.value === "TEAM" && <Share2 className="w-3 h-3" />}
                            {option.value === "SELF" && <Lock className="w-3 h-3" />}
                            <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      ))}
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
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={handleSend}
                    disabled={!prompt.trim() || isLoading}
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-6"
                  >
                    {isLoading ? "Loading..." : "Create prototype"}
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </section>
  );
}
