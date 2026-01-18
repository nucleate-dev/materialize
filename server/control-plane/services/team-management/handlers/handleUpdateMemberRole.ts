import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type APIResponse,
  HTTP_STATUS,
  type UpdateTeamMemberRoleErrorResponse,
  type UpdateTeamMemberRoleRequestBody,
  type UpdateTeamMemberRoleSuccessResponse,
} from '../../../types/PublicAPITypes.js';
import { validateJWTToken } from '../../../utils/prototypeAuth.js';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../../types/supabase.js';

/**
 * Implementation for updating a team member's role.
 *
 * This function handles the business logic for changing a team member's role.
 * It validates the user's permissions and updates the team membership.
 *
 * @param {FastifyRequest} request - The incoming request object with team_id, user_id, and role in body
 * @param {FastifyReply} reply - The outgoing response object
 *
 * Flow:
 *  1. Validates JWT token and extracts user ID
 *  2. Validates user is owner or admin of the team
 *  3. Fetches the current membership to get old role
 *  4. Validates the membership exists
 *  5. Updates the role in team_memberships table
 *  6. Logs the role change
 *  7. Returns success response with old and new roles
 */
export default async function handleUpdateMemberRoleImpl(
  request: FastifyRequest<{ Body: UpdateTeamMemberRoleRequestBody }>,
  reply: FastifyReply,
): Promise<
  APIResponse<
    UpdateTeamMemberRoleSuccessResponse,
    UpdateTeamMemberRoleErrorResponse
  >
> {
  // Extract JWT token from Authorization header and validate it
  const token = request.headers.authorization?.split(' ')[1] ?? '';
  const { user } = await validateJWTToken(token, request.log2);
  if (!user) {
    request.log2.warn('Unauthorized user');
    reply.status(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message: 'Invalid token',
      },
    };
  }

  const { team_id, user_id, role } = request.body;

  // Update logger context
  request.log2 = request.log2.child({
    userId: user.id,
    teamId: team_id,
    targetUserId: user_id,
    newRole: role,
  });

  const supabaseClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );

  try {
    // Validate that user is owner or admin of the team
    const { data: isAuthorized, error: authError } = await supabaseClient.rpc(
      'is_team_owner_or_admin',
      {
        p_team_id: team_id,
      },
    );

    if (authError || !isAuthorized) {
      request.log2.warn('User is not authorized to update member roles', {
        authError,
        isAuthorized,
      });
      reply.status(HTTP_STATUS.FORBIDDEN);
      return {
        data: null,
        error: {
          error: 'Forbidden',
          message:
            'You must be an owner or admin of this team to update member roles',
        },
      };
    }

    // Fetch the current membership to get the old role
    const { data: membership, error: membershipError } = await supabaseClient
      .from('team_memberships')
      .select('*')
      .eq('team_id', team_id)
      .eq('user_id', user_id)
      .single();

    if (membershipError || !membership) {
      request.log2.warn('Team membership not found', {
        team_id,
        user_id,
        error: membershipError,
      });
      reply.status(HTTP_STATUS.NOT_FOUND);
      return {
        data: null,
        error: {
          error: 'Membership not found',
          message: 'The specified team membership does not exist',
        },
      };
    }

    const oldRole = membership.role;

    // Check if the role is actually changing
    if (oldRole === role) {
      request.log2.warn('Role is already set to the requested value', {
        team_id,
        user_id,
        role,
      });
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        data: null,
        error: {
          error: 'No change needed',
          message: 'User already has this role',
        },
      };
    }

    // TODO: if the role is changing to Viewer, then remove one quantity from stripe subscription
    // TODO: if the role is changing from Viewer to anything else, then add one quantity to stripe subscription

    // Update the role
    const { error: updateError } = await supabaseClient
      .from('team_memberships')
      .update({ role })
      .eq('team_id', team_id)
      .eq('user_id', user_id);

    if (updateError) {
      request.log2.error(updateError, 'Failed to update team member role');
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Update failed',
          message: 'Failed to update the team member role',
        },
      };
    }

    request.log2.consoleLogDevOnly('info', 'Team member role updated', {
      team_id,
      user_id,
      old_role: oldRole,
      new_role: role,
      updated_by: user.id,
    });

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        success: true,
        message: 'Team member role updated successfully',
        old_role: oldRole,
        new_role: role,
      },
      error: null,
    };
  } catch (error) {
    request.log2.error(error, 'Exception updating team member role');
    reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
