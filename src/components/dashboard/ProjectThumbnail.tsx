"use client";

import React from "react";
import Image from "next/image";
import {
  RocketLaunchIcon,
  CalendarIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

interface ProjectThumbnailProps {
  projectName?: string;
  canvasName?: string;
  thumbnailUrl: string | null;
  lastModified?: string;
  onClick?: () => void;
}

const CanvasThumbnail: React.FC<ProjectThumbnailProps> = ({
  projectName,
  canvasName,
  thumbnailUrl,
  lastModified,
  onClick,
}) => {
  const displayName = projectName || canvasName || "Untitled";
  return (
    <div
      className="group cursor-pointer transition-all duration-500 hover:scale-105 transform-gpu"
      onClick={onClick}
    >
      {/* Enhanced Glassmorphism Container */}
      <div className="relative bg-white/95 dark:bg-boxdark/95 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-strokedark/30 overflow-hidden shadow-2xl dark:shadow-black/20 hover:shadow-3xl dark:hover:shadow-black/30 transition-all duration-500">
        {/* Inner glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-primary/5 dark:from-white/5 dark:to-primary/10 rounded-3xl pointer-events-none"></div>
        
        {/* Animated Background Orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -right-10 w-20 h-20 bg-gradient-to-br from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-full blur-2xl animate-pulse opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="absolute -bottom-10 -left-10 w-16 h-16 bg-gradient-to-tr from-meta-5/10 to-meta-3/10 dark:from-meta-5/20 dark:to-meta-3/20 rounded-full blur-xl animate-pulse delay-1000 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        </div>
        {/* Enhanced Image Container */}
        <div className="relative aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 dark:from-meta-4 dark:to-boxdark-2 overflow-hidden flex items-center justify-center">
          {thumbnailUrl ? (
            <>
              <Image
                src={thumbnailUrl}
                alt={displayName}
                fill
                className="object-cover transition-all duration-500 group-hover:scale-110"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
              {/* Image overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-secondary/5 to-meta-5/10 dark:from-primary/20 dark:via-secondary/10 dark:to-meta-5/20">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 rounded-2xl blur-lg animate-pulse"></div>
                <div className="relative p-4 bg-gradient-to-br from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 rounded-2xl border border-primary/20 dark:border-secondary/30">
                  <RocketLaunchIcon className="w-12 h-12 text-primary dark:text-secondary" />
                </div>
              </div>
              <span className="text-lg font-bold text-primary dark:text-secondary mb-1">
                Ready to Build
              </span>
              <span className="text-sm font-medium text-body dark:text-bodydark opacity-75">
                No preview yet ✨
              </span>
            </div>
          )}

          {/* Enhanced Hover Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center">
            <div className="transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500 bg-white/95 dark:bg-boxdark/95 backdrop-blur-xl rounded-2xl px-6 py-3 border border-white/20 dark:border-strokedark/30 shadow-xl">
              <div className="flex items-center gap-3">
                <ArrowTopRightOnSquareIcon className="w-5 h-5 text-primary dark:text-secondary" />
                <span className="font-bold text-black dark:text-white">
                  {projectName ? "Open Project" : "Open Canvas"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Info Section */}
        <div className="relative z-10 p-6">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-bold text-black dark:text-white text-xl leading-tight group-hover:text-primary dark:group-hover:text-secondary transition-colors duration-300 flex-1 mr-3">
              {displayName}
            </h3>
            {/* Modern Type Badge */}
            <div className="flex-shrink-0 px-3 py-1 bg-gradient-to-r from-primary/20 to-secondary/20 dark:from-primary/30 dark:to-secondary/30 backdrop-blur-sm rounded-xl border border-primary/20 dark:border-secondary/30">
              <span className="text-xs font-bold text-primary dark:text-secondary uppercase tracking-wide">
                {projectName ? "Project" : "Canvas"}
              </span>
            </div>
          </div>
          
          {lastModified && (
            <div className="flex items-center gap-2 text-sm text-body dark:text-bodydark">
              <CalendarIcon className="w-4 h-4" />
              <span className="font-medium">Modified {lastModified}</span>
            </div>
          )}
          
          {/* Progress indicator line */}
          <div className="mt-4 pt-4 border-t border-stroke/20 dark:border-strokedark/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-meta-3 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-body dark:text-bodydark opacity-75">
                Ready to launch
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasThumbnail;
