import Fastify from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { DispatcherService } from "./DispatcherService.js";
import { CleanupService } from "./CleanupService.js";
import { ECSClient } from "@aws-sdk/client-ecs";
import { GlideClient } from "@valkey/valkey-glide";
import * as dotenv from "dotenv";

dotenv.config();

interface PrecheckBody {
  jwt: string;
  prototype_id: string;
}

interface FileInput {
  path: string;
  content: string;
  isBase64?: boolean;
}

interface DispatchRequestBody {
  jwt: string;
  prototype_id: string;
  framework?: "expo_react_native" | "react";
  files: FileInput[]; // Array of file objects
  file_scope: "updates" | "complete";
  hot_reload?: boolean;
}

// Initialize clients
const initializeClients = async () => {
  const ecsClient = new ECSClient({
    region: process.env.AWS_REGION!,
  });

  // Initialize Valkey client
  const endpointHost = process.env.CACHE_HOST!;
  const port = parseInt(process.env.CACHE_PORT!);
  const username = process.env.CACHE_USERNAME!;
  const password = process.env.CACHE_PASSWORD!;

  const cache = await GlideClient.createClient({
    addresses: [{ host: endpointHost, port }],
    useTLS: true,
    credentials: {
      username,
      password,
    },
    clientName: "control-plane",
    requestTimeout: 2000,
  });

  console.log("Valkey cache initialized successfully");

  return { cache, ecsClient };
};

const fastify = Fastify({
  logger: true,
  bodyLimit: 20 * 1024 * 1024, // 20MB
});
fastify.register(cors, { origin: true, credentials: true });

let dispatcherService: DispatcherService;
let cleanupService: CleanupService;
let cache: GlideClient;

// Routes

// Health check
fastify.get("/health", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const result = await cache.ping();
    if (result === "PONG") {
      return reply.send({
        status: "healthy",
        timestamp: new Date().toISOString(),
      });
    } else {
      return reply.status(500).send({
        status: "unhealthy",
        error: `Cache ping returned: ${result}`,
      });
    }
  } catch (error) {
    return reply.status(500).send({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

fastify.post(
  "/dispatch",
  async (
    request: FastifyRequest<{ Body: DispatchRequestBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { jwt, prototype_id, framework, files, file_scope, hot_reload } =
        request.body;

      // Validation
      if (!jwt) {
        return reply.status(400).send({
          error: "jwt is required",
        });
      }

      if (!prototype_id) {
        return reply.status(400).send({
          error: "prototype_id is required",
        });
      }

      // Default framework to expo_react_native if not provided
      const selectedFramework = framework || "expo_react_native";

      if (!files || !Array.isArray(files)) {
        return reply.status(400).send({
          error: "files is required and must be an array",
        });
      }

      if (!file_scope) {
        return reply.status(400).send({
          error: "file_scope is required",
        });
      }

      if (files.length === 0) {
        return reply.status(400).send({
          error: "files cannot be empty",
        });
      }

      fastify.log.info(
        `Processing dispatch request for prototype: ${prototype_id}`
      );

      const result = await dispatcherService.processDispatchRequest({
        jwt,
        prototype_id,
        framework: selectedFramework,
        files,
        file_scope,
      });

      return reply.send(result);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      fastify.log.error(e, "Build request failed:");

      // Check if it's an authentication or permission error
      if (
        e.message.includes("Invalid JWT") ||
        e.message.includes("not authenticated")
      ) {
        return reply.status(401).send({
          error: "Unauthorized",
          error_message: e.message,
        });
      }

      if (
        e.message.includes("Prototype not found") ||
        e.message.includes("does not have permissions")
      ) {
        return reply.status(404).send({
          error: "Prototype not found",
          error_message: e.message,
        });
      }

      return reply.status(500).send({
        status: "error",
        viewing_url: "",
        build_errors: [],
        build_warnings: [],
        error_message: e.message,
      });
    }
  }
);

// Prototype dispatch precheck endpoint
fastify.post(
  "/dispatch-precheck",
  async (
    request: FastifyRequest<{ Body: PrecheckBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { jwt, prototype_id } = request.body;

      if (!jwt) {
        return reply.status(400).send({
          error: "JWT is required",
        });
      }

      if (!prototype_id) {
        return reply.status(400).send({
          error: "prototype_id is required",
        });
      }

      fastify.log.info(
        `Processing precheck request for prototype: ${prototype_id}`
      );

      const result = await dispatcherService.prototypeDispatchPrecheck(
        jwt,
        prototype_id
      );

      return reply.send({
        success: true,
        state: result.state,
        status: result.status,
        viewing_url: result.viewing_url,
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      fastify.log.error(e, "Precheck request failed:");

      // Check if it's an authentication or permission error
      if (
        e.message.includes("Invalid JWT") ||
        e.message.includes("not authenticated")
      ) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: e.message,
        });
      }

      if (
        e.message.includes("Prototype not found") ||
        e.message.includes("does not have permissions")
      ) {
        return reply.status(404).send({
          error: "Prototype not found",
          message: e.message,
        });
      }

      return reply.status(500).send({
        error: "Internal server error",
        message: e.message,
      });
    }
  }
);

// Start server
const start = async () => {
  try {
    // Initialize clients first
    const { cache: cacheClient, ecsClient } = await initializeClients();

    // Assign to global variables
    cache = cacheClient;

    // Create dispatcher service with initialized clients
    dispatcherService = new DispatcherService(cache, ecsClient);

    // Create cleanup service with cache and ECS client
    cleanupService = new CleanupService(cache, ecsClient);

    await fastify.listen({
      port: 3000,
      host: "0.0.0.0",
    });
    fastify.log.info("Control plane server started successfully");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

const close = async () => {
  fastify.log.info("Shutting down...");
  try {
    // Stop cleanup services
    if (cleanupService) {
      cleanupService.stopCleanupServices();
    }
    await fastify.close();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

start();
