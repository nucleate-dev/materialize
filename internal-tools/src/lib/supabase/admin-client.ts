import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/supabase";

let supabaseAdminClient: SupabaseClient<Database> | null = null;

function getRequiredEnvVar(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const url = getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  supabaseAdminClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminClient;
}
