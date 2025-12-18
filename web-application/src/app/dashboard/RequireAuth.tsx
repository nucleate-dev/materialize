"use client";

import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

export default function RequireAuth() {
  const { user, userIsLoading } = useRequireAuth();
  const posthog = usePostHog();

  // Identify user with PostHog when authenticated
  useEffect(() => {
    if (userIsLoading) {
      // Still loading, don't do anything yet
      return;
    }

    if (user) {
      // User is logged in, identify them
      posthog?.identify(user.id, {
        email: user.email ?? "",
      });
    } else {
      // Loading is complete and no user - they're logged out
      // Reset PostHog to clear any previous user identification
      posthog?.reset();
    }
  }, [user, userIsLoading, posthog]);

  return <></>;
}
