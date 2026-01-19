"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { captureUTMParams } from "@/lib/utils/analytics/utmTracking";

/**
 * UTM TRACKER - Client Component
 * Tracks UTM parameters from URL on page load
 * Renders nothing - purely for side effects
 */
export default function UTMTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams) {
      captureUTMParams(searchParams);
    }
  }, [searchParams]);

  return null;
}
