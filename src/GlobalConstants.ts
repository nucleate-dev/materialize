import { createClient } from "@supabase/supabase-js";
import posthog from "posthog-js";

export enum NavigationTabNames {
  DASHBOARD = "Dashboard",
  SETTINGS = "Settings",
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
);

export const posthogClient = posthog.init(
  process.env.NEXT_PUBLIC_POSTHOG_KEY as string,
  {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: "always",
  }
);

export const ProductKeys = Object.freeze({
  BASE_SUBSCRIPTION: "base",
  PRO_SUBSCRIPTION: "pro",
});

export const SubscriptionStatuses = Object.freeze({
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
});


// FLAGS

export const APPLY_CODE_IMMEDIATELY = true;