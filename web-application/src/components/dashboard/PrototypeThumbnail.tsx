"use client";

import React from "react";
import ThumbnailCard from "./ThumbnailCard";

export interface PrototypeThumbnailProps {
  prototypeName: string;
  thumbnailUrl: string | null;
  lastModified?: string;
  onView?: () => void;
  onEdit?: () => void;
  onSettings?: () => void;
}

const PrototypeThumbnail: React.FC<PrototypeThumbnailProps> = ({
  prototypeName,
  thumbnailUrl,
  lastModified,
  onView,
  onEdit,
  onSettings,
}) => {
  return (
    <ThumbnailCard
      name={prototypeName}
      thumbnailUrl={thumbnailUrl}
      lastModified={lastModified}
      type="prototype"
      onView={onView}
      onEdit={onEdit}
      onSettings={onSettings}
    />
  );
};

export default PrototypeThumbnail;
