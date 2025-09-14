"use client";

import React from "react";
import ThumbnailCard from "./ThumbnailCard";

export interface CanvasThumbnailProps {
  canvasName: string;
  thumbnailUrl: string | null;
  lastModified?: string;
  onClick?: () => void;
  onSettings?: () => void;
}

const CanvasThumbnail: React.FC<CanvasThumbnailProps> = ({
  canvasName,
  thumbnailUrl,
  lastModified,
  onClick,
  onSettings,
}) => {
  return (
    <ThumbnailCard
      name={canvasName}
      thumbnailUrl={thumbnailUrl}
      lastModified={lastModified}
      type="canvas"
      onClick={onClick}
      onSettings={onSettings}
    />
  );
};

export default CanvasThumbnail;
