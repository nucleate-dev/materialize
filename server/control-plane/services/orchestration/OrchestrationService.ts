import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { GlideClient } from "@valkey/valkey-glide";
import {
  APIResponse,
  EndChatRequestBody,
  EndChatResponse,
  FetchGitHubSourceRepoRequestBody,
  FetchGitHubSourceRepoSuccessResponse,
  GetSupabaseOAuthTokenRequestBody,
  GetSupabaseOAuthTokenSuccessResponse,
  RefreshGitHubInstallationTokenErrorResponse,
  RefreshGitHubInstallationTokenRequestBody,
  RefreshGitHubInstallationTokenSuccessResponse,
  StandardErrorResponse,
  StartChatRequestBody,
  StartChatResponse,
} from "../../types/PublicAPITypes.js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { handleStartChatImpl } from "./handleStartChat.js";
import { handleEndChatImpl } from "./handleEndChat.js";
import { handleRefreshGitHubInstallationToken } from "./handleRefreshGitHubToken.js";
import { handleGetSupabaseOAuthToken } from "./handleGetSupabaseOAuthToken.js";
import { handleFetchGitHubSourceRepo } from "./handleFetchGitHubSourceRepo.js";

export class OrchestrationService {
  private cache: GlideClient;
  private logger: SystemLogger;

  constructor(cache: GlideClient, logger: SystemLogger) {
    this.cache = cache;
    this.logger = logger.child({ service: "OrchestrationService" });
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /orchestration/start-chat
    app.post<{
      Body: StartChatRequestBody;
    }>(
      "/orchestration/start-chat",
      {
        schema: {
          body: {
            type: "object",
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
            },
          },
        },
      },
      this.handleStartChat.bind(this),
    );

    // POST /orchestration/end-chat
    app.post<{
      Body: EndChatRequestBody;
    }>(
      "/orchestration/end-chat",
      {
        schema: {
          body: {
            type: "object",
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
            },
          },
        },
      },
      this.handleEndChat.bind(this),
    );

    // POST /orchestration/refresh-github-installation-token
    app.post<{
      Body: RefreshGitHubInstallationTokenRequestBody;
    }>(
      "/orchestration/refresh-github-installation-token",
      {
        schema: {
          body: {
            type: "object",
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
            },
          },
        },
      },
      this.handleRefreshGitHubInstallationToken.bind(this),
    );

    // POST /orchestration/get-supabase-oauth-token
    app.post<{
      Body: GetSupabaseOAuthTokenRequestBody;
    }>(
      "/orchestration/get-supabase-oauth-token",
      {
        schema: {
          body: {
            type: "object",
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
            },
          },
        },
      },
      this.handleGetSupabaseOAuthToken.bind(this),
    );

    // POST /orchestration/fetch-github-source-repo
    app.post<{
      Body: FetchGitHubSourceRepoRequestBody;
    }>(
      "/orchestration/fetch-github-source-repo",
      {
        schema: {
          body: {
            type: "object",
            required: ["prototype_id", "team_id", "github_repo_id"],
            properties: {
              prototype_id: { type: "string" },
              team_id: { type: "string" },
              github_repo_id: { type: "number" },
            },
          },
        },
      },
      this.handleFetchGitHubSourceRepo.bind(this),
    );
  }

  private async handleStartChat(
    request: FastifyRequest<{ Body: StartChatRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<StartChatResponse, StandardErrorResponse>> {
    return handleStartChatImpl(request, reply, this.cache);
  }

  private async handleEndChat(
    request: FastifyRequest<{ Body: EndChatRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<EndChatResponse, StandardErrorResponse>> {
    return handleEndChatImpl(request, reply, this.cache);
  }

  private async handleRefreshGitHubInstallationToken(
    request: FastifyRequest<{
      Body: RefreshGitHubInstallationTokenRequestBody;
    }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      RefreshGitHubInstallationTokenSuccessResponse,
      RefreshGitHubInstallationTokenErrorResponse
    >
  > {
    return handleRefreshGitHubInstallationToken(request, reply, this.cache);
  }

  private async handleGetSupabaseOAuthToken(
    request: FastifyRequest<{ Body: GetSupabaseOAuthTokenRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<GetSupabaseOAuthTokenSuccessResponse, StandardErrorResponse>
  > {
    return handleGetSupabaseOAuthToken(request, reply, this.cache);
  }

  private async handleFetchGitHubSourceRepo(
    request: FastifyRequest<{ Body: FetchGitHubSourceRepoRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<FetchGitHubSourceRepoSuccessResponse, StandardErrorResponse>
  > {
    return handleFetchGitHubSourceRepo(request, reply, this.cache);
  }
}
