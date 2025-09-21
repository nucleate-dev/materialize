import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import fastify, { FastifyInstance } from "fastify";
import fs from "fs/promises";
import { ExpoDevServerService } from "./ExpoDevServerService.js";
import { PublicApiService } from "./PublicApiService.js";

// Load environment variables
dotenv.config();

// --- Configuration ---
const PORT = parseInt(process.env.PORT || "3002", 10);
const WORK_DIR = process.env.WORK_DIR || "/tmp/fargate-builds";
const S3_BUCKET = process.env.S3_BUCKET || "materialize-sites";

// --- AWS Setup ---
const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-2",
  requestHandler: {
    requestTimeout: 300000, // 5 minutes
    connectionTimeout: 60000, // 1 minute
  },
  maxAttempts: 3,
});

// Initialize Services
const expoDevServerService = new ExpoDevServerService(WORK_DIR, S3_BUCKET, s3);
const publicApiService = new PublicApiService(expoDevServerService, WORK_DIR);

// --- Fastify Setup ---
const app: FastifyInstance = fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
    },
  },
  bodyLimit: 50 * 1024 * 1024, // 50MB limit for large file uploads
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
      s3Bucket: S3_BUCKET,
    };
  } catch {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "fargate-build-worker",
      system: "Unable to check",
      workDir: WORK_DIR,
      s3Bucket: S3_BUCKET,
    };
  }
});

// Register public API endpoints
publicApiService.registerRoutes(app);

// --- Graceful Shutdown Handling ---
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  await expoDevServerService.shutdown();
  await app.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  await expoDevServerService.shutdown();
  await app.close();
  process.exit(0);
});

// --- Start Server ---
const start = async (): Promise<void> => {
  try {
    // Ensure work directory exists
    await fs.mkdir(WORK_DIR, { recursive: true });

    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 Fargate build worker listening on port ${PORT}`);
    console.log(`📁 Work directory: ${WORK_DIR}`);
    console.log(`☁️  S3 bucket: ${S3_BUCKET}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
