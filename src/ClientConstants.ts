import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
);

// PostHog client - only initialize in browser environment
export let posthogClient: unknown = null;

if (typeof window !== "undefined") {
  import("posthog-js").then((posthog) => {
    posthogClient = posthog.default.init(
      process.env.NEXT_PUBLIC_POSTHOG_KEY as string,
      {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        person_profiles: "always",
      },
    );
  });
}
