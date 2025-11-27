"use client";

import { Button } from "@/components/ui/button";
import { useMetaPixel } from "@/hooks/useMetaPixel";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { SUBSCRIPTION_ACCESS_QUERY_KEY } from "@/lib/react-query/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Loader2, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { trackEvent } = useMetaPixel();
  const logger = useProductLogger();
  const queryClient = useQueryClient();

  const [isTracking, setIsTracking] = useState(true);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      logger.debug('warn', 'No session_id in checkout success URL');
      router.push('/dashboard/account');
      return;
    }

    // Fetch session details from Stripe and track Meta Pixel event
    const trackPurchase = async () => {
      try {
        // Fetch checkout session details to get purchase info
        const response = await fetch(`/api/checkout/session?session_id=${sessionId}`);

        if (!response.ok) {
          logger.debug('warn', 'Failed to fetch checkout session details');
          setIsTracking(false);
          return;
        }

        const sessionData = await response.json();

        // Track Meta Pixel Purchase event with session_id as eventID for deduplication
        // Meta will deduplicate this with the server-side event using the same eventID
        trackEvent('Purchase', {
          value: sessionData.amount_total / 100, // Convert cents to dollars
          currency: sessionData.currency?.toUpperCase() || 'USD',
          content_name: sessionData.content_name || 'Subscription',
          content_type: 'product',
          eventID: sessionId, // Used for deduplication with server-side Conversions API
        });

        logger.debug('log', 'Meta Pixel Purchase event tracked', { sessionId });
      } catch (error) {
        logger.debug('error', 'Error tracking purchase event', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        void queryClient.invalidateQueries({
          queryKey: [SUBSCRIPTION_ACCESS_QUERY_KEY],
        });
        setIsTracking(false);
      }
    };

    trackPurchase();
  }, [searchParams, trackEvent, logger, router, queryClient]);

  // Countdown and redirect
  useEffect(() => {
    if (isTracking) return;

    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          router.push('/dashboard/account');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTracking, router]);

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans flex items-center justify-center">

      <div className="container mx-auto px-6 max-w-2xl">
        <div className="bg-white dark:bg-[#141517] border border-black/5 dark:border-white/5 rounded-2xl shadow-lg dark:shadow-none overflow-hidden">

          {/* Success Icon */}
          <div className="relative bg-gradient-to-b from-emerald-500/10 to-transparent dark:from-emerald-500/5 px-8 pt-12 pb-8 text-center border-b border-black/5 dark:border-white/5">
            <div className="w-20 h-20 mx-auto mb-6 bg-emerald-500/20 dark:bg-emerald-500/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-3">
              Payment Successful!
            </h1>
            <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
              Thank you for your purchase. Your account has been upgraded.
            </p>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-lg bg-purple-500/5 dark:bg-purple-500/5 border border-purple-500/20">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-medium text-gray-900 dark:text-white">What&apos;s Next?</h3>
                <p className="text-sm text-gray-600 dark:text-[#8A8F98]">
                  Your new features are now active. Start creating amazing prototypes with your upgraded plan!
                </p>
              </div>
            </div>

            {/* Tracking Status */}
            {isTracking && (
              <div className="flex items-center justify-center gap-3 text-sm text-gray-600 dark:text-[#8A8F98] py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing your purchase...</span>
              </div>
            )}

            {/* Redirect CTA */}
            {!isTracking && (
              <div className="space-y-3 pt-4">
                <Button
                  onClick={() => router.push('/dashboard/account')}
                  className="w-full bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 h-11"
                >
                  Go to Account Settings
                </Button>
                <p className="text-center text-xs text-gray-600 dark:text-[#8A8F98]">
                  Redirecting in {redirectCountdown} seconds...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccess() {
  return (
    <Suspense fallback={
      <div className="relative min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-[#8A8F98]" />
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
