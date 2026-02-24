import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase.js';

// Using service role key because cache tables have RLS enabled with no policies,
// making them only accessible via the service role. This is intentional: cache state
// is internal server state that should never be directly accessible to end users.
let cacheClient: SupabaseClient<Database> | null = null;

export function getCacheClient(): SupabaseClient<Database> {
  if (!cacheClient) {
    cacheClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return cacheClient;
}
