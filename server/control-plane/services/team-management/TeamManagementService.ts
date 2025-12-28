import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type AcceptTeamInviteErrorResponse,
  type AcceptTeamInviteRequestBody,
  type AcceptTeamInviteSuccessResponse,
  type APIResponse,
  type SendTeamInviteErrorResponse,
  type SendTeamInviteRequestBody,
  type SendTeamInviteSuccessResponse,
  type UpdateTeamMemberRoleErrorResponse,
  type UpdateTeamMemberRoleRequestBody,
  type UpdateTeamMemberRoleSuccessResponse,
} from "../../types/PublicAPITypes.js";
import handleAcceptInviteImpl from "./handlers/handleAcceptInvite.js";
import handleSendInviteImpl from "./handlers/handleSendInvite.js";
import handleUpdateMemberRoleImpl from "./handlers/handleUpdateMemberRole.js";

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
    // POST /teams/send-invite
    app.post<{ Body: SendTeamInviteRequestBody }>(
      "/teams/send-invite",
      {
        schema: {
          body: {
            type: "object",
            required: ["email", "team_id", "role"],
            properties: {
              email: {
                type: "string",
                format: "email",
              },
              team_id: {
                type: "string",
              },
              role: {
                type: "string",
                enum: ["owner", "admin", "viewer", "editor"],
              },
            },
          },
        },
      },
      this.handleSendInvite.bind(this),
    );

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

    // POST /teams/update-member-role
    app.post<{ Body: UpdateTeamMemberRoleRequestBody }>(
      "/teams/update-member-role",
      {
        schema: {
          body: {
            type: "object",
            required: ["team_id", "user_id", "role"],
            properties: {
              team_id: {
                type: "string",
              },
              user_id: {
                type: "string",
              },
              role: {
                type: "string",
                enum: ["owner", "admin", "viewer", "editor"],
              },
            },
          },
        },
      },
      this.handleUpdateMemberRole.bind(this),
    );
  }

  /**
   * API Route Handler for sending a team invite.
   */
  private async handleSendInvite(
    request: FastifyRequest<{ Body: SendTeamInviteRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<SendTeamInviteSuccessResponse, SendTeamInviteErrorResponse>
  > {
    return await handleSendInviteImpl(request, reply);
  }

  /**
   * API Route Handler for accepting a team invite.
   */
  private async handleAcceptInvite(
    request: FastifyRequest<{ Body: AcceptTeamInviteRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<AcceptTeamInviteSuccessResponse, AcceptTeamInviteErrorResponse>
  > {
    return await handleAcceptInviteImpl(request, reply);
  }

  /**
   * API Route Handler for updating a team member's role.
   */
  private async handleUpdateMemberRole(
    request: FastifyRequest<{ Body: UpdateTeamMemberRoleRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      UpdateTeamMemberRoleSuccessResponse,
      UpdateTeamMemberRoleErrorResponse
    >
  > {
    return await handleUpdateMemberRoleImpl(request, reply);
  }
}
