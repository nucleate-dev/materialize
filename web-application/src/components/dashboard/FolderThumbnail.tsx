"use client";

import React from "react";
import ThumbnailCard from "./ThumbnailCard";

export interface FolderThumbnailProps {
  folderName: string;
  thumbnailUrl: string | null;
  lastModified?: string;
  onClick?: () => void;
  onSettings?: () => void;
}

const FolderThumbnail: React.FC<FolderThumbnailProps> = ({
  folderName,
  thumbnailUrl,
  lastModified,
  onClick,
  onSettings,
}) => {
  return (
    <ThumbnailCard
      name={folderName}
      thumbnailUrl={thumbnailUrl}
      lastModified={lastModified}
      type="folder"
      onClick={onClick}
      onSettings={onSettings}
    />
  );
};

export default FolderThumbnail;
