"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/classNames";
import { FolderOpen, Layers, PenTool, Plus } from "lucide-react";
import React from "react";

interface EmptyStateProps {
  type: "projects" | "prototypes" | "whiteboards";
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
  // Default content based on type
  const defaultContent = {
    projects: {
      title: "No folders yet",
      description:
        "Create your first folder to start organizing your work at the speed of thought.",
      buttonText: "Create First Folder",
      icon: FolderOpen,
      gradient:
        "from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30",
      iconColor: "text-primary dark:text-primary",
    },
    prototypes: {
      title: "No projects yet",
      description:
        "Create your first project to start prototyping your ideas at the speed of thought.",
      buttonText: "Create First Project",
      icon: Layers,
      gradient:
        "from-success/20 to-info/20 dark:from-success/30 dark:to-info/30",
      iconColor: "text-success dark:text-success",
    },
    whiteboards: {
      title: "No whiteboards yet",
      description:
        "Create your first infinite canvas to start prototyping and designing at the speed of thought.",
      buttonText: "Create First Whiteboard",
      icon: PenTool,
      gradient:
        "from-warning/20 to-primary/20 dark:from-warning/30 dark:to-primary/30",
      iconColor: "text-warning dark:text-warning",
    },
  };

  const content = defaultContent[type];
  const finalTitle = title || content.title;
  const finalDescription = description || content.description;
  const finalButtonText = buttonText || content.buttonText;
  const IconComponent = content.icon;

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20">
      <Card className="border-dashed border-2 border-border/50 bg-background/80 backdrop-blur-sm max-w-lg w-full">
        <CardContent className="flex flex-col items-center text-center p-12">
          <div
            className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br",
              content.gradient,
            )}
          >
            <IconComponent className={cn("w-10 h-10", content.iconColor)} />
          </div>

          <h3 className="text-2xl font-semibold text-black dark:text-white mb-3">
            {finalTitle}
          </h3>

          <p className="text-body dark:text-bodydark mb-8 leading-relaxed">
            {finalDescription}
          </p>

          {onButtonClick && (
            <Button
              onClick={onButtonClick}
              size="lg"
              className="shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              {finalButtonText}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmptyState;
