// PublicApiService.ts
import { S3Client } from "@aws-sdk/client-s3";
import { FastifyReply, FastifyRequest } from "fastify";
import {
  PublicAllocateRequest,
  PublicAllocateSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import {
  DEFAULT_PROTOTYPE_FRAMEWORK,
  NucleateDevelopmentServerService,
} from "../NucleateDevelopmentServerService.js";

export async function handleAllocateImpl(
  request: FastifyRequest<{ Body: PublicAllocateRequest }>,
  reply: FastifyReply,
  materializeDevelopmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<PublicAllocateSuccessResponse, StandardErrorResponse>
> {
  const {
    s3_credentials,
    user_details,
    cloudflare_credentials,
    keys,
    source_repository,
  } = request.body;

  // 1. Extract JWT token from Authorization header
  const authHeader = request.headers.authorization;
  let jwtToken: string | undefined;
  if (authHeader) {
    if (authHeader.startsWith("Bearer ")) {
      jwtToken = authHeader.substring(7);
    } else {
      jwtToken = authHeader;
    }
  }
  if (!jwtToken) {
    const errorMessage = "No JWT token provided in Authorization header";
    request.log2.error(new Error(errorMessage), "Allocation failed");
    reply.code(401);
    return {
      data: null,
      error: {
        error: "Authentication required",
        message: errorMessage,
        details: errorMessage,
      },
    };
  }
  // 2. SUPABASE CLIENT INSTANTIATION:
  materializeDevelopmentServerService.supabaseClientService
    .refreshClientWithToken(
      jwtToken,
    );
  request.log2.consoleLogDevOnly(
    "info",
    "Initialized authenticated Supabase client for worker",
  );

  // 3. SET WORKER CONTEXT:
  const supabaseClient = materializeDevelopmentServerService
    .supabaseClientService.getClient();
  const { data: prototypeRow, error: prototypeError } = await supabaseClient
    .from("prototypes")
    .select("framework, team_id")
    .eq("id", user_details.prototypeId)
    .single();
  const prototypeTeamId = prototypeRow?.team_id ?? undefined;

  // Import setWorkerContext dynamically to avoid circular dependency
  const { setWorkerContext } = await import("../../../worker.js");
  setWorkerContext(
    user_details.userId,
    user_details.prototypeId,
    prototypeTeamId,
  );
  // Also update current request's logger
  request.log2 = request.log2.child({
    userId: user_details.userId,
    prototypeId: user_details.prototypeId,
    teamId: prototypeTeamId,
  });

  // 3b. CHECK FOR USER OAUTH TOKEN AND SET UP AUTH ENVIRONMENT
  try {
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from("user_claude_tokens")
      .select("oauth_token, is_valid")
      .eq("user_id", user_details.userId)
      .eq("is_valid", true)
      .maybeSingle();

    if (tokenError) {
      request.log2.warn("Failed to query user OAuth token", {
        error: tokenError.message,
        code: tokenError.code,
      });
    } else if (tokenData?.oauth_token) {
      // Set up environment for Claude SDK OAuth authentication
      process.env.CLAUDE_CODE_OAUTH_TOKEN = tokenData.oauth_token;
      delete process.env.ANTHROPIC_API_KEY;

      // Store token reference in ChatService for usage tracking
      materializeDevelopmentServerService.chatService.setUserOAuthToken(
        tokenData.oauth_token,
      );

      request.log2.info("User OAuth token configured for worker", {
        userId: user_details.userId,
        tokenLength: tokenData.oauth_token.length,
      });
    } else {
      request.log2.consoleLogDevOnly(
        "info",
        "No OAuth token found for user, using platform API key",
        { userId: user_details.userId },
      );
    }
  } catch (error) {
    request.log2.error(
      error instanceof Error ? error : new Error(String(error)),
      "Error setting up OAuth token authentication",
      { userId: user_details.userId },
    );
    // Continue with platform API key - don't fail allocation
  }

  // 4 PROTOTYPE FRAMEWORK INITIALIZATION:
  if (prototypeError) {
    request.log2.error(
      prototypeError,
      "Failed to fetch prototype framework; falling back to default",
    );
    materializeDevelopmentServerService.setPrototypeFramework(
      DEFAULT_PROTOTYPE_FRAMEWORK,
    );
  } else {
    materializeDevelopmentServerService.setPrototypeFramework(
      prototypeRow?.framework ?? DEFAULT_PROTOTYPE_FRAMEWORK,
    );
  }
  if (cloudflare_credentials.cloudflare_tunnel_hostname) {
    materializeDevelopmentServerService.setCloudflareTunnelHostname(
      cloudflare_credentials.cloudflare_tunnel_hostname,
    );
  }

  // 4b. SET SOURCE REPOSITORY IF PROVIDED:
  if (source_repository) {
    materializeDevelopmentServerService.setSourceRepository({
      githubRepoId: source_repository.github_repo_id,
      installationId: source_repository.installation_id,
      repositoryUrl: source_repository.repository_url,
      repositoryOwner: source_repository.repository_owner,
      repositoryName: source_repository.repository_name,
      defaultBranch: source_repository.default_branch,
      fullName: source_repository.full_name,
    });
    request.log2.info("Source repository configured for worker", {
      repositoryName: source_repository.repository_name,
      fullName: source_repository.full_name,
    });
  }

  try {
    // 5. S3 CLIENT INSTANTIATION:
    // TODO: for dev ec2 flow, just do S3Client()
    let scopedS3: S3Client;
    if (process.env.FARGATE_DEV_MODE === "true") {
      scopedS3 = new S3Client();
    } else {
      scopedS3 = new S3Client({
        region: process.env.AWS_REGION!,
        credentials: {
          accessKeyId: s3_credentials.accessKeyId,
          secretAccessKey: s3_credentials.secretAccessKey,
          sessionToken: s3_credentials.sessionToken,
        },
      });
    }
    materializeDevelopmentServerService.setS3Client(scopedS3);

    let tunnelStatus: "connected" | "error" | "timeout" | "not_started" =
      "not_started";
    let tunnelMessage: string | undefined;
    // 6. CLOUDFLARE TUNNEL:
    if (process.env.FARGATE_DEV_MODE !== "true") {
      request.log2.consoleLogDevOnly(
        "info",
        "Starting Cloudflare tunnel setup",
      );
      try {
        const result = await materializeDevelopmentServerService
          .cloudflareTunnelManagementService.createTunnel(
            cloudflare_credentials.cloudflare_tunnel_token,
          );
        tunnelStatus = result.status;
        tunnelMessage = result.message;

        if (tunnelStatus === "connected") {
          request.log2.info("Cloudflare tunnel connected successfully");
        } else if (tunnelStatus === "timeout") {
          throw new Error(
            `Cloudflare tunnel connection timed out: ${tunnelMessage}`,
          );
        } else if (tunnelStatus === "error") {
          throw new Error(
            tunnelMessage ?? "Cloudflare tunnel failed to connect",
          );
        }
      } catch (tunnelError) {
        tunnelStatus = "error";
        tunnelMessage = tunnelError instanceof Error
          ? tunnelError.message
          : "Failed to start Cloudflare tunnel";
        request.log2.error(tunnelError, "Failed to start Cloudflare tunnel");
        throw tunnelError instanceof Error
          ? tunnelError
          : new Error(tunnelMessage);
      }
    }

    // 7. CREDENTIALS:
    if (keys.aak) {
      materializeDevelopmentServerService.chatService.setAak(keys.aak);
    } else {
      request.log2.warn("No aak provided during allocation");
    }

    // 8. SET ORCHESTRATION TOKEN IN SandboxOrchestrationInitiatorService:
    materializeDevelopmentServerService.sandboxOrchestrationInitiatorService.setOrchestrationToken(
      keys.orchestration_token,
    );

    reply.status(200);
    return {
      data: {
        tunnel_status: tunnelStatus,
        tunnel_message: tunnelMessage,
      },
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    request.log2.error(error, "Failed to allocate worker to prototype", {
      errorMessage,
    });
    reply.code(500);
    return {
      data: null,
      error: {
        error: "Failed to allocate worker to prototype",
        message: "Failed to allocate worker to prototype",
        details: errorMessage,
      },
    };
  }
}
