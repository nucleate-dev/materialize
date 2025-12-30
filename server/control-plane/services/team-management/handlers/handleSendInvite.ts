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
import { getRemainingSeats } from "../../../utils/subscriptionChecks.js";

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

  const { emails, team_id, role } = request.body;

  // Update logger context
  request.log2 = request.log2.child({
    userId: user.id,
    teamId: team_id,
    inviteeEmails: emails,
    emailCount: emails.length,
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

    // Check if team has remaining seats for this role
    const seatInfo = await getRemainingSeats(
      token,
      user.id,
      team_id,
      request.log2,
    );

    // Determine which seat type to check based on role
    const isViewerRole = role === "viewer";
    const relevantSeats = isViewerRole
      ? seatInfo.viewerSeats
      : seatInfo.collaboratorSeats;
    const seatType = isViewerRole ? "viewer" : "collaborator";

    if (!relevantSeats.hasSeats) {
      reply.status(HTTP_STATUS.FORBIDDEN);
      return {
        data: null,
        error: {
          error: "No remaining seats",
          message:
            `Your ${seatInfo.plan} plan has no remaining ${seatType} seats. You have ${relevantSeats.used} of ${relevantSeats.total} seats used. Please upgrade your plan or remove existing members to send more invites.`,
        },
      };
    }

    // Check if we have enough seats for all the emails being invited
    if (relevantSeats.remaining < emails.length) {
      reply.status(HTTP_STATUS.FORBIDDEN);
      return {
        data: null,
        error: {
          error: "Not enough seats",
          message:
            `Your ${seatInfo.plan} plan has only ${relevantSeats.remaining} remaining ${seatType} seat(s), but you're trying to invite ${emails.length} member(s). Please upgrade your plan or reduce the number of invites.`,
        },
      };
    }

    // Process each email
    const inviteIds: string[] = [];
    const failedEmails: string[] = [];
    const resend = new Resend(process.env.RESEND_API_KEY);

    for (const email of emails) {
      try {
        // Check for existing pending invites
        const { data: existingInvites } = await supabaseClient
          .from("team_invites")
          .select("*")
          .eq("team_id", team_id)
          .eq("email", email)
          .is("accepted_at", null);

        if (existingInvites && existingInvites.length > 0) {
          request.log2.warn("Pending invite already exists", {
            team_id,
            email,
            existing_invite_id: existingInvites[0].id,
          });
          failedEmails.push(email);
          continue;
        }

        // Check if email corresponds to an existing user who is already a team member
        // note: this query RLS will pass only if they are already a team member, we will get null otherwise
        const { data: existingUser } = await supabaseClient
          .from("users")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (existingUser) {
          // User exists, check if they're already a member
          const { data: existingMembership } = await supabaseClient
            .from("team_memberships")
            .select("user_id")
            .eq("team_id", team_id)
            .eq("user_id", existingUser.id)
            .single();

          if (existingMembership) {
            request.log2.warn("User is already a member", {
              team_id,
              email,
              user_id: existingUser.id,
            });
            failedEmails.push(email);
            continue;
          }
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
          request.log2.error(createError, "Failed to create team invite", {
            email,
          });
          failedEmails.push(email);
          continue;
        }

        inviteIds.push(invite.id);

        // Generate invite URL
        const inviteUrl = `${
          process.env.SITE_BASE_URL || "https://nucleate.dev"
        }/teams/invites?invite_id=${invite.id}`;

        // Send email via Resend
        try {
          const emailHtml = await render(
            TeamInviteEmail({
              inviterName: user.user_metadata?.name || user.email ||
                "A team member",
              teamName: team.name,
              inviteUrl,
            }),
          );

          const { error: emailError } = await resend.emails.send({
            from: "Nucleate <noreply@mail.nucleate.dev>",
            to: [email],
            subject: `You've been invited to join ${team.name} on Nucleate`,
            html: emailHtml,
          });

          if (emailError) {
            request.log2.error(emailError, "Failed to send invite email", {
              email,
            });
            // Don't fail the invite - it was created successfully
          } else {
            request.log2.consoleLogDevOnly("info", "Team invite email sent", {
              invite_id: invite.id,
              team_id,
              email,
            });
          }
        } catch (emailError) {
          request.log2.error(emailError, "Exception sending invite email", {
            email,
          });
          // Continue - the invite was created successfully
        }
      } catch (error) {
        request.log2.error(error, "Exception processing email", { email });
        failedEmails.push(email);
      }
    }

    request.log2.consoleLogDevOnly("info", "Team invites processed", {
      team_id,
      total_emails: emails.length,
      successful: inviteIds.length,
      failed: failedEmails.length,
      role,
    });

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        success: true,
        invite_ids: inviteIds,
        message: `Successfully sent ${inviteIds.length} invite(s)${
          failedEmails.length > 0 ? `, ${failedEmails.length} failed` : ""
        }`,
        ...(failedEmails.length > 0 && { failed_emails: failedEmails }),
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
