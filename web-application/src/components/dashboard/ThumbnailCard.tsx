"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowUpRight,
  Calendar,
  Eye,
  MoreHorizontal,
  Pencil,
  Rocket,
} from "lucide-react";
import React from "react";

export interface ThumbnailCardProps {
  name: string;
  thumbnailUrl: string | null;
  lastModified?: string;
  type: "project" | "prototype" | "canvas";
  onClick?: () => void; // Keep for backward compatibility (will default to edit)
  onView?: () => void;
  onEdit?: () => void;
  onSettings?: () => void;
  loading?: boolean; // New prop for loading state
}

const ThumbnailCard: React.FC<ThumbnailCardProps> = ({
  name,
  thumbnailUrl,
  lastModified,
  type,
  onClick,
  onView,
  onEdit,
  onSettings,
  loading = false,
}) => {
  // Handle backward compatibility - if onClick is provided but not onEdit, use onClick as onEdit
  const handleEdit = onEdit || onClick;

  const getTypeLabel = () => {
    switch (type) {
      case "project":
        return "Project";
      case "prototype":
        return "Prototype";
      case "canvas":
        return "Canvas";
      default:
        return "Item";
    }
  };

  const getEditIcon = () => {
    return type === "project" ? ArrowUpRight : Pencil;
  };

  const getEditLabel = () => {
    return type === "project" ? "Open" : "Edit";
  };

  const EditIcon = getEditIcon();

  return (
    <div
      className="group cursor-pointer transition-all duration-300 hover:scale-105"
      onClick={handleEdit}
    >
      <Card className="bg-background/80 backdrop-blur-sm border border-border overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group-hover:border-primary/50 cursor-pointer">
        {/* Image Container */}
        <div className="relative aspect-[4/3] bg-muted overflow-hidden flex items-center justify-center">
          {/* Settings button */}
          {onSettings && (
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-2 right-2 z-10 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              onClick={(e) => {
                e.stopPropagation();
                onSettings();
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <div className="w-8 h-8 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin mb-3"></div>
              <span className="text-sm font-medium">Loading preview...</span>
            </div>
          ) : thumbnailUrl ? (
            <>
              <img
                src={thumbnailUrl}
                alt={name}
                className="object-cover transition-all duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Rocket className="w-12 h-12 mb-3" />
              <span className="text-sm font-medium">No preview</span>
            </div>
          )}

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex cursor-pointer group-hover:pointer-events-auto">
            {/* Left Half - View (or full width if only View) */}
            {onView && (
              <div
                className={`${handleEdit ? "flex-1" : "w-full"} flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors duration-200`}
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  className="transform translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-0"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View
                </Button>
              </div>
            )}

            {/* Right Half - Edit (or full width if only Edit) */}
            {handleEdit && (
              <div
                className={`${onView ? "flex-1" : "w-full"} flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors duration-200`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  className="transform translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-75"
                >
                  <EditIcon className="w-4 h-4 mr-2" />
                  {getEditLabel()}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-foreground leading-tight group-hover:text-primary transition-colors duration-300 flex-1 mr-3">
              {name}
            </h3>
            <Badge variant="outline" className="flex-shrink-0 text-xs">
              {getTypeLabel()}
            </Badge>
          </div>

          {lastModified && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Modified {lastModified}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ThumbnailCard;
