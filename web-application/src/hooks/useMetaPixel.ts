/**
 * Hook for tracking Meta Pixel events
 *
 * Usage:
 * const { trackEvent } = useMetaPixel();
 * trackEvent('Lead', { content_name: 'Sign Up Form' });
 */

import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { useCallback } from "react";

// Extend the Window interface to include fbq
declare global {
  interface Window {
    fbq?: (
      action: string,
      eventName: string,
      params?: Record<string, unknown>,
      options?: { eventID?: string },
    ) => void;
  }
}

export type MetaPixelEvent =
  | "AddPaymentInfo"
  | "AddToCart"
  | "AddToWishlist"
  | "CompleteRegistration"
  | "Contact"
  | "CustomizeProduct"
  | "Donate"
  | "FindLocation"
  | "InitiateCheckout"
  | "Lead"
  | "Purchase"
  | "Schedule"
  | "Search"
  | "StartTrial"
  | "SubmitApplication"
  | "Subscribe"
  | "ViewContent";

export function useMetaPixel() {
  const logger = useProductLogger();

  const trackEvent = useCallback(
    (
      eventName: MetaPixelEvent,
      params?: Record<string, unknown>,
      eventId?: string,
    ) => {
      if (typeof window !== "undefined" && window.fbq) {
        // If eventId is provided, pass it as part of the options object
        if (eventId) {
          window.fbq("track", eventName, params, { eventID: eventId });
        } else {
          window.fbq("track", eventName, params);
        }
      } else {
        logger.debug("warn", "Meta Pixel is not loaded");
      }
    },
    [logger],
  );

  const trackCustomEvent = useCallback(
    (eventName: string, params?: Record<string, unknown>) => {
      if (typeof window !== "undefined" && window.fbq) {
        window.fbq("trackCustom", eventName, params);
      } else {
        logger.debug("warn", "Meta Pixel is not loaded");
      }
    },
    [logger],
  );

  return {
    trackEvent,
    trackCustomEvent,
  };
}
