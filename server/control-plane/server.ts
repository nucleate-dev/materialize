import Fastify from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { DispatcherService } from "./DispatcherService";
import { CleanupService } from "./CleanupService";
import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import { EC2Client } from "@aws-sdk/client-ec2";
import { GlideClient } from "@valkey/valkey-glide";
import * as dotenv from "dotenv";

dotenv.config();

interface StatusParams {
  prototypeId: string;
}

interface PrecheckBody {
  jwt: string;
  prototype_id: string;
}

interface FileManifestItem {
  id: string;
  path?: string;
  filename: string;
}

interface FileManifest {
  files: FileManifestItem[];
}

interface FileData {
  content: Buffer;
  relativePath: string;
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

/**
 * Sanitizes relative paths to prevent directory traversal attacks
 */
function sanitizeRelPath(p: string): string {
  const path = require('path');
  // prevent ../ and absolute paths
  const norm = path.posix.normalize(p.replace(/\\/g, "/"));
  if (norm.startsWith("../") || path.isAbsolute(norm)) {
    throw new Error(`Illegal path: ${p}`);
  }
  return norm;
}

/**
 * Processes array-of-files from multipart form data
 */
async function processArrayOfFiles(
  partsIter: AsyncIterableIterator<any>
): Promise<{ files: FileData[]; manifest: FileManifest } | null> {
  let manifest: FileManifest | null = null;
  const pendingFiles = new Map<string, Buffer>();
  const pendingMeta = new Map<string, { path?: string; filename: string }>();
  let sawAnyFile = false;

  for await (const part of partsIter) {
    if (part.type === "field") {
      if (part.fieldname === "manifest") {
        try {
          manifest = JSON.parse(String(part.value));
          if (!manifest || !manifest.files || !Array.isArray(manifest.files)) {
            throw new Error("manifest.files must be an array");
          }
          for (const f of manifest.files) {
            if (!f.id || !f.filename) throw new Error("Each manifest item needs id and filename");
            pendingMeta.set(f.id, { path: f.path, filename: f.filename });
          }
        } catch (e: any) {
          throw new Error(`Invalid manifest JSON: ${e.message}`);
        }
      }
    } else if (part.type === "file" && part.fieldname === "files") {
      const id = (part.fields?.id?.value || part.filename || "").toString();
      if (!id) throw new Error("Each files part must include an 'id'");
      const buf = await part.toBuffer();
      pendingFiles.set(id, buf);
      sawAnyFile = true;
    }
  }

  if (!manifest && !sawAnyFile) return null;
  if (!manifest) throw new Error("Missing manifest for array-of-files upload");

  // Process files according to manifest
  const files: FileData[] = [];
  for (const item of manifest.files) {
    const meta = pendingMeta.get(item.id);
    const buf = pendingFiles.get(item.id);
    if (!meta || !buf) throw new Error(`Missing file or metadata for id=${item.id}`);

    const relDir = meta.path ? sanitizeRelPath(meta.path) : "";
    const relFile = sanitizeRelPath(
      relDir ? `${relDir}/${meta.filename}` : meta.filename
    );

    files.push({
      content: buf,
      relativePath: relFile,
    });
  }

  return { files, manifest };
}

/**
 * Creates a zip buffer from array of files
 */
async function createZipFromFiles(files: FileData[]): Promise<Buffer> {
  const JSZip = require('jszip');
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.relativePath, file.content);
  }

  return await zip.generateAsync({ type: 'nodebuffer' });
}

const fastify = Fastify({
  logger: true,
  bodyLimit: 20 * 1024 * 1024, // 20MB
});
fastify.register(cors, { origin: true, credentials: true });

// Register multipart plugin for file uploads
fastify.register(multipart);

let dispatcherService: DispatcherService;
let cleanupService: CleanupService;

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
      const collected: any[] = [];
      for await (const p of parts) collected.push(p);

      // First pass: extract form fields
      for (const part of collected) {
        if (part.type === "field") {
          if (part.fieldname === "prototypeId") {
            prototypeId = part.value as string;
          } else if (part.fieldname === "writeToDisK" || part.fieldname === "writeToDisk") {
            writeToDisK = part.value === "true" || part.value === true;
          } else if (part.fieldname === "hotReload") {
            hotReload = part.value === "true" || part.value === true;
          }
        }
      }

      if (!prototypeId) {
        return reply.status(400).send({
          error: "prototypeId is required",
        });
      }

      // Try array-of-files first
      async function* iterAgain() { for (const p of collected) yield p; }
      
      try {
        const arrayResult = await processArrayOfFiles(iterAgain());
        if (arrayResult) {
          // Convert array-of-files to zip for backwards compatibility with DispatcherService
          zipBuffer = await createZipFromFiles(arrayResult.files);
          fastify.log.info(`Processed ${arrayResult.files.length} files from array-of-files format`);
        }
      } catch (e: any) {
        // If manifest was present but invalid, fail early
        if (e.message?.includes("manifest")) {
          return reply.status(400).send({
            error: "Invalid array-of-files format",
            details: e.message,
          });
        }
        // Otherwise, fall through to zip processing
      }

      // Fallback to zip file processing if array-of-files wasn't used
      if (!zipBuffer) {
        const zipPart = collected.find(p => 
          p.type === "file" && 
          (p.mimetype === "application/zip" || p.filename?.toLowerCase().endsWith(".zip"))
        );
        
        if (zipPart) {
          zipBuffer = await zipPart.toBuffer();
          fastify.log.info(`Received zip file: ${zipPart.filename || "unknown"}`);
        }
      }

      if (!zipBuffer) {
        return reply.status(400).send({
          error: "No valid zip file or file array provided",
        });
      }

      fastify.log.info(
        `Processing build request for prototype: ${prototypeId}`
      );

      const result = await dispatcherService.processDispatchRequest({
        prototypeId,
        zipBuffer,
        hotReload,
      });

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
    const { cache, ec2Client, autoScalingClient } = await initializeClients();

    // Create dispatcher service with initialized clients
    dispatcherService = new DispatcherService(
      cache,
      ec2Client,
      autoScalingClient
    );

    // Create cleanup service with cache
    cleanupService = new CleanupService(cache);

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
