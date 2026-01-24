"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classNames";
import {
  ArrowUpRight,
  Eye,
  FileBox,
  Folder,
  Globe,
  Layout,
  Loader2,
  Lock,
  Monitor,
  MoreHorizontal,
  Pencil,
  Smartphone,
  Users,
} from "lucide-react";
import React from "react";

export interface ThumbnailCardProps {
  name: string;
  thumbnailUrl: string | null;
  lastModified?: string;
  type: "folder" | "prototype" | "canvas";
  framework?: string | null;
  visibility?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerAvatarUrl?: string | null;
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
  visibility,
  ownerName,
  ownerEmail,
  ownerAvatarUrl,
  onClick,
  onView,
  onEdit,
  onSettings,
  loading = false,
}) => {
  // Logic to handle backward compatibility
  const handleEdit = onEdit || onClick;

  // Determine if mobile or web
  const isMobile = framework?.startsWith("mobile_");

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

  // Get visibility config for prototypes
  const getVisibilityConfig = () => {
    switch (visibility) {
      case "PUBLIC":
        return {
          label: "Public",
          icon: Globe,
          className: "bg-green-500/10 text-green-600 border-green-500/20",
        };
      case "TEAM_SUBSET":
      case "TEAM":
        return {
          label: "Team",
          icon: Users,
          className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
        };
      case "SELF":
      default:
        return {
          label: "Private",
          icon: Lock,
          className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
        };
    }
  };

  const {
    label: typeLabel,
    icon: TypeIcon,
    color: typeColor,
  } = getTypeConfig();
  const visibilityConfig = getVisibilityConfig();
  const VisibilityIcon = visibilityConfig.icon;
  const EditIcon = type === "folder" ? ArrowUpRight : Pencil;
  const editLabel = type === "folder" ? "Open" : "Edit";

  return (
    <div className="group relative rounded-xl border border-border bg-card p-3 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)] hover:-translate-y-1 hover:shadow-xl hover:border-primary/20">
      {/* Loading State */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-40 rounded-xl">
          <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin mb-2" />
          <span className="text-xs text-muted-foreground font-medium">
            Loading...
          </span>
        </div>
      )}

      {/* Settings Menu - positioned absolutely in top-right corner */}
      {onSettings && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      )}

      {/* Thumbnail Container - 4:3 aspect ratio */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted/30 ring-1 ring-black/5">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50/50 to-zinc-100/50 dark:from-zinc-950/20 dark:to-background">
          {thumbnailUrl ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl}
                alt={name}
                className={cn(
                  "shadow-2xl rounded-[4px] object-cover transition-transform duration-500 group-hover:scale-105",
                  isMobile ? "h-[85%] w-auto" : "w-full h-full"
                )}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <TypeIcon className="w-16 h-16 text-foreground/10" />
            </div>
          )}
        </div>

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {/* View Button */}
          {onView && (
            <Button
              variant="secondary"
              size="sm"
              className="translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 delay-75"
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
              className="translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 delay-100 bg-primary text-primary-foreground hover:bg-primary/90"
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

      {/* Footer Info */}
      <div className="mt-3 px-1 space-y-1">
        {/* Title Row with Visibility Badge (for prototypes) */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-[15px] text-foreground tracking-tight group-hover:text-primary transition-colors truncate">
            {name}
          </h3>

          {/* Visibility Badge for prototypes, Type Indicator for others */}
          {type === "prototype" && visibility ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium uppercase tracking-wider shrink-0",
                visibilityConfig.className
              )}
            >
              <VisibilityIcon className="w-3 h-3" />
              {visibilityConfig.label}
            </span>
          ) : (
            <div
              className={cn(
                "flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted border border-border",
                typeColor
              )}
            >
              <TypeIcon className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{typeLabel}</span>
            </div>
          )}
        </div>

        {/* Metadata Row */}
        <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
          {/* Owner with Avatar (for prototypes) */}
          {type === "prototype" && (ownerName || ownerEmail) && (
            <div className="flex items-center gap-2 truncate">
              {/* Avatar */}
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-[10px] font-medium text-primary-foreground shrink-0 overflow-hidden">
                {ownerAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ownerAvatarUrl}
                    alt={ownerName || ownerEmail || "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (ownerName || ownerEmail || "U").charAt(0).toUpperCase()
                )}
              </div>
              <span className="truncate">{ownerName || ownerEmail}</span>
            </div>
          )}

          {/* Last Modified */}
          {lastModified && (
            <span className="shrink-0 tabular-nums">{lastModified}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThumbnailCard;
