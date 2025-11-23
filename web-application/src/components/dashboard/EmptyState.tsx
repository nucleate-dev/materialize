"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classNames";
import { FolderOpen, Layers, PenTool, Plus, Sparkles } from "lucide-react";
import React from "react";

interface EmptyStateProps {
  type: "folders" | "prototypes" | "whiteboards";
  title?: string;
  description?: string;
  buttonText?: string;
  onButtonClick?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  description,
  buttonText,
  onButtonClick,
}) => {
  // Customizing visual style per type to match the reference "Bento Grid" aesthetic
  const defaultContent = {
    folders: {
      title: "No folders yet",
      description: "Create your first folder to start organizing your work.",
      buttonText: "Create Folder",
      icon: FolderOpen,
      glowColor: "bg-blue-500/20",
      iconColor: "text-blue-400",
    },
    prototypes: {
      title: "No projects yet",
      description: "Create your first project to start prototyping your ideas.",
      buttonText: "Create Project",
      icon: Layers,
      glowColor: "bg-indigo-500/20",
      iconColor: "text-indigo-400",
    },
    whiteboards: {
      title: "No whiteboards yet",
      description: "Create your first infinite canvas to start designing.",
      buttonText: "Create Whiteboard",
      icon: PenTool,
      glowColor: "bg-purple-500/20",
      iconColor: "text-purple-400",
    },
  };

  const content = defaultContent[type];
  const finalTitle = title || content.title;
  const finalDescription = description || content.description;
  const finalButtonText = buttonText || content.buttonText;
  const IconComponent = content.icon;

  return (
    <div className="relative w-full flex flex-col items-center justify-center p-8 md:p-12 text-center overflow-hidden rounded-3xl">

      {/* Background Glow Effect (Subtle) */}
      <div className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 blur-[100px] rounded-full pointer-events-none opacity-50", content.glowColor)} />

      {/* Icon Container */}
      <div className="relative group mb-6">
        {/* Animated border glow on hover */}
        <div className="absolute -inset-0.5 bg-gradient-to-b from-black/10 dark:from-white/20 to-transparent rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />

        <div className="relative w-16 h-16 bg-white dark:bg-[#141517] border border-black/10 dark:border-white/10 rounded-2xl flex items-center justify-center shadow-2xl">
          <div className="absolute inset-0 opacity-20 rounded-2xl" />
          <IconComponent className={cn("w-6 h-6 relative z-10", content.iconColor)} />
        </div>

        {/* Floating decorative sparkle */}
        <div className="absolute -top-2 -right-2 bg-white dark:bg-[#141517] border border-black/10 dark:border-white/10 p-1.5 rounded-lg transform rotate-12 shadow-lg">
          <Sparkles className="w-3 h-3 text-yellow-500/80" />
        </div>
      </div>

      {/* Text Content */}
      <div className="relative z-10 max-w-sm mx-auto space-y-3">
        <h3 className="text-xl font-medium text-gray-900 dark:text-white tracking-tight">
          {finalTitle}
        </h3>

        <p className="text-gray-600 dark:text-[#8A8F98] text-sm leading-relaxed">
          {finalDescription}
        </p>
      </div>

      {/* Action Button */}
      {onButtonClick && (
        <div className="relative z-10 mt-8">
          <Button
            onClick={onButtonClick}
            className="h-10 px-6 rounded-full bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 border-0 font-semibold text-sm shadow-[0_0_20px_-5px_rgba(0,0,0,0.3)] dark:shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-4 h-4 mr-2" />
            {finalButtonText}
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmptyState;