import { SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import type { Database } from '../types/supabase.js';

/**
 * Check whether the provided user is an owner or admin of the given team.
 */
export async function userIsTeamAdminOrOwner(
  teamId: string,
  userId: string,
  supabaseClient: SupabaseClient<Database>,
  log2: SystemLogger,
): Promise<boolean> {
  if (!teamId || !userId) {
    return false;
  }

  const { data, error } = await supabaseClient
    .from('team_memberships')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log2.error(error, 'Failed to verify team membership role', {
      functionName: 'userIsTeamAdminOrOwner',
      teamId,
      userId,
    });
    return false;
  }

  if (!data) {
    return false;
  }

  return data.role === 'owner' || data.role === 'admin';
}
