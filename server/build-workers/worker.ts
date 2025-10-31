import { S3Client } from "@aws-sdk/client-s3";
import corsPlugin from "@fastify/cors";
import websocket from "@fastify/websocket";
import dotenv from "dotenv";
import fastify, { FastifyInstance } from "fastify";
import fs from "fs/promises";
import { SystemLogger, genRequestIds } from "./loggers/SystemLogger.js";
import { ExpoDevServerService } from "./services/ExpoDevServerService.js";
import { CloudflareTunnelManagementService } from "./services/CloudflareTunnelManagementService.js";
import { PublicApiService } from "./services/PublicApiService.js";
import { SandboxService } from "./services/SandboxService.js";
import { TerminalService } from "./services/TerminalService.js";

// Load environment variables
dotenv.config();

// Extend FastifyRequest to include our custom logger
declare module "fastify" {
  interface FastifyRequest {
    log2: SystemLogger;
  }
}

export const baseLogger = new SystemLogger({
  service: "build-worker",
  env: process.env.NODE_ENV || "development",
  metricNamespace: "Materialize/BuildWorker",
  redactKeys: ["authorization", "cookie", "x-api-key"],
});

// --- Configuration ---
const PORT = parseInt(process.env.PORT || "3002", 10);
const WORK_DIR = process.env.WORK_DIR || "/tmp/materialize-dev-server";

// Store worker context (set by /allocate endpoint)
let workerContext: { userId?: string; prototypeId?: string } = {};

export function setWorkerContext(userId: string, prototypeId: string): void {
  workerContext = { userId, prototypeId };
}

export function getWorkerContext(): { userId?: string; prototypeId?: string } {
  return workerContext;
}

// Initialize default S3 client (uses EC2 IAM role credentials)
// This will be replaced with scoped credentials when /allocate is called
const defaultS3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

// --- Fastify Setup ---
const app: FastifyInstance = fastify({
  logger: true,
  disableRequestLogging: true,
  bodyLimit: 50 * 1024 * 1024, // 50MB limit for large file uploads
});

// Register CORS plugin
app.register(corsPlugin, {
  origin: true, // Allow all origins in development (restrict in production)
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
});

await app.register(websocket, {
  options: {
    perMessageDeflate: true,
    // raise if you plan to paste big chunks into the terminal
    maxPayload: 1024 * 1024, // 1MB
  },
});

// ---- Initialize Services ----
export const terminalService = new TerminalService(app, WORK_DIR, baseLogger);
const expoDevServerService = new ExpoDevServerService(
  WORK_DIR,
  defaultS3Client,
  terminalService,
);
const sandboxService = new SandboxService(WORK_DIR, baseLogger);
const cloudflareTunnelManagementService = new CloudflareTunnelManagementService(
  WORK_DIR,
  baseLogger,
);
const publicApiService = new PublicApiService(
  expoDevServerService,
  sandboxService,
  cloudflareTunnelManagementService,
  WORK_DIR,
);

app.addHook("onRequest", async (req) => {
  const { requestId, traceId } = genRequestIds(
    req.headers as Record<string, string | string[] | undefined>,
  );

  // Get worker context (userId and prototypeId from /allocate)
  const context = getWorkerContext();

  req.log2 = baseLogger.child({
    requestId,
    traceId,
    route: req.routeOptions?.url,
    method: req.method,
    ...(context.userId && { userId: context.userId }),
    ...(context.prototypeId && { prototypeId: context.prototypeId }),
  });
});

// --- Health Check ---
app.get("/health", async () => {
  try {
    const resources = await expoDevServerService.checkSystemResources();
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "fargate-build-worker",
      system: {
        disk: resources.disk.split("\n")[1],
        memory: resources.memory.split("\n")[1],
        nodeProcesses: resources.processes,
      },
      workDir: WORK_DIR,
    };
  } catch {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "fargate-build-worker",
      system: "Unable to check",
      workDir: WORK_DIR,
    };
  }
});

// Register public API endpoints
publicApiService.registerRoutes(app);

// Setup terminal WebSocket routes
terminalService.registerRoutes();

// --- Graceful Shutdown Handling ---
const close = async (): Promise<void> => {
  baseLogger.info("Shutting down build worker...");
  try {
    await expoDevServerService.shutdown();
    terminalService.shutdownAllSessions();
    await app.close();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

// --- Start Server ---
const start = async (): Promise<void> => {
  try {
    // Ensure work directory exists
    await fs.mkdir(WORK_DIR, { recursive: true });

    await app.listen({ port: PORT, host: "0.0.0.0" });
    baseLogger.info("Build worker started successfully", {
      port: PORT,
      workDir: WORK_DIR,
    });
  } catch (err) {
    baseLogger.error(err, "Failed to start build worker");
    process.exit(1);
  }
};

start();
