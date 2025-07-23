"use client";

import React from 'react';
import Image from 'next/image';

interface ProjectThumbnailProps {
  projectName: string;
  thumbnailUrl: string;
  lastModified?: string;
  onClick?: () => void;
}

const ProjectThumbnail: React.FC<ProjectThumbnailProps> = ({
  projectName,
  thumbnailUrl,
  lastModified,
  onClick
}) => {
  return (
    <div 
      className="group cursor-pointer transition-all duration-200 hover:scale-[1.02]"
      onClick={onClick}
    >
      {/* Thumbnail Container */}
      <div className="relative bg-white dark:bg-boxdark rounded-xl border border-stroke dark:border-strokedark overflow-hidden shadow-2 hover:shadow-4 transition-all duration-300">
        {/* Image Container */}
        <div className="relative aspect-[4/3] bg-gray-100 dark:bg-meta-4 overflow-hidden">
          <Image
            src={thumbnailUrl}
            alt={projectName}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          
          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 dark:bg-boxdark/90 rounded-lg px-4 py-2 backdrop-blur-sm">
              <span className="text-sm font-medium text-body dark:text-bodydark">Open Project</span>
            </div>
          </div>
        </div>

        {/* Project Info */}
        <div className="p-4">
          <h3 className="font-semibold text-black dark:text-white text-lg leading-tight mb-1 group-hover:text-primary transition-colors duration-200">
            {projectName}
          </h3>
          {lastModified && (
            <p className="text-sm text-body dark:text-bodydark2">
              Modified {lastModified}
            </p>
          )}
        </div>

        {/* Corner Badge for Project Type */}
        <div className="absolute top-3 right-3 bg-primary/90 backdrop-blur-sm rounded-md px-2 py-1">
          <span className="text-xs font-medium text-white">Canvas</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectThumbnail;