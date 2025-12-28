import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type AcceptTeamInviteErrorResponse,
  type AcceptTeamInviteRequestBody,
  type AcceptTeamInviteSuccessResponse,
  type APIResponse,
  type SendTeamInviteErrorResponse,
  type SendTeamInviteRequestBody,
  type SendTeamInviteSuccessResponse,
} from "../../types/PublicAPITypes.js";
import handleAcceptInviteImpl from "./handlers/handleAcceptInvite.js";
import handleSendInviteImpl from "./handlers/handleSendInvite.js";

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
                enum: ["owner", "admin", "member"],
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
}
