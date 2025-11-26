/**
 * Hook for tracking Meta Pixel events
 *
 * Usage:
 * const { trackEvent } = useMetaPixel();
 * trackEvent('Lead', { content_name: 'Sign Up Form' });
 */

import { useCallback } from 'react';

// Extend the Window interface to include fbq
declare global {
  interface Window {
    fbq?: (
      action: string,
      eventName: string,
      params?: Record<string, unknown>
    ) => void;
  }
}

export type MetaPixelEvent =
  | 'AddPaymentInfo'
  | 'AddToCart'
  | 'AddToWishlist'
  | 'CompleteRegistration'
  | 'Contact'
  | 'CustomizeProduct'
  | 'Donate'
  | 'FindLocation'
  | 'InitiateCheckout'
  | 'Lead'
  | 'Purchase'
  | 'Schedule'
  | 'Search'
  | 'StartTrial'
  | 'SubmitApplication'
  | 'Subscribe'
  | 'ViewContent';

export function useMetaPixel() {
  const trackEvent = useCallback(
    (eventName: MetaPixelEvent, params?: Record<string, unknown>) => {
      if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', eventName, params);
      } else {
        console.warn('Meta Pixel is not loaded');
      }
    },
    []
  );

  const trackCustomEvent = useCallback(
    (eventName: string, params?: Record<string, unknown>) => {
      if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('trackCustom', eventName, params);
      } else {
        console.warn('Meta Pixel is not loaded');
      }
    },
    []
  );

  return {
    trackEvent,
    trackCustomEvent,
  };
}
