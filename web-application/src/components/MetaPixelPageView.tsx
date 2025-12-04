"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Component to track Meta Pixel page views on route changes
 * Add this to your root layout to track all page navigations
 */
function MetaPixelPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixelPageView() {
  return (
    <Suspense fallback={null}>
      <MetaPixelPageViewInner />
    </Suspense>
  );
}

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
