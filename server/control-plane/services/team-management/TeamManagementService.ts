import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type AcceptTeamInviteErrorResponse,
  type AcceptTeamInviteRequestBody,
  type AcceptTeamInviteSuccessResponse,
  type APIResponse,
} from "../../types/PublicAPITypes.js";
import handleAcceptInviteImpl from "./handlers/handleAcceptInvite.js";

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
