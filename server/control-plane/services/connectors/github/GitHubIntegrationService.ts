import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type APIResponse,
  type GitHubConnectStartErrorResponse,
  type GitHubConnectStartRequestBody,
  type GitHubConnectStartSuccessResponse,
  type GitHubDisconnectErrorResponse,
  type GitHubDisconnectRequestBody,
  type GitHubDisconnectSuccessResponse,
  type GitHubOAuthCallbackQuery,
  type GitHubRepoCreateErrorResponse,
  type GitHubRepoCreateRequestBody,
  type GitHubRepoCreateSuccessResponse,
  type GitHubRepositoriesErrorResponse,
  type GitHubRepositoriesQuery,
  type GitHubRepositoriesSuccessResponse,
  type GitHubStatusErrorResponse,
  type GitHubStatusQuery,
  type GitHubStatusSuccessResponse,
} from "../../../types/PublicAPITypes.js";
import { handleConnectStartImpl } from "./handleConnectStart.js";
import { handleOAuthCallbackImpl } from "./handleOAuthCallback.js";
import { handleGetStatusImpl } from "./handleGetStatus.js";
import { handleDisconnectImpl } from "./handleDisconnect.js";
import { handleGetRepositoriesImpl } from "./handleGetRepositories.js";
import { handleCreateRepositoryForPrototypeImpl } from "./handleCreateRepositoryForPrototype.js";
import { handleGitHubWebhook } from "./handleGitHubWebhook.js";

export interface GitHubRepositoryResponse {
  id?: number;
  name?: string;
  full_name?: string;
  html_url?: string;
  default_branch?: string;
  private?: boolean;
  archived?: boolean;
  owner?: {
    login?: string;
  };
}

/**
 * GitHubIntegrationService handles team-level GitHub App integration
 *
 * Routes:
 * - POST /github/connect/start - Initiate GitHub connection flow
 * - GET /github/oauth/callback - Handle GitHub OAuth callback
 * - GET /github/status - Get team GitHub connection status
 * - POST /github/disconnect - Disconnect GitHub integration
 * - POST /github/webhooks - Handle GitHub App webhooks
 */
export class GitHubIntegrationService {
  constructor() {}

  /**
   * Register routes with Fastify
   */
  public registerRoutes(app: FastifyInstance): void {
    // POST /github/connect/start
    app.post<{ Body: GitHubConnectStartRequestBody }>(
      "/github/connect/start",
      {
        schema: {
          body: {
            type: "object",
            required: ["teamId"],
            properties: {
              teamId: {
                type: "string",
                format: "uuid",
              },
            },
          },
        },
      },
      this.handleConnectStart.bind(this),
    );

    // GET /github/oauth/callback
    app.get<{ Querystring: GitHubOAuthCallbackQuery }>(
      "/github/oauth/callback",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["code", "state"],
            properties: {
              code: { type: "string" },
              state: { type: "string" },
              installation_id: { type: "string" },
            },
          },
        },
      },
      this.handleOAuthCallback.bind(this),
    );

    // GET /github/status
    app.get<{ Querystring: GitHubStatusQuery }>(
      "/github/status",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["teamId"],
            properties: {
              teamId: {
                type: "string",
                format: "uuid",
              },
            },
          },
        },
      },
      this.handleGetStatus.bind(this),
    );

    // POST /github/disconnect
    app.post<{ Body: GitHubDisconnectRequestBody }>(
      "/github/disconnect",
      {
        schema: {
          body: {
            type: "object",
            required: ["teamId"],
            properties: {
              teamId: {
                type: "string",
                format: "uuid",
              },
            },
          },
        },
      },
      this.handleDisconnect.bind(this),
    );

    // POST /github/repo/create
    app.post<{ Body: GitHubRepoCreateRequestBody }>(
      "/github/repo/create",
      {
        schema: {
          body: {
            type: "object",
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
              name: { type: "string" },
              private: { type: "boolean", default: true },
              description: { type: "string" },
            },
          },
        },
      },
      this.handleCreateRepositoryForPrototype.bind(this),
    );

    // GET /github/repositories
    app.get<{ Querystring: GitHubRepositoriesQuery }>(
      "/github/repositories",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["teamId"],
            properties: {
              teamId: {
                type: "string",
                format: "uuid",
              },
            },
          },
        },
      },
      this.handleGetRepositories.bind(this),
    );

    // POST /github/webhooks
    app.post(
      "/github/webhooks",
      {
        config: {
          rawBody: true, // We need raw body for signature verification
        },
      },
      this.handleWebhook.bind(this),
    );
  }

  /**
   * POST /github/connect/start
   * Initiate GitHub App connection flow for a team
   */
  private async handleConnectStart(
    request: FastifyRequest<{ Body: GitHubConnectStartRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      GitHubConnectStartSuccessResponse,
      GitHubConnectStartErrorResponse
    >
  > {
    return handleConnectStartImpl(request, reply);
  }

  /**
   * GET /github/oauth/callback
   * Handle GitHub OAuth callback after user authorizes the app
   */
  private async handleOAuthCallback(
    request: FastifyRequest<{ Querystring: GitHubOAuthCallbackQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    return handleOAuthCallbackImpl(request, reply);
  }

  /**
   * GET /github/status
   * Get GitHub integration status for a team
   */
  private async handleGetStatus(
    request: FastifyRequest<{ Querystring: GitHubStatusQuery }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<GitHubStatusSuccessResponse, GitHubStatusErrorResponse>
  > {
    return handleGetStatusImpl(request, reply);
  }

  /**
   * POST /github/disconnect
   * Disconnect GitHub integration for a team
   */
  private async handleDisconnect(
    request: FastifyRequest<{ Body: GitHubDisconnectRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<GitHubDisconnectSuccessResponse, GitHubDisconnectErrorResponse>
  > {
    return handleDisconnectImpl(request, reply);
  }

  /**
   * GET /github/repositories
   * Get list of repositories accessible to the team's GitHub integration
   */
  private async handleGetRepositories(
    request: FastifyRequest<{ Querystring: GitHubRepositoriesQuery }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      GitHubRepositoriesSuccessResponse,
      GitHubRepositoriesErrorResponse
    >
  > {
    return handleGetRepositoriesImpl(request, reply);
  }

  /**
   * POST /github/repo/create
   * Create a GitHub repository for the team that owns the prototype
   */
  private async handleCreateRepositoryForPrototype(
    request: FastifyRequest<{ Body: GitHubRepoCreateRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<GitHubRepoCreateSuccessResponse, GitHubRepoCreateErrorResponse>
  > {
    return handleCreateRepositoryForPrototypeImpl(request, reply);
  }

  /**
   * POST /github/webhooks
   * Handle GitHub App webhooks
   */
  private async handleWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    return handleGitHubWebhook(request, reply);
  }
}
