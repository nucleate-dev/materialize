"use client";

import React, { useState, useEffect } from "react";
import ThumbnailCard from "./ThumbnailCard";
import { supabase } from "@/ClientConstants";
import { useActiveTeam } from "@/contexts/TeamContext";

export interface PrototypeThumbnailProps {
  prototypeName: string;
  prototypeId: string;
  framework: string | null;
  lastModified?: string;
  onView?: () => void;
  onEdit?: () => void;
  onSettings?: () => void;
}

const PrototypeThumbnail: React.FC<PrototypeThumbnailProps> = ({
  prototypeName,
  prototypeId,
  framework,
  lastModified,
  onView,
  onEdit,
  onSettings,
}) => {
  const { currentUserMembership } = useActiveTeam();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if current user is a viewer
  const isViewer = currentUserMembership?.role === "viewer";

  useEffect(() => {
    const generateSignedUrl = async () => {
      try {
        setLoading(true);

        // Generate signed URL for the prototype thumbnail
        const { data, error } = await supabase.storage
          .from("prototype-thumbnails")
          .createSignedUrl(`${prototypeId}.png`, 3600); // 1 hour expiry

        if (error) {
          setSignedUrl(null);
        } else {
          setSignedUrl(data.signedUrl);
        }
      } catch {
        setSignedUrl(null);
      } finally {
        setLoading(false);
      }
    };

    // Only generate signed URL if we have a prototypeId
    if (prototypeId) {
      generateSignedUrl();
    } else {
      setLoading(false);
    }
  }, [prototypeId]);

  const finalThumbnailUrl = signedUrl;

  return (
    <ThumbnailCard
      name={prototypeName}
      thumbnailUrl={finalThumbnailUrl}
      lastModified={lastModified}
      type="prototype"
      framework={framework}
      onView={onView}
      onEdit={isViewer ? undefined : onEdit}
      onSettings={onSettings}
      loading={loading}
    />
  );
};

export default PrototypeThumbnail;
