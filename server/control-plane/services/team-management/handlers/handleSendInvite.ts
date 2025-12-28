import type { FastifyReply, FastifyRequest } from "fastify";
import {
  type APIResponse,
  HTTP_STATUS,
  type SendTeamInviteErrorResponse,
  type SendTeamInviteRequestBody,
  type SendTeamInviteSuccessResponse,
} from "../../../types/PublicAPITypes.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import { Resend } from "resend";
import { render } from "@react-email/render";
import TeamInviteEmail from "../../../emails/TeamInviteEmail.js";

/**
 * Implementation for sending a team invite.
 *
 * This function handles the business logic for sending a team invitation.
 * It validates the user's permissions, creates the invite, and sends an email.
 *
 * @param {FastifyRequest} request - The incoming request object with email and team_id in body
 * @param {FastifyReply} reply - The outgoing response object
 *
 * Flow:
 *  1. Validates JWT token and extracts user ID
 *  2. Validates user is owner or admin of the team
 *  3. Checks for existing pending invites
 *  4. Fetches team details
 *  5. Creates the invite in the database
 *  6. Sends invitation email via Resend
 *  7. Returns success response with invite ID
 */
export default async function handleSendInviteImpl(
  request: FastifyRequest<{ Body: SendTeamInviteRequestBody }>,
  reply: FastifyReply,
): Promise<
  APIResponse<SendTeamInviteSuccessResponse, SendTeamInviteErrorResponse>
> {
  // Extract JWT token from Authorization header and validate it
  const token = request.headers.authorization?.split(" ")[1] ?? "";
  const { user } = await validateJWTToken(token, request.log2);
  if (!user) {
    request.log2.warn("Unauthorized user");
    reply.status(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: "Unauthorized",
        message: "Invalid token",
      },
    };
  }

  const { email, team_id, role } = request.body;

  // Update logger context
  request.log2 = request.log2.child({
    userId: user.id,
    teamId: team_id,
    inviteeEmail: email,
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
      "is_team_owner_or_admin",
      {
        p_team_id: team_id,
      },
    );

    if (authError || !isAuthorized) {
      request.log2.warn("User is not authorized to invite members", {
        authError,
        isAuthorized,
      });
      reply.status(HTTP_STATUS.FORBIDDEN);
      return {
        data: null,
        error: {
          error: "Forbidden",
          message: "You must be an owner or admin of this team to send invites",
        },
      };
    }

    // Fetch team details
    const { data: team, error: teamError } = await supabaseClient
      .from("teams")
      .select("*")
      .eq("id", team_id)
      .single();

    if (teamError || !team) {
      request.log2.warn("Team not found", { team_id, error: teamError });
      reply.status(HTTP_STATUS.NOT_FOUND);
      return {
        data: null,
        error: {
          error: "Team not found",
          message: "The specified team does not exist",
        },
      };
    }

    // Check if user is already a member of the team
    const { data: existingMembership } = await supabaseClient
      .from("team_memberships")
      .select("*")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (existingMembership) {
      request.log2.warn("User is already a member of the team", {
        team_id,
        email,
      });
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        data: null,
        error: {
          error: "Already a member",
          message: "This user is already a member of this team",
        },
      };
    }

    // Check for existing pending invites
    const { data: existingInvites, error: inviteCheckError } =
      await supabaseClient
        .from("team_invites")
        .select("*")
        .eq("team_id", team_id)
        .eq("email", email)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString());

    if (inviteCheckError) {
      request.log2.error(
        inviteCheckError,
        "Failed to check for existing invites",
      );
      // Continue anyway - we'll try to create the invite
    }

    if (existingInvites && existingInvites.length > 0) {
      request.log2.warn("Pending invite already exists", {
        team_id,
        email,
        existing_invite_id: existingInvites[0].id,
      });
      reply.status(HTTP_STATUS.CONFLICT);
      return {
        data: null,
        error: {
          error: "Invite already exists",
          message: "A pending invite for this email already exists",
        },
      };
    }

    // Create the invite (does not expire for now)
    const { data: invite, error: createError } = await supabaseClient
      .from("team_invites")
      .insert({
        team_id,
        email,
        role,
        invited_by: user.id,
      })
      .select()
      .single();

    if (createError || !invite) {
      request.log2.error(createError, "Failed to create team invite");
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Invite creation failed",
          message: "Failed to create the team invite",
        },
      };
    }

    // Generate invite URL
    const inviteUrl = `${
      process.env.WEB_APP_URL || "https://nucleate.dev"
    }/teams/accept-invite?invite_id=${invite.id}`;

    // Send email via Resend
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const emailHtml = await render(
        TeamInviteEmail({
          inviterName: user.user_metadata?.name || user.email ||
            "A team member",
          teamName: team.name,
          inviteUrl,
        }),
      );

      const { error: emailError } = await resend.emails.send({
        from: "Nucleate <noreply@nucleate.dev>",
        to: [email],
        subject: `You've been invited to join ${team.name} on Nucleate`,
        html: emailHtml,
      });

      if (emailError) {
        request.log2.error(emailError, "Failed to send invite email");
        // Don't fail the request - the invite was created successfully
        // The user can still be invited manually
      } else {
        request.log2.consoleLogDevOnly("info", "Team invite email sent", {
          invite_id: invite.id,
          team_id,
          email,
        });
      }
    } catch (emailError) {
      request.log2.error(emailError, "Exception sending invite email");
      // Continue - the invite was created successfully
    }

    request.log2.consoleLogDevOnly("info", "Team invite created successfully", {
      invite_id: invite.id,
      team_id,
      email,
      role,
    });

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        success: true,
        invite_id: invite.id,
        message: "Team invite sent successfully",
      },
      error: null,
    };
  } catch (error) {
    request.log2.error(error, "Exception sending team invite");
    reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
