// PublicApiService.ts
import { FastifyReply, FastifyRequest } from "fastify";
import {
  PublicAllocateRequest,
  PublicAllocateSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { S3Client } from "@aws-sdk/client-s3";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";

export async function handleAllocateImpl(
  request: FastifyRequest<{ Body: PublicAllocateRequest }>,
  reply: FastifyReply,
  materializeDevelopmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<PublicAllocateSuccessResponse, StandardErrorResponse>
> {
  const { s3_credentials, user_details, cloudflare_credentials, keys } =
    request.body;

  // 1. USER CREDENTIALS:
  // Import setWorkerContext dynamically to avoid circular dependency
  const { setWorkerContext } = await import("../../../worker.js");
  // Set worker context so all future requests include userId and prototypeId in logs
  setWorkerContext(user_details.userId, user_details.prototypeId);
  // Also update current request's logger
  request.log2 = request.log2.child({
    userId: user_details.userId,
    prototypeId: user_details.prototypeId,
  });

  // 2. SUPABASE CLIENT INSTANTIATION:
  // Extract JWT token from Authorization header
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
  try {
    materializeDevelopmentServerService.supabaseClientService.refreshClientWithToken(
      jwtToken,
    );
    request.log2.consoleLogDevOnly(
      "info",
      "Initialized authenticated Supabase client for worker",
    );
  } catch (supabaseError) {
    const errorMessage =
      supabaseError instanceof Error
        ? supabaseError.message
        : String(supabaseError);
    request.log2.error(
      supabaseError instanceof Error
        ? supabaseError
        : new Error(String(supabaseError)),
      "Failed to initialize Supabase client - allocation failed",
    );
    reply.code(500);
    return {
      data: null,
      error: {
        error: "Failed to initialize Supabase client",
        message: "Failed to initialize Supabase client",
        details: errorMessage,
      },
    };
  }

  try {
    // 3. S3 CLIENT INSTANTIATION:
    const scopedS3 = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: s3_credentials.accessKeyId,
        secretAccessKey: s3_credentials.secretAccessKey,
        sessionToken: s3_credentials.sessionToken,
      },
    });
    materializeDevelopmentServerService.setS3Client(scopedS3);

    // 4. CLOUDFLARE TUNNEL:
    let tunnelStatus: "connected" | "error" | "timeout" | "not_started" =
      "not_started";
    let tunnelMessage: string | undefined;

    request.log2.consoleLogDevOnly("info", "Starting Cloudflare tunnel setup");
    try {
      const result =
        await materializeDevelopmentServerService.cloudflareTunnelManagementService.createTunnel(
          cloudflare_credentials.cloudflare_tunnel_token,
        );
      tunnelStatus = result.status;
      tunnelMessage = result.message;

      if (tunnelStatus === "connected") {
        request.log2.info("Cloudflare tunnel connected successfully");
      } else if (tunnelStatus === "timeout") {
        request.log2.warn("Cloudflare tunnel connection timed out");
      } else if (tunnelStatus === "error") {
        request.log2.error(
          new Error(tunnelMessage ?? "Cloudflare tunnel failed to connect"),
          "Cloudflare tunnel connection error",
        );
      }
    } catch (tunnelError) {
      tunnelStatus = "error";
      tunnelMessage =
        tunnelError instanceof Error
          ? tunnelError.message
          : "Failed to start Cloudflare tunnel";
      request.log2.error(tunnelError, "Failed to start Cloudflare tunnel");
    }

    // 5. CREDENTIALS:
    materializeDevelopmentServerService.codeService.setOrchestrationToken(
      keys.orchestration_token,
    );
    if (keys.aak) {
      materializeDevelopmentServerService.codeService.setAak(keys.aak);
    } else {
      request.log2.warn("No aak provided during allocation");
    }

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
