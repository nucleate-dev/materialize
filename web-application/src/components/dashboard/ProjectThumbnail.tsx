"use client";

import React from "react";
import ThumbnailCard from "./ThumbnailCard";

export interface ProjectThumbnailProps {
    projectName: string;
    thumbnailUrl: string | null;
    lastModified?: string;
    onClick?: () => void;
    onSettings?: () => void;
}

const ProjectThumbnail: React.FC<ProjectThumbnailProps> = ({
    projectName,
    thumbnailUrl,
    lastModified,
    onClick,
    onSettings,
}) => {
    return (
        <ThumbnailCard
            name={projectName}
            thumbnailUrl={thumbnailUrl}
            lastModified={lastModified}
            type="project"
            onClick={onClick}
            onSettings={onSettings}
        />
    );
};

export default ProjectThumbnail;
