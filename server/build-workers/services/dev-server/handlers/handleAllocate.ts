// PublicApiService.ts
import { FastifyReply, FastifyRequest } from "fastify";
import {
  PublicAllocateRequest,
  PublicAllocateSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { SupabaseClientService } from "../../../services/SupabaseClientService.js";
import { S3Client } from "@aws-sdk/client-s3";
import { ExpoDevServerService } from "../ExpoDevServerService.js";
import { CloudflareTunnelManagementService } from "../../CloudflareTunnelManagementService.js";
import { ChatService } from "../../chat/ChatService.js";

export async function handleAllocateImpl(
    request: FastifyRequest<{ Body: PublicAllocateRequest }>,
    reply: FastifyReply,
    supabaseClientService: SupabaseClientService,
    expoDevServerService: ExpoDevServerService,
    cloudflareTunnelManagementService: CloudflareTunnelManagementService,
    codeService: ChatService,
): Promise<SandboxAPIResponse<PublicAllocateSuccessResponse, StandardErrorResponse>> {
  const {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      prototypeId,
      userId,
      cloudflare_tunnel_token,
      orchestration_token,
      aak,
    } = request.body;

    // Import setWorkerContext dynamically to avoid circular dependency
    const { setWorkerContext } = await import("../../../worker.js");

    // Set worker context so all future requests include userId and prototypeId in logs
    setWorkerContext(userId, prototypeId);

    // Also update current request's logger
    request.log2 = request.log2.child({
      userId,
      prototypeId,
    });

    // Extract JWT token from Authorization header
    const authHeader = request.headers.authorization;
    let jwtToken: string | undefined;

    if (authHeader) {
      // Support both "Bearer <token>" and raw token formats
      if (authHeader.startsWith("Bearer ")) {
        jwtToken = authHeader.substring(7);
      } else {
        jwtToken = authHeader;
      }
    }

    // JWT token is required - fail if not provided
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

    // Create authenticated Supabase client - fail allocation if this fails
    try {
      supabaseClientService.refreshClientWithToken(jwtToken);
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
      // Only set up S3 client if credentials are provided
      if (accessKeyId && secretAccessKey && sessionToken) {
        const scopedS3 = new S3Client({
          region: process.env.AWS_REGION!,
          credentials: { accessKeyId, secretAccessKey, sessionToken },
        });
        expoDevServerService.setS3Client(scopedS3);
        request.log2.consoleLogDevOnly(
          "info",
          "Allocated worker to prototype for S3 access",
        );
      } else {
        request.log2.info(
          "No S3 credentials provided, skipping S3 client setup (dev mode)",
        );
      }

      // If cloudflare tunnel token is provided, start the tunnel
      let tunnelStatus: "connected" | "error" | "timeout" | "not_started" =
        "not_started";
      let tunnelMessage: string | undefined;

      if (cloudflare_tunnel_token) {
        request.log2.consoleLogDevOnly(
          "info",
          "Starting Cloudflare tunnel setup",
        );
        try {
          const result =
            await cloudflareTunnelManagementService.createTunnel(
              cloudflare_tunnel_token,
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
      }

      // Store orchestration token if provided
      if (orchestration_token) {
        codeService.setOrchestrationToken(orchestration_token);
        request.log2.consoleLogDevOnly(
          "info",
          "Orchestration token received and stored in CodeService",
        );
      } else {
        request.log2.error(
          new Error("No orchestration token provided"),
          "No orchestration token provided",
        );
      }

      if (aak) {
        codeService.setAak(aak);
        request.log2.consoleLogDevOnly(
          "info",
          "Anthropic API key received and stored in CodeService",
        );
      } else {
        request.log2.warn("No Anthropic API key provided");
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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