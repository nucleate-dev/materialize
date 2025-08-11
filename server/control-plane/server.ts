import Fastify from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { DispatcherService } from "./DispatcherService";
import {
  AutoScalingClient,
} from "@aws-sdk/client-auto-scaling";
import { EC2Client } from "@aws-sdk/client-ec2";
import { GlideClient } from "@valkey/valkey-glide";
import * as dotenv from "dotenv";

dotenv.config();

interface StatusParams {
  prototypeId: string;
}

// Initialize clients
const initializeClients = async () => {
  // Initialize AWS clients
  const autoScalingClient = new AutoScalingClient({
    region: process.env.AWS_REGION!,
  });

  const ec2Client = new EC2Client({
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

  return { cache, ec2Client, autoScalingClient };
};

const fastify = Fastify({
  logger: true,
  bodyLimit: 20 * 1024 * 1024, // 20MB
});
fastify.register(cors, { origin: true, credentials: true });

// Register multipart plugin for file uploads
fastify.register(import("@fastify/multipart"));

let dispatcherService: DispatcherService;

// Remove schema for multipart endpoint since we handle form data directly

// Routes
fastify.post(
  "/dispatch",
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      let prototypeId: string | null = null;
      let writeToDisK = false;
      let hotReload = false;
      let zipBuffer: Buffer | null = null;

      const parts = (request as any).parts();

      for await (const part of parts) {
        if (part.file) {
          // This is a file part - should be the zip file
          zipBuffer = await part.toBuffer();
          fastify.log.info(`Received zip file: ${part.filename || "unknown"}`);
        } else if (part.fieldname === "prototypeId") {
          prototypeId = part.value as string;
        } else if (part.fieldname === "writeToDisK") {
          writeToDisK = part.value === "true" || part.value === true;
        } else if (part.fieldname === "hotReload") {
          hotReload = part.value === "true" || part.value === true;
        }
      }

      if (!prototypeId) {
        return reply.status(400).send({
          error: "prototypeId is required",
        });
      }

      if (!zipBuffer) {
        return reply.status(400).send({
          error: "No zip file provided",
        });
      }

      fastify.log.info(
        `Processing build request for prototype: ${prototypeId}`
      );

      const result = await dispatcherService.processDispatchRequest(
        prototypeId,
        zipBuffer,
        writeToDisK,
        hotReload
      );

      return reply.send({
        success: true,
        prototypeId,
        url: result.buildUrl || "materializeui.com",
        buildErrors: result.buildLog || [],
        status: result.status || "success",
        result,
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      fastify.log.error(e, "Build request failed:");
      return reply.status(500).send({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Health check
fastify.get("/health", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // await redis.ping();
    return { status: "healthy", timestamp: new Date().toISOString() };
  } catch (error) {
    return reply.status(500).send({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Status endpoint
fastify.get(
  "/status/:prototypeId",
  async (
    request: FastifyRequest<{ Params: StatusParams }>,
    reply: FastifyReply
  ) => {
    try {
      // const { prototypeId } = request.params;
      // const activeBuild = await redis.hget(REDIS_KEYS.ACTIVE_BUILDS, prototypeId);

      // if (!activeBuild) {
      //   return reply.status(404).send({ error: "Prototype not found" });
      // }

      return {
        worker: "EC2 instance 1",
        port: null,
        url: "materializeui.com",
        hotReload: false,
        status: [],
      };
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Start server
const start = async () => {
  try {
    // Initialize clients first
    const { cache, ec2Client, autoScalingClient } = await initializeClients();
    
    // Create dispatcher service with initialized clients
    dispatcherService = new DispatcherService(cache, ec2Client, autoScalingClient);
    
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
    await fastify.close();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

start();
