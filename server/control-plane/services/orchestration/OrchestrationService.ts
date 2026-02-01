import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { GlideClient } from "@valkey/valkey-glide";
import { createClient } from "@supabase/supabase-js";
import {
  APIResponse,
  EndChatRequestBody,
  EndChatResponse,
  HTTP_STATUS,
  RefreshGitHubInstallationTokenErrorResponse,
  RefreshGitHubInstallationTokenRequestBody,
  RefreshGitHubInstallationTokenSuccessResponse,
  StandardErrorResponse,
  StartChatRequestBody,
  StartChatResponse,
} from "../../types/PublicAPITypes.js";
import { CACHE_KEYS } from "../../types/InternalTypes.js";
import {
  hgetallAsActiveBuild,
  hgetallAsDevBuild,
} from "../../utils/cacheInteractionUtils.js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { validateJWTToken } from "../../utils/prototypeAuth.js";
import { createInstallationToken } from "../connectors/github/githubClient.js";
import { getValidGitHubUserAccessToken } from "../connectors/github/githubTokenUtils.js";
import type { Database } from "../../types/supabase.js";
import { handleStartChatImpl } from "./handleStartChat.js";

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
    const { prototype_id } = request.body;

    // Validate orchestration token
    const validation = await validateOrchestrationToken(
      request,
      prototype_id,
      this.logger,
      this.cache,
    );

    if (!validation.isValid) {
      const statusCode =
        validation.errorMessage === "No active build found for this prototype"
          ? HTTP_STATUS.NOT_FOUND
          : HTTP_STATUS.UNAUTHORIZED;

      const errorResponse: StandardErrorResponse = {
        error: statusCode === HTTP_STATUS.NOT_FOUND
          ? "NOT_FOUND"
          : "UNAUTHORIZED",
        message: validation.errorMessage!,
      };
      return reply.status(statusCode).send({
        data: null,
        error: errorResponse,
      });
    }

    // Update active build state in cache
    let activeBuildKey;
    if (
      process.env.NODE_ENV === "development" &&
      process.env.FARGATE_DEV_MODE === "true"
    ) {
      activeBuildKey = CACHE_KEYS.protoDev(prototype_id);
    } else {
      activeBuildKey = CACHE_KEYS.activeBuild(validation.buildId!);
    }
    const currentTime = Math.floor(Date.now() / 1000);

    try {
      await this.cache.hset(activeBuildKey, {
        status: "stable",
        last_touched: currentTime.toString(),
      });

      this.logger.consoleLogDevOnly("info", "Updated build state to stable", {
        prototypeId: prototype_id,
        buildId: validation.buildId,
        timestamp: currentTime,
      });

      const successResponse: EndChatResponse = {
        success: true,
        message: "Chat session ended, build state updated to stable",
      };
      return reply.status(HTTP_STATUS.OK).send({
        data: successResponse,
        error: null,
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to update build state to stable",
        { prototypeId: prototype_id, buildId: validation.buildId },
      );

      const errorResponse: StandardErrorResponse = {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to update build state",
      };
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: errorResponse,
      });
    }
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
    const { prototype_id } = request.body;

    // Step 1: Validate orchestration token
    const validation = await validateOrchestrationToken(
      request,
      prototype_id,
      this.logger,
      this.cache,
    );

    if (!validation.isValid) {
      const statusCode =
        validation.errorMessage === "No active build found for this prototype"
          ? HTTP_STATUS.NOT_FOUND
          : HTTP_STATUS.UNAUTHORIZED;

      const errorResponse: RefreshGitHubInstallationTokenErrorResponse = {
        error: statusCode === HTTP_STATUS.NOT_FOUND
          ? "NOT_FOUND"
          : "UNAUTHORIZED",
        message: validation.errorMessage!,
      };
      return reply.status(statusCode).send({
        data: null,
        error: errorResponse,
      });
    }

    // Step 2: Validate user JWT token
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      this.logger.warn("Missing authorization header", {
        prototypeId: prototype_id,
      });
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: "UNAUTHORIZED",
          message: "Missing Authorization header",
        },
      });
    }

    const token = authHeader.split(" ")[1] ?? "";
    const { user } = await validateJWTToken(token, this.logger);
    if (!user) {
      this.logger.warn("Invalid JWT token", { prototypeId: prototype_id });
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: "UNAUTHORIZED",
          message: "Invalid JWT token",
        },
      });
    }

    // Step 3: Create authenticated Supabase client using user's JWT
    const supabaseAuthClient = createClient<Database>(
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
      // Step 4: Fetch prototype to get team_id (using user's authenticated client)
      const { data: prototype, error: prototypeError } =
        await supabaseAuthClient
          .from("prototypes")
          .select("team_id, github_repo_id")
          .eq("id", prototype_id)
          .single();

      if (prototypeError || !prototype) {
        this.logger.error(
          prototypeError ?? new Error("Prototype not found"),
          "Failed to fetch prototype",
          { prototypeId: prototype_id },
        );
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: "NOT_FOUND",
            message: "Prototype not found",
          },
        });
      }

      // Check if prototype has a GitHub repo
      // if (!prototype.github_repo_id) {
      //   this.logger.warn('Prototype does not have a GitHub repository', {
      //     prototypeId: prototype_id,
      //   });
      //   return reply.status(HTTP_STATUS.BAD_REQUEST).send({
      //     data: null,
      //     error: {
      //       error: 'NO_GITHUB_REPO',
      //       message: 'This prototype does not have a linked GitHub repository',
      //     },
      //   });
      // }

      // Step 5: Fetch GitHub integration for the team (use service role for sensitive data)
      const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      const { data: integration, error: integrationError } =
        await supabaseServiceClient
          .from("github_integrations")
          .select("installation_id, account_type")
          .eq("team_id", prototype.team_id)
          .maybeSingle();

      if (integrationError || !integration) {
        this.logger.error(
          integrationError ?? new Error("GitHub integration not found"),
          "Failed to fetch GitHub integration",
          { teamId: prototype.team_id, prototypeId: prototype_id },
        );
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: "GITHUB_NOT_CONNECTED",
            message: "GitHub integration not found for this team",
          },
        });
      }

      if (integration.account_type === "User") {
        try {
          await getValidGitHubUserAccessToken({
            supabaseClient: supabaseServiceClient,
            teamId: prototype.team_id,
            logger: this.logger,
          });
        } catch (tokenError) {
          this.logger.error(
            tokenError instanceof Error
              ? tokenError
              : new Error(String(tokenError)),
            "Failed to refresh GitHub OAuth token before issuing installation token",
            { prototypeId: prototype_id, teamId: prototype.team_id },
          );
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: "GITHUB_TOKEN_ERROR",
              message: "Failed to refresh GitHub OAuth token",
            },
          });
        }
      }

      // Step 6: Create installation token
      try {
        const installationToken = await createInstallationToken(
          integration.installation_id,
          this.logger,
        );

        this.logger.info("Created GitHub installation token", {
          prototypeId: prototype_id,
          teamId: prototype.team_id,
          installationId: integration.installation_id,
        });

        return reply.status(HTTP_STATUS.OK).send({
          data: {
            installation_token: installationToken.token,
            expires_at: installationToken.expires_at,
          },
          error: null,
        });
      } catch (tokenError) {
        this.logger.error(
          tokenError instanceof Error
            ? tokenError
            : new Error(String(tokenError)),
          "Failed to create GitHub installation token",
          {
            installationId: integration.installation_id,
            prototypeId: prototype_id,
          },
        );
        return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
          data: null,
          error: {
            error: "GITHUB_ERROR",
            message: "Failed to create GitHub installation token",
          },
        });
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Exception in handleRefreshGitHubInstallationToken",
        { prototypeId: prototype_id },
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
}

