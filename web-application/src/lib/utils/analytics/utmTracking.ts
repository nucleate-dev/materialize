/**
 * UTM Parameter Tracking Utility
 *
 * Captures UTM parameters and campaign tracking IDs from URL and persists them
 * in sessionStorage so they're available throughout the user's session, even
 * when navigating between pages.
 *
 * This is essential for attribution tracking when users land on homepage
 * but register on a different page.
 */

import { ClientProductLogger } from "@/lib/loggers/ClientProductLogger";

const UTM_STORAGE_KEY = "materialize_utm_params";

// Create a logger instance for this utility
const logger = new ClientProductLogger();

export interface UTMParams {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  fbclid?: string | null; // Facebook Click ID
  gclid?: string | null; // Google Click ID
}

/**
 * Capture UTM parameters from URL search params and store them in sessionStorage
 * Call this on landing pages (like homepage) to preserve UTM data
 */
export function captureUTMParams(searchParams: URLSearchParams): UTMParams {
  const utmParams: UTMParams = {
    utm_source: searchParams.get("utm_source"),
    utm_medium: searchParams.get("utm_medium"),
    utm_campaign: searchParams.get("utm_campaign"),
    utm_content: searchParams.get("utm_content"),
    utm_term: searchParams.get("utm_term"),
    fbclid: searchParams.get("fbclid"),
    gclid: searchParams.get("gclid"),
  };

  // Only store if at least one UTM parameter exists
  const hasUTMParams = Object.values(utmParams).some((value) => value !== null);

  if (hasUTMParams && typeof window !== "undefined") {
    try {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utmParams));
    } catch (error) {
      logger.debug("warn", "Failed to store UTM params", { error });
    }
  }

  return utmParams;
}

/**
 * Retrieve stored UTM parameters from sessionStorage
 * Call this on conversion pages (like registration) to include UTM data in events
 */
export function getStoredUTMParams(): UTMParams {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as UTMParams;
    }
  } catch (error) {
    logger.debug("warn", "Failed to retrieve UTM params", { error });
  }

  return {};
}

/**
 * Get UTM parameters from current URL OR from sessionStorage
 * This ensures we always have UTM data even if user navigated to a different page
 */
export function getUTMParams(searchParams?: URLSearchParams): UTMParams {
  // First, try to get from current URL
  if (searchParams) {
    const currentParams = captureUTMParams(searchParams);
    const hasCurrentParams = Object.values(currentParams).some(
      (value) => value !== null,
    );

    // If current URL has UTM params, use those (and they're already stored)
    if (hasCurrentParams) {
      return currentParams;
    }
  }

  // Otherwise, fall back to stored params from earlier in the session
  return getStoredUTMParams();
}

/**
 * Clear stored UTM parameters (useful after successful conversion)
 */
export function clearUTMParams(): void {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(UTM_STORAGE_KEY);
    } catch (error) {
      logger.debug("warn", "Failed to clear UTM params", { error });
    }
  }
}
