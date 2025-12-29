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
          color: "text-blue-400",
          bg: "bg-blue-400/10",
        };
      case "prototype":
        // Determine icon based on framework
        const isMobile = framework?.startsWith("mobile_");
        return {
          label: "Project",
          icon: isMobile ? Smartphone : Monitor,
          color: "text-emerald-400",
          bg: "bg-emerald-400/10",
        };
      case "canvas":
        return {
          label: "Canvas",
          icon: Layout,
          color: "text-orange-400",
          bg: "bg-orange-400/10",
        };
      default:
        return {
          label: "Item",
          icon: FileBox,
          color: "text-gray-400",
          bg: "bg-gray-400/10",
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
      className="group relative flex flex-col gap-3 cursor-pointer select-none"
      onClick={handleEdit}
    >
      {/* --- Thumbnail Area --- */}
      <div className="relative aspect-[9/16] w-full rounded-xl border border-black/10 dark:border-white/10 bg-gray-100 dark:bg-[#141517] overflow-hidden transition-all duration-300 group-hover:border-black/20 dark:group-hover:border-white/20 group-hover:shadow-[0_0_20px_-10px_rgba(0,0,0,0.1)] dark:group-hover:shadow-[0_0_20px_-10px_rgba(255,255,255,0.1)]">
        {/* Loading State */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-[#141517] z-20">
            <Loader2 className="w-6 h-6 text-black/20 dark:text-white/20 animate-spin mb-2" />
            <span className="text-xs text-black/40 dark:text-white/40 font-medium">
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
            <div className="absolute inset-0 bg-white/0 dark:bg-black/0 transition-colors duration-300 group-hover:bg-white/40 dark:group-hover:bg-black/40" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-black/5 dark:from-white/5 to-transparent flex items-center justify-center">
            <TypeIcon className="w-12 h-12 text-black/5 dark:text-white/5 group-hover:text-black/10 dark:group-hover:text-white/10 transition-colors duration-300" />
          </div>
        )}

        {/* Settings Button (Top Right) */}
        {onSettings && (
          <div
            className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onSettings();
            }}
          >
            <div className="p-1.5 rounded-md bg-white/50 dark:bg-black/50 backdrop-blur-md text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white hover:bg-white/70 dark:hover:bg-black/70 border border-black/10 dark:border-white/10 transition-all">
              <MoreHorizontal className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* --- Interaction Overlay (Bottom) --- */}
        <div className="absolute inset-0 flex items-end justify-center p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
          <div className="flex items-center gap-2 w-full pointer-events-auto">
            {/* View Button */}
            {onView && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-8 bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black dark:text-white backdrop-blur-md border border-black/10 dark:border-white/10 rounded-lg text-xs font-medium transition-all transform translate-y-2 group-hover:translate-y-0 duration-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
              >
                <Eye className="w-3.5 h-3.5 mr-2 opacity-70" />
                View
              </Button>
            )}

            {/* Edit/Main Button */}
            {handleEdit && (
              <Button
                size="sm"
                className={cn(
                  "flex-1 h-8 text-xs font-medium rounded-lg shadow-lg transition-all transform translate-y-2 group-hover:translate-y-0 duration-300 delay-75",
                  // Primary style logic
                  "bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 border-0",
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
          <h3 className="font-medium text-sm text-black/90 dark:text-white/90 truncate group-hover:text-black dark:group-hover:text-white transition-colors">
            {name}
          </h3>
          {/* Type Indicator (Pill) */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5",
              typeColor,
            )}
          >
            <TypeIcon className="w-4 h-4" />
            <span className="hidden xs:inline">{typeLabel}</span>
          </div>
        </div>

        {/* Metadata */}
        {lastModified && (
          <div className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-[#8A8F98]">
            <Calendar className="w-3 h-3 opacity-50" />
            <span>{lastModified}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThumbnailCard;
