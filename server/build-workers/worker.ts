import { S3Client } from "@aws-sdk/client-s3";
import corsPlugin from "@fastify/cors";
import websocket from "@fastify/websocket";
import dotenv from "dotenv";
import fastify, { FastifyInstance } from "fastify";
import fs from "fs/promises";
import { SystemLogger, genRequestIds } from "./loggers/SystemLogger.js";
import { ChatService } from "./services/chat/ChatService.js";
import { CloudflareTunnelManagementService } from "./services/CloudflareTunnelManagementService.js";
import { NucleateDevelopmentServerService } from "./services/dev-server/NucleateDevelopmentServerService.js";
import { FileSyncService } from "./services/FileSyncService.js";
import { SandboxService } from "./services/SandboxService.js";
import { SupabaseClientService } from "./services/SupabaseClientService.js";
import { TerminalService } from "./services/terminals/TerminalService.js";

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
export const WORK_DIR = process.env.WORK_DIR || "/tmp/materialize-dev-server";

// Store worker context (set by /allocate endpoint)
let workerContext: { userId?: string; prototypeId?: string } = {};

export function setWorkerContext(userId: string, prototypeId: string): void {
  workerContext = { userId, prototypeId };
}

export function getWorkerContext(): { userId?: string; prototypeId?: string } {
  return workerContext;
}

// Initialize Supabase client service (single source of truth)
export const supabaseClientService =
  SupabaseClientService.getInstance(baseLogger);

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
export const terminalService = new TerminalService(
  app,
  WORK_DIR,
  baseLogger,
  supabaseClientService,
  {
    prototypeIdProvider: (): string | undefined =>
      workerContext.prototypeId ?? undefined,
  },
);

// Initialize FileSyncService (single instance for all services)
export const fileSyncService = new FileSyncService(
  WORK_DIR,
  supabaseClientService,
  baseLogger,
);

const sandboxService = new SandboxService(
  app,
  WORK_DIR,
  baseLogger,
  terminalService,
);

const cloudflareTunnelManagementService = new CloudflareTunnelManagementService(
  WORK_DIR,
  baseLogger,
);
// Create NucleateDevelopmentServerService with undefined chatService (will be set after ChatService is created)
// This is needed to break the circular dependency between ChatService and NucleateDevelopmentServerService
const nucleateDevelopmentServerService = new NucleateDevelopmentServerService(
  sandboxService,
  cloudflareTunnelManagementService,
  WORK_DIR,
  supabaseClientService,
  fileSyncService,
  terminalService,
  undefined!, // chatService - will be set after ChatService is created
);

const chatService = new ChatService(
  app,
  WORK_DIR,
  baseLogger,
  supabaseClientService,
  sandboxService,
  nucleateDevelopmentServerService,
  terminalService,
  fileSyncService,
);

// Now set the chatService reference in NucleateDevelopmentServerService
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(nucleateDevelopmentServerService as any).codeService = chatService;

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
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "fargate-build-worker",
    workDir: WORK_DIR,
  };
});

// Register public API endpoints
nucleateDevelopmentServerService.registerRoutes(app);

// Setup terminal WebSocket routes
terminalService.registerRoutes();

// Setup sandbox API routes
sandboxService.registerRoutes();

// Setup Claude Code SDK routes
chatService.registerRoutes();

// --- Graceful Shutdown Handling ---
const close = async (): Promise<void> => {
  baseLogger.info("Shutting down build worker...");
  try {
    await nucleateDevelopmentServerService.developmentServerAdapter.stopDevServer(
      baseLogger,
    );
    terminalService.shutdownAllSessions();
    await chatService.shutdown();
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
