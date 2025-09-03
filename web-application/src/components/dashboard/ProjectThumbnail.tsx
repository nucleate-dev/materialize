"use client";

import React from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Calendar,
  Eye,
  Pencil,
  ArrowUpRight,
  MoreHorizontal,
} from "lucide-react";

interface ProjectThumbnailProps {
  projectName?: string;
  prototypeName?: string;
  canvasName?: string;
  thumbnailUrl: string | null;
  lastModified?: string;
  onClick?: () => void; // Keep for backward compatibility (will default to edit)
  onView?: () => void;
  onEdit?: () => void;
  onSettings?: () => void;
}

const CanvasThumbnail: React.FC<ProjectThumbnailProps> = ({
  projectName,
  prototypeName,
  canvasName,
  thumbnailUrl,
  lastModified,
  onClick,
  onView,
  onEdit,
  onSettings,
}) => {
  const displayName = projectName || prototypeName || canvasName || "Untitled";

  // Handle backward compatibility - if onClick is provided but not onEdit, use onClick as onEdit
  const handleEdit = onEdit || onClick;

  return (
    <div className="group cursor-pointer transition-all duration-300 hover:scale-105">
      <Card className="bg-background/80 backdrop-blur-sm border border-border overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group-hover:border-primary/50">
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
          {thumbnailUrl ? (
            <>
              <Image
                src={thumbnailUrl}
                alt={displayName}
                fill
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
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex">
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
                  className="transform translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-0 pointer-events-none"
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
                  className="transform translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-75 pointer-events-none"
                >
                  {projectName ? (
                    <ArrowUpRight className="w-4 h-4 mr-2" />
                  ) : (
                    <Pencil className="w-4 h-4 mr-2" />
                  )}
                  {projectName ? "Open" : "Edit"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-foreground leading-tight group-hover:text-primary transition-colors duration-300 flex-1 mr-3">
              {displayName}
            </h3>
            <Badge variant="outline" className="flex-shrink-0 text-xs">
              {projectName ? "Project" : prototypeName ? "Prototype" : "Canvas"}
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

export default CanvasThumbnail;
