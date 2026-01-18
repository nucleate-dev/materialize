import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type AcceptTeamInviteErrorResponse,
  type AcceptTeamInviteRequestBody,
  type AcceptTeamInviteSuccessResponse,
  type APIResponse,
  HTTP_STATUS,
} from '../../../types/PublicAPITypes.js';
import { validateJWTToken } from '../../../utils/prototypeAuth.js';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../../types/supabase.js';

/**
 * Implementation for accepting a team invite.
 *
 * This function handles the business logic for accepting a team invitation.
 * It validates the invite, checks if it's expired or already accepted,
 * and creates a team membership for the user.
 *
 * @param {FastifyRequest} request - The incoming request object with invite_id in body
 * @param {FastifyReply} reply - The outgoing response object
 *
 * Flow:
 *  1. Validates JWT token and extracts user ID
 *  2. Fetches the invite from the database
 *  3. Validates invite (exists, not expired, not accepted)
 *  4. Verifies user is the intended recipient
 *  5. Creates team membership record
 *  6. Updates invite to mark as accepted
 *  7. Returns success response with team info
 */
export default async function handleAcceptInviteImpl(
  request: FastifyRequest<{ Body: AcceptTeamInviteRequestBody }>,
  reply: FastifyReply,
): Promise<
  APIResponse<AcceptTeamInviteSuccessResponse, AcceptTeamInviteErrorResponse>
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

  const { invite_id } = request.body;

  // Update logger context
  request.log2 = request.log2.child({
    userId: user.id,
    inviteId: invite_id,
  });

  // User-authenticated client for reading invites (respects RLS)
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

  // Service role client for inserting membership (bypasses RLS)
  const supabaseServiceClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // Fetch the invite
    const { data: invite, error: inviteError } = await supabaseClient
      .from('team_invites')
      .select('*')
      .eq('id', invite_id)
      .single();

    if (inviteError || !invite) {
      request.log2.warn('Invite not found', {
        invite_id,
        error: inviteError,
      });
      reply.status(HTTP_STATUS.NOT_FOUND);
      return {
        data: null,
        error: {
          error: 'Invite not found',
          message: 'The specified invite does not exist',
        },
      };
    }

    request.log2 = request.log2.child({
      userId: user.id,
      inviteId: invite_id,
      teamId: invite.team_id,
    });

    // Check if invite has already been accepted
    if (invite.invite_status === 'accepted') {
      request.log2.warn('Invite already accepted', { invite_id });
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        data: null,
        error: {
          error: 'Invite already accepted',
          message: 'This invite has already been accepted',
        },
      };
    } else if (invite.invite_status === 'cancelled') {
      request.log2.warn('Invite has been cancelled', { invite_id });
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        data: null,
        error: {
          error: 'Invite cancelled',
          message: 'This invite has been cancelled',
        },
      };
    }

    // Check if invite has expired
    const now = new Date();
    const expiresAt =
      invite.expires_at !== null ? new Date(invite.expires_at) : null;
    if (expiresAt && now > expiresAt) {
      request.log2.warn('Invite expired', {
        invite_id,
        expires_at: invite.expires_at,
      });
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        data: null,
        error: {
          error: 'Invite expired',
          message: 'This invite has expired',
        },
      };
    }

    // Verify user is the intended recipient
    const isIntendedRecipient =
      invite.invited_user_id === user.id || invite.email === user.email;

    if (!isIntendedRecipient) {
      request.log2.warn('User is not the intended recipient', {
        invite_id,
        user_id: user.id,
        invited_user_id: invite.invited_user_id,
        user_email: user.email,
        invited_email: invite.email,
      });
      reply.status(HTTP_STATUS.FORBIDDEN);
      return {
        data: null,
        error: {
          error: 'Forbidden',
          message: 'You are not authorized to accept this invite',
        },
      };
    }

    // Check if user is already a member of the team
    const { data: existingMembership } = await supabaseClient
      .from('team_memberships')
      .select('*')
      .eq('team_id', invite.team_id)
      .eq('user_id', user.id)
      .single();

    if (existingMembership) {
      request.log2.warn('User is already a member of the team', {
        invite_id,
        team_id: invite.team_id,
        user_id: user.id,
      });
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        data: null,
        error: {
          error: 'Already a member',
          message: 'You are already a member of this team',
        },
      };
    }

    // Update invite to mark as accepted
    // Note: We update both invite_status and accepted_at. The trigger prevents invitees from changing
    // invited_user_id, so we don't attempt to set it here.
    const { error: updateError } = await supabaseClient
      .from('team_invites')
      .update({
        invite_status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invite_id);

    if (updateError) {
      request.log2.error(updateError, 'Failed to update invite status');
      // Don't fail the request since membership was created successfully
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Membership team invitation acceptance failed',
          message: 'Failed to accept the team invite',
        },
      };
    }

    // Create team membership using service role (bypasses RLS)
    // This is necessary because the user is not yet a team member and cannot insert themselves
    const { error: membershipError } = await supabaseServiceClient
      .from('team_memberships')
      .insert({
        team_id: invite.team_id,
        user_id: user.id,
        role: invite.role,
        invited_by: invite.invited_by,
      });

    if (membershipError) {
      request.log2.error(membershipError, 'Failed to create team membership');
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Membership creation failed',
          message: 'Failed to create team membership',
        },
      };
    }

    request.log2.consoleLogDevOnly(
      'info',
      'Team invite accepted successfully',
      {
        invite_id,
        team_id: invite.team_id,
        user_id: user.id,
        role: invite.role,
      },
    );

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        success: true,
        team_id: invite.team_id,
        role: invite.role,
      },
      error: null,
    };
  } catch (error) {
    request.log2.error(error, 'Exception accepting team invite');
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
