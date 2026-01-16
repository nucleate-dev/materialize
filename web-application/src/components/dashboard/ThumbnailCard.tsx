"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classNames";
import {
  ArrowUpRight,
  Calendar,
  Eye,
  FileBox,
  Folder,
  Layout,
  Loader2,
  Monitor,
  MoreHorizontal,
  Pencil,
  Smartphone,
} from "lucide-react";
import React from "react";

export interface ThumbnailCardProps {
  name: string;
  thumbnailUrl: string | null;
  lastModified?: string;
  type: "folder" | "prototype" | "canvas";
  framework?: string | null;
  onClick?: () => void;
  onView?: () => void;
  onEdit?: () => void;
  onSettings?: () => void;
  loading?: boolean;
}

const ThumbnailCard: React.FC<ThumbnailCardProps> = ({
  name,
  thumbnailUrl,
  lastModified,
  type,
  framework,
  onClick,
  onView,
  onEdit,
  onSettings,
  loading = false,
}) => {
  // Logic to handle backward compatibility
  const handleEdit = onEdit || onClick;

  // Map types to Icons and Colors for a richer visual
  const getTypeConfig = () => {
    switch (type) {
      case "folder":
        return {
          label: "Folder",
          icon: Folder,
          color: "text-info",
          bg: "bg-info/10",
        };
      case "prototype":
        // Determine icon based on framework
        const isMobile = framework?.startsWith("mobile_");
        return {
          label: "Project",
          icon: isMobile ? Smartphone : Monitor,
          color: "text-success",
          bg: "bg-success/10",
        };
      case "canvas":
        return {
          label: "Canvas",
          icon: Layout,
          color: "text-primary",
          bg: "bg-primary/10",
        };
      default:
        return {
          label: "Item",
          icon: FileBox,
          color: "text-muted-foreground",
          bg: "bg-muted",
        };
    }
  };

  const {
    label: typeLabel,
    icon: TypeIcon,
    color: typeColor,
  } = getTypeConfig();
  const EditIcon = type === "folder" ? ArrowUpRight : Pencil;
  const editLabel = type === "folder" ? "Open" : "Edit";

  return (
    <div
      className="group relative flex flex-col gap-3 cursor-pointer select-none active:scale-[0.98] transition-transform"
      onClick={handleEdit}
    >
      {/* --- Thumbnail Area --- */}
      <div className="relative aspect-[9/16] w-full rounded-xl border border-border bg-muted overflow-hidden transition-all duration-300 group-hover:border-border/80 group-hover:shadow-md">
        {/* Loading State */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted z-20">
            <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin mb-2" />
            <span className="text-xs text-muted-foreground font-medium">
              Loading...
            </span>
          </div>
        )}

        {/* Image / Placeholder */}
        {thumbnailUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt={name}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-background/0 transition-colors duration-300 group-hover:bg-background/40" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-foreground/10 to-transparent flex items-center justify-center">
            <TypeIcon className="w-12 h-12 text-foreground/20 group-hover:text-foreground/30 transition-colors duration-300" />
          </div>
        )}

        {/* Settings Button (Top Right) */}
        {onSettings && (
          <div
            className="absolute top-2 right-2 z-30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onSettings();
            }}
          >
            <button className="p-1.5 rounded-md bg-card/80 backdrop-blur-md text-foreground/80 hover:text-foreground hover:bg-card active:bg-card/90 border border-border transition-all">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* --- Interaction Overlay (Bottom) --- */}
        <div className="absolute inset-0 flex items-end justify-center p-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
          <div className="flex items-center gap-2 w-full pointer-events-auto">
            {/* View Button */}
            {onView && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-8 bg-muted/90 hover:bg-muted active:bg-muted/70 text-foreground backdrop-blur-md border border-border rounded-lg text-xs font-medium transition-all transform translate-y-0 sm:translate-y-2 sm:group-hover:translate-y-0 duration-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
              >
                <Eye className="w-3.5 h-3.5 mr-2" />
                View
              </Button>
            )}

            {/* Edit/Main Button */}
            {handleEdit && (
              <Button
                size="sm"
                className={cn(
                  "flex-1 h-8 text-xs font-medium rounded-lg shadow-lg transition-all transform translate-y-0 sm:translate-y-2 sm:group-hover:translate-y-0 duration-300 delay-75",
                  // Primary style
                  "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 border-0",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
              >
                <EditIcon className="w-3.5 h-3.5 mr-2" />
                {editLabel}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* --- Info Section --- */}
      <div className="flex flex-col px-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm text-foreground/90 truncate group-hover:text-foreground transition-colors">
            {name}
          </h3>
          {/* Type Indicator (Pill) */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted border border-border",
              typeColor,
            )}
          >
            <TypeIcon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{typeLabel}</span>
          </div>
        </div>

        {/* Metadata */}
        {lastModified && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3 opacity-70" />
            <span>{lastModified}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThumbnailCard;
