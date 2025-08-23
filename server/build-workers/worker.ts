import AWS from "aws-sdk";
import { spawn, SpawnOptions } from "child_process";
import dotenv from "dotenv";
import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fs from "fs/promises";
import { BuilderService } from "./BuilderService.js";
import { ExpoDevServerService } from "./ExpoDevServerService.js";
import { PublicApiService } from "./PublicApiService.js";

// Load environment variables
dotenv.config();

// --- Configuration ---
const PORT = parseInt(process.env.PORT || "3002", 10);
const WORK_DIR = process.env.WORK_DIR || "/tmp/fargate-builds";
const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const S3_BUCKET = process.env.S3_BUCKET || "materialize-sites";

// --- AWS Setup ---
AWS.config.update({
  region: AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  httpOptions: {
    timeout: 300000, // 5 minutes
    connectTimeout: 60000, // 1 minute
  },
  maxRetries: 3,
});

// Verify credentials are loaded
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("Missing AWS credentials in environment variables");
  process.exit(1);
}

const s3 = new AWS.S3();

// Initialize BuilderService
const builderService = new BuilderService(WORK_DIR, S3_BUCKET, s3);

// Initialize ExpoDevServerService
const expoDevServerService = new ExpoDevServerService(WORK_DIR);

// Initialize PublicApiService
const publicApiService = new PublicApiService(
  builderService,
  expoDevServerService,
  WORK_DIR,
);

// --- Utility Functions ---

export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
  timeoutMs: number = 300000, // 5 minutes default
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let processExited = false;

    const spawnOptions: SpawnOptions = {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    };

    const childProcess = spawn(command, args, spawnOptions);

    // Set up timeout
    const timeout = setTimeout(() => {
      if (!processExited) {
        processExited = true;
        childProcess.kill("SIGKILL");
        reject(
          new Error(
            `Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`,
          ),
        );
      }
    }, timeoutMs);

    // Handle stdout
    childProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      stdout += output;
      // Log real-time output
      console.log(`[STDOUT] ${output.trim()}`);
    });

    // Handle stderr
    childProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      stderr += output;
    });

    // Handle process exit
    childProcess.on("close", (code: number | null) => {
      if (!processExited) {
        processExited = true;
        clearTimeout(timeout);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: code || 0,
        });
      }
    });

    // Handle process errors
    childProcess.on("error", (error: Error) => {
      if (!processExited) {
        processExited = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start command: ${error.message}`));
      }
    });

    // Handle unexpected termination
    process.on("exit", () => {
      if (!processExited) {
        processExited = true;
        clearTimeout(timeout);
        childProcess.kill("SIGKILL");
      }
    });
  });
}

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
app.get("/health", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const resources = await builderService.checkSystemResources();
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
  } catch (error) {
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