/**
 * Validates the orchestration token from the request headers
 * @param request - The Fastify request object
 * @param prototypeId - The prototype ID to validate against
 * @returns The build ID if validation succeeds, null if it fails
 */
export async function validateOrchestrationToken(
  request: FastifyRequest,
  prototypeId: string,
  logger: SystemLogger,
  cache: GlideClient,
): Promise<{ isValid: boolean; buildId?: string; errorMessage?: string }> {
  // Extract token from x-orchestration-token header
  const providedToken = request.headers["x-orchestration-token"];

  if (!providedToken || typeof providedToken !== "string") {
    logger.warn("Missing orchestration token in request", {
      prototypeId,
    });
    return {
      isValid: false,
      errorMessage: "Missing x-orchestration-token header",
    };
  }

  if (
    process.env.NODE_ENV === "development" &&
    process.env.FARGATE_DEV_MODE === "true"
  ) {
    const devKey = CACHE_KEYS.protoDev(prototypeId);
    const existingDevData = await hgetallAsDevBuild(cache, devKey);
    if (existingDevData === null) {
      logger.warn(
        "[Development mode] No active build found for prototype",
        {
          prototypeId,
        },
      );
      return {
        isValid: false,
        errorMessage:
          "[development mode] No active build found for this prototype",
      };
    }
    if (existingDevData.orchestration_token !== providedToken) {
      logger.warn("Invalid orchestration token provided", {
        prototypeId,
        devKey,
      });
      return {
        isValid: false,
        errorMessage:
          "[development mode] orchestration token is not valid for this prototype",
      };
    }
    return {
      isValid: true,
    };
  }

  // Get current build ID for this prototype from cache
  const currentBuildIdRaw = await cache.get(
    CACHE_KEYS.protoCurrentBuild(prototypeId),
  );

  if (!currentBuildIdRaw) {
    logger.warn("No active build found for prototype", { prototypeId });
    return {
      isValid: false,
      errorMessage: "No active build found for this prototype",
    };
  }

  // Convert GlideString to string
  const currentBuildId = typeof currentBuildIdRaw === "string"
    ? currentBuildIdRaw
    : currentBuildIdRaw.toString();

  // Fetch the active build from cache
  const activeBuild = await hgetallAsActiveBuild(
    cache,
    CACHE_KEYS.activeBuild(currentBuildId),
  );

  if (!activeBuild) {
    logger.error(
      new Error("Active build data not found in cache"),
      "Build metadata missing",
      { prototypeId, buildId: currentBuildId },
    );
    return {
      isValid: false,
      errorMessage: "Build metadata not found",
    };
  }

  // Validate the token
  if (activeBuild.orchestration_token !== providedToken) {
    logger.warn("Invalid orchestration token provided", {
      prototypeId,
      buildId: currentBuildId,
    });
    return {
      isValid: false,
      errorMessage: "Invalid orchestration token",
    };
  }

  // Token is valid
  logger.consoleLogDevOnly(
    "info",
    "Orchestration token validated successfully",
    {
      prototypeId,
      buildId: currentBuildId,
    },
  );

  return {
    isValid: true,
    buildId: currentBuildId,
  };
}
