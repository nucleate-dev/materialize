import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type AcceptTeamInviteErrorResponse,
  type AcceptTeamInviteRequestBody,
  type AcceptTeamInviteSuccessResponse,
  type APIResponse,
  HTTP_STATUS,
} from "../types/PublicAPITypes.js";
import { validateJWTToken } from "../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../types/supabase.js";

/**
 * TeamManagementService handles team invitation and membership management operations.
 * This includes sending team invites, accepting invites, and managing team memberships.
 */
export class TeamManagementService {
  constructor() {}

  /**
   * Register routes with Fastify
   */
  public registerRoutes(app: FastifyInstance): void {
    // POST /teams/accept-invite
    app.post<{ Body: AcceptTeamInviteRequestBody }>(
      "/teams/accept-invite",
      {
        schema: {
          body: {
            type: "object",
            required: ["invite_id"],
            properties: {
              invite_id: {
                type: "string",
              },
            },
          },
        },
      },
      this.handleAcceptInvite.bind(this),
    );
  }

  /**
   * API Route Handler for accepting a team invite.
   *
   * This function handles HTTP POST requests to accept a team invitation.
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
  private async handleAcceptInvite(
    request: FastifyRequest<{ Body: AcceptTeamInviteRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<AcceptTeamInviteSuccessResponse, AcceptTeamInviteErrorResponse>
  > {
    // Extract JWT token from Authorization header and validate it
    const token = request.headers.authorization?.split(" ")[1] ?? "";
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
      request.log2.warn("Unauthorized user");
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: "Unauthorized",
          message: "Invalid token",
        },
      });
    }

    // Update logger context
    request.log2 = request.log2.child({
      userId: user.id,
    });

    const { invite_id } = request.body;

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
      // Fetch the invite
      const { data: invite, error: inviteError } = await supabaseClient
        .from("team_invites")
        .select("*")
        .eq("id", invite_id)
        .single();

      if (inviteError || !invite) {
        request.log2.warn("Invite not found", {
          invite_id,
          error: inviteError,
        });
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: "Invite not found",
            message: "The specified invite does not exist",
          },
        });
      }

      // Check if invite has already been accepted
      if (invite.accepted_at) {
        request.log2.warn("Invite already accepted", { invite_id });
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          data: null,
          error: {
            error: "Invite already accepted",
            message: "This invite has already been accepted",
          },
        });
      }

      // Check if invite has expired
      const now = new Date();
      const expiresAt = new Date(invite.expires_at);
      if (invite.expires_at !== null && now > expiresAt) {
        request.log2.warn("Invite expired", {
          invite_id,
          expires_at: invite.expires_at,
        });
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          data: null,
          error: {
            error: "Invite expired",
            message: "This invite has expired",
          },
        });
      }

      // Verify user is the intended recipient
      const isIntendedRecipient = invite.invited_user_id === user.id ||
        invite.email === user.email;

      if (!isIntendedRecipient) {
        request.log2.warn("User is not the intended recipient", {
          invite_id,
          user_id: user.id,
          invited_user_id: invite.invited_user_id,
          user_email: user.email,
          invited_email: invite.email,
        });
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          data: null,
          error: {
            error: "Forbidden",
            message: "You are not authorized to accept this invite",
          },
        });
      }

      // Check if user is already a member of the team
      const { data: existingMembership } = await supabaseClient
        .from("team_memberships")
        .select("*")
        .eq("team_id", invite.team_id)
        .eq("user_id", user.id)
        .single();

      if (existingMembership) {
        request.log2.warn("User is already a member of the team", {
          invite_id,
          team_id: invite.team_id,
          user_id: user.id,
        });
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          data: null,
          error: {
            error: "Already a member",
            message: "You are already a member of this team",
          },
        });
      }

      // Update invite to mark as accepted
      const { error: updateError } = await supabaseClient
        .from("team_invites")
        .update({
          accepted_at: new Date().toISOString(),
          invited_user_id: user.id, // Ensure invited_user_id is set
        })
        .eq("id", invite_id);

      if (updateError) {
        request.log2.error(updateError, "Failed to update invite status");
        // Don't fail the request since membership was created successfully
      }

      // Create team membership
      const { error: membershipError } = await supabaseClient
        .from("team_memberships")
        .insert({
          team_id: invite.team_id,
          user_id: user.id,
          role: invite.role,
          invited_by: invite.invited_by,
        });

      if (membershipError) {
        request.log2.error(membershipError, "Failed to create team membership");
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Membership creation failed",
            message: "Accepted invite, but failed to create team membership",
          },
        });
      }

      request.log2.consoleLogDevOnly(
        "info",
        "Team invite accepted successfully",
        {
          invite_id,
          team_id: invite.team_id,
          user_id: user.id,
          role: invite.role,
        },
      );

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          success: true,
          team_id: invite.team_id,
          role: invite.role,
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, "Exception accepting team invite");
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
}
