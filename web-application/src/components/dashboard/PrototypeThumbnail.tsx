"use client";

import React, { useState, useEffect } from "react";
import ThumbnailCard from "./ThumbnailCard";
import { supabase } from "@/ClientConstants";

export interface PrototypeThumbnailProps {
  prototypeName: string;
  prototypeId: string; // Changed from thumbnailUrl to prototypeId
  thumbnailUrl?: string | null; // Keep for backward compatibility but make optional
  lastModified?: string;
  onView?: () => void;
  onEdit?: () => void;
  onSettings?: () => void;
}

const PrototypeThumbnail: React.FC<PrototypeThumbnailProps> = ({
  prototypeName,
  prototypeId,
  thumbnailUrl,
  lastModified,
  onView,
  onEdit,
  onSettings,
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateSignedUrl = async () => {
      try {
        setLoading(true);

        // Generate signed URL for the prototype thumbnail
        const { data, error } = await supabase.storage
          .from('prototype-thumbnails')
          .createSignedUrl(`${prototypeId}.png`, 3600); // 1 hour expiry

        if (error) {
          console.warn('Failed to generate signed URL for prototype thumbnail:', error);
          setSignedUrl(null);
        } else {
          setSignedUrl(data.signedUrl);
        }
      } catch (error) {
        console.warn('Error generating signed URL for prototype thumbnail:', error);
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

  // Use signed URL if available, otherwise fall back to thumbnailUrl
  const finalThumbnailUrl = signedUrl || thumbnailUrl || null;

  return (
    <ThumbnailCard
      name={prototypeName}
      thumbnailUrl={finalThumbnailUrl}
      lastModified={lastModified}
      type="prototype"
      onView={onView}
      onEdit={onEdit}
      onSettings={onSettings}
      loading={loading}
    />
  );
};

export default PrototypeThumbnail;
