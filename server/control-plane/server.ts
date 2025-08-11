import Fastify from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { DispatcherService } from "./DispatcherService";

interface StatusParams {
  prototypeId: string;
}

const fastify = Fastify({
  logger: true,
  bodyLimit: 20 * 1024 * 1024, // 20MB
});
fastify.register(cors, { origin: true, credentials: true });

// Register multipart plugin for file uploads
fastify.register(import('@fastify/multipart'));

const dispatcherService = new DispatcherService();

// Remove schema for multipart endpoint since we handle form data directly

// Routes
fastify.post("/dispatch", async (request: FastifyRequest, reply: FastifyReply) => {
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
        fastify.log.info(`Received zip file: ${part.filename || 'unknown'}`);
      } else if (part.fieldname === 'prototypeId') {
        prototypeId = part.value as string;
      } else if (part.fieldname === 'writeToDisK') {
        writeToDisK = part.value === 'true' || part.value === true;
      } else if (part.fieldname === 'hotReload') {
        hotReload = part.value === 'true' || part.value === true;
      }
    }

    if (!prototypeId) {
      return reply.status(400).send({
        error: "prototypeId is required"
      });
    }

    if (!zipBuffer) {
      return reply.status(400).send({
        error: "No zip file provided"
      });
    }

    fastify.log.info(`Processing build request for prototype: ${prototypeId}`);

    const result = await dispatcherService.processBuildRequest(
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
});

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
