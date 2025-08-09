import Fastify from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";

interface DispatchRequest {
  prototypeId: string;
  files: any;
  isHotReload?: boolean;
  userId?: string;
}

interface StatusParams {
  prototypeId: string;
}

const fastify = Fastify({
  logger: true,
  bodyLimit: 20 * 1024 * 1024, // 20MB
});

fastify.register(cors, { origin: true, credentials: true });

const dispatchSchema = {
  body: {
    type: "object",
    required: ["prototypeId", "files"],
    properties: {
      prototypeId: { type: "string", minLength: 1 },
      files: { type: "object" }, // tighten if you know the shape
      isHotReload: { type: "boolean" },
      userId: { type: "string" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        prototypeId: { type: "string" },
        url: { type: "string" },
        buildErrors: { type: "array", items: { type: "string" } },
        status: { type: "string" },
      },
      required: ["success", "prototypeId", "url", "buildErrors", "status"],
    },
  },
} as const;

// Routes
fastify.post(
  "/dispatch",
  { schema: dispatchSchema },
  async (
    request: FastifyRequest<{ Body: DispatchRequest }>,
    reply: FastifyReply
  ) => {
    try {
      const { prototypeId, files, isHotReload = false, userId } = request.body;

      if (!prototypeId || !files) {
        return reply.status(400).send({
          error: "Missing required fields: prototypeId, files",
        });
      }

      // const result = await controlPlane.processBuildRequest(
      //   prototypeId,
      //   files,
      //   isHotReload
      // );

      return reply.send({
        success: true,
        prototypeId,
        url: "materializeui.com",
        buildErrors: [],
        status: "success",
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
