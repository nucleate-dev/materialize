const fastify = require("fastify")({ logger: true });
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const AWS = require("aws-sdk");
const archiver = require("archiver");
const { v4: uuidv4 } = require("uuid");

// Initialize AWS S3
const s3 = new AWS.S3({ region: process.env.AWS_REGION || "us-east-1" });

// Configuration
const CONFIG = {
  WORKSPACE_DIR: process.env.WORKSPACE_DIR || "./workspace",
  S3_BUCKET: process.env.S3_BUCKET || "rn-web-builds",
  CLOUDFRONT_URL:
    process.env.CLOUDFRONT_URL || "https://your-cloudfront-domain.com",
  METRO_TIMEOUT: 60000, // 1 minute timeout for metro startup
  BUILD_TIMEOUT: 300000, // 5 minutes timeout for builds
};

class BuildWorkerService {
  constructor() {
    this.activeMetroServers = new Map(); // prototypeId -> { process, port, status }
    this.activeBuildProcesses = new Map(); // prototypeId -> process
    this.ensureWorkspaceDir();
  }

  // Ensure workspace directory exists
  async ensureWorkspaceDir() {
    try {
      await fs.ensureDir(CONFIG.WORKSPACE_DIR);
      fastify.log.info(`Workspace directory ready: ${CONFIG.WORKSPACE_DIR}`);
    } catch (error) {
      fastify.log.error("Failed to create workspace directory:", error);
      throw error;
    }
  }

  // Get prototype directory path
  getPrototypeDir(prototypeId) {
    return path.join(CONFIG.WORKSPACE_DIR, prototypeId);
  }

  // Write files to prototype directory
  async writeFiles(prototypeId, files) {
    const prototypeDir = this.getPrototypeDir(prototypeId);

    try {
      // Ensure prototype directory exists
      await fs.ensureDir(prototypeDir);

      // Write all files
      const writePromises = Object.entries(files).map(
        async ([filePath, content]) => {
          const fullPath = path.join(prototypeDir, filePath);

          // Ensure parent directory exists
          await fs.ensureDir(path.dirname(fullPath));

          // Write file
          if (typeof content === "string") {
            await fs.writeFile(fullPath, content, "utf8");
          } else {
            // Handle binary files if needed
            await fs.writeFile(fullPath, content);
          }
        }
      );

      await Promise.all(writePromises);
      fastify.log.info(`Files written for prototype ${prototypeId}`);

      return { success: true, filesWritten: Object.keys(files).length };
    } catch (error) {
      fastify.log.error(`Error writing files for ${prototypeId}:`, error);
      throw error;
    }
  }

  // Build React Native Web app
  async buildApp(prototypeId) {
    const prototypeDir = this.getPrototypeDir(prototypeId);
    const buildId = uuidv4();

    return new Promise((resolve, reject) => {
      const buildProcess = spawn("bun", ["run", "build"], {
        cwd: prototypeDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "production" },
      });

      this.activeBuildProcesses.set(prototypeId, buildProcess);

      let stdout = "";
      let stderr = "";

      buildProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      buildProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      // Set timeout for build process
      const timeoutId = setTimeout(() => {
        buildProcess.kill("SIGKILL");
        reject(new Error("Build timeout exceeded"));
      }, CONFIG.BUILD_TIMEOUT);

      buildProcess.on("close", async (code) => {
        clearTimeout(timeoutId);
        this.activeBuildProcesses.delete(prototypeId);

        try {
          if (code === 0) {
            // Build successful, upload to S3
            const s3Key = await this.uploadBuildToS3(prototypeId, buildId);
            const url = `${CONFIG.CLOUDFRONT_URL}/${s3Key}`;

            resolve({
              success: true,
              buildId,
              url,
              status: "completed",
              buildErrors: stderr ? [stderr] : [],
            });
          } else {
            resolve({
              success: false,
              buildId,
              status: "failed",
              buildErrors: [stderr || `Build failed with code ${code}`],
            });
          }
        } catch (uploadError) {
          fastify.log.error("Error uploading build:", uploadError);
          resolve({
            success: false,
            buildId,
            status: "upload_failed",
            buildErrors: [uploadError.message],
          });
        }
      });

      buildProcess.on("error", (error) => {
        clearTimeout(timeoutId);
        this.activeBuildProcesses.delete(prototypeId);
        reject(error);
      });
    });
  }

  // Upload build to S3
  async uploadBuildToS3(prototypeId, buildId) {
    const prototypeDir = this.getPrototypeDir(prototypeId);
    const buildDir = path.join(prototypeDir, "build"); // Adjust based on your build output dir

    try {
      // Check if build directory exists
      if (!(await fs.pathExists(buildDir))) {
        throw new Error("Build directory not found");
      }

      // Create zip archive
      const zipPath = path.join(prototypeDir, `${buildId}.zip`);
      await this.createZipArchive(buildDir, zipPath);

      // Upload to S3
      const s3Key = `builds/${prototypeId}/${buildId}/app.zip`;
      const fileStream = fs.createReadStream(zipPath);

      const uploadParams = {
        Bucket: CONFIG.S3_BUCKET,
        Key: s3Key,
        Body: fileStream,
        ContentType: "application/zip",
        CacheControl: "public, max-age=31536000", // Cache for 1 year
      };

      await s3.upload(uploadParams).promise();

      // Clean up local zip file
      await fs.remove(zipPath);

      fastify.log.info(`Build uploaded to S3: ${s3Key}`);
      return s3Key;
    } catch (error) {
      fastify.log.error("S3 upload failed:", error);
      throw error;
    }
  }

  // Create zip archive
  async createZipArchive(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve());
      archive.on("error", (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  // Start Metro bundler
  async startMetro(prototypeId, port) {
    const prototypeDir = this.getPrototypeDir(prototypeId);

    // Kill existing metro if running
    await this.stopMetro(prototypeId);

    return new Promise((resolve, reject) => {
      const metroProcess = spawn(
        "npx",
        ["react-native", "start", "--port", port.toString()],
        {
          cwd: prototypeDir,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env },
        }
      );

      let stdout = "";
      let stderr = "";
      let isResolved = false;

      metroProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;

        // Check if Metro is ready
        if (
          output.includes("Metro waiting on") ||
          output.includes("Loading dependency graph, done.")
        ) {
          if (!isResolved) {
            isResolved = true;
            const tunnelUrl = `http://${this.getPublicIP()}:${port}`;

            this.activeMetroServers.set(prototypeId, {
              process: metroProcess,
              port,
              status: "running",
              startedAt: Date.now(),
              tunnelUrl,
            });

            resolve({
              success: true,
              url: tunnelUrl,
              status: "running",
              port,
            });
          }
        }
      });

      metroProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      metroProcess.on("close", (code) => {
        this.activeMetroServers.delete(prototypeId);
        if (!isResolved) {
          reject(new Error(`Metro server exited with code ${code}: ${stderr}`));
        }
      });

      metroProcess.on("error", (error) => {
        this.activeMetroServers.delete(prototypeId);
        if (!isResolved) {
          reject(error);
        }
      });

      // Timeout for Metro startup
      setTimeout(() => {
        if (!isResolved) {
          metroProcess.kill("SIGKILL");
          reject(new Error("Metro startup timeout"));
        }
      }, CONFIG.METRO_TIMEOUT);
    });
  }

  // Stop Metro bundler
  async stopMetro(prototypeId) {
    const metroInfo = this.activeMetroServers.get(prototypeId);

    if (metroInfo && metroInfo.process) {
      try {
        // Upload current build before stopping
        await this.buildAndUpload(prototypeId);

        metroInfo.process.kill("SIGTERM");

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (metroInfo.process && !metroInfo.process.killed) {
            metroInfo.process.kill("SIGKILL");
          }
        }, 5000);

        this.activeMetroServers.delete(prototypeId);
        fastify.log.info(`Metro stopped for prototype ${prototypeId}`);

        return { success: true, message: "Metro server stopped" };
      } catch (error) {
        fastify.log.error(`Error stopping metro for ${prototypeId}:`, error);
        throw error;
      }
    }

    return { success: true, message: "No active metro server found" };
  }

  // Build and upload (used when stopping metro)
  async buildAndUpload(prototypeId) {
    try {
      const buildResult = await this.buildApp(prototypeId);
      return buildResult;
    } catch (error) {
      fastify.log.error(`Failed to build and upload ${prototypeId}:`, error);
      throw error;
    }
  }

  // Clean up prototype files
  async cleanupPrototype(prototypeId) {
    const prototypeDir = this.getPrototypeDir(prototypeId);

    try {
      // Stop metro if running
      await this.stopMetro(prototypeId);

      // Kill any active build processes
      const buildProcess = this.activeBuildProcesses.get(prototypeId);
      if (buildProcess) {
        buildProcess.kill("SIGKILL");
        this.activeBuildProcesses.delete(prototypeId);
      }

      // Remove directory
      if (await fs.pathExists(prototypeDir)) {
        await fs.remove(prototypeDir);
        fastify.log.info(`Cleaned up prototype ${prototypeId}`);
      }

      return { success: true, message: "Prototype cleaned up" };
    } catch (error) {
      fastify.log.error(`Error cleaning up ${prototypeId}:`, error);
      throw error;
    }
  }

  // Get public IP (for tunnel URL)
  getPublicIP() {
    // In production, you might want to get this from EC2 metadata
    // For now, return the private IP or configure this appropriately
    return process.env.WORKER_IP || "localhost";
  }

  // Get worker status
  getStatus() {
    return {
      activeMetroServers: Array.from(this.activeMetroServers.entries()).map(
        ([id, info]) => ({
          prototypeId: id,
          port: info.port,
          status: info.status,
          startedAt: info.startedAt,
        })
      ),
      activeBuilds: Array.from(this.activeBuildProcesses.keys()),
      workspaceDir: CONFIG.WORKSPACE_DIR,
    };
  }
}

// Initialize worker service
const worker = new BuildWorkerService();

// Main process endpoint
fastify.post("/process", async (request, reply) => {
  try {
    const { prototypeId, files, isHotReload, isUpdate, port, action } =
      request.body;

    // Handle different actions
    if (action === "stop-metro") {
      const result = await worker.stopMetro(prototypeId);
      return reply.send(result);
    }

    if (action === "cleanup") {
      const result = await worker.cleanupPrototype(prototypeId);
      return reply.send(result);
    }

    // Validate required fields for build/update
    if (!prototypeId || !files) {
      return reply.status(400).send({
        error: "Missing required fields: prototypeId, files",
      });
    }

    // Write files
    await worker.writeFiles(prototypeId, files);

    let result;

    if (isHotReload) {
      if (isUpdate) {
        // Update existing metro server (files already written)
        const metroInfo = worker.activeMetroServers.get(prototypeId);
        if (metroInfo) {
          result = {
            success: true,
            url: metroInfo.tunnelUrl,
            status: "updated",
            buildErrors: [],
          };
        } else {
          // Metro not running, start it
          result = await worker.startMetro(prototypeId, port);
        }
      } else {
        // Start new metro server
        result = await worker.startMetro(prototypeId, port);
      }
    } else {
      // Build only
      result = await worker.buildApp(prototypeId);
    }

    return reply.send(result);
  } catch (error) {
    fastify.log.error("Process request failed:", error);
    return reply.status(500).send({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Health check
fastify.get("/health", async (request, reply) => {
  const status = worker.getStatus();
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    ...status,
  };
});

// Worker status
fastify.get("/status", async (request, reply) => {
  return worker.getStatus();
});

// Graceful shutdown
const gracefulShutdown = async () => {
  fastify.log.info("Shutting down worker gracefully...");

  // Stop all metro servers
  for (const prototypeId of worker.activeMetroServers.keys()) {
    try {
      await worker.stopMetro(prototypeId);
    } catch (error) {
      fastify.log.error(`Error stopping metro for ${prototypeId}:`, error);
    }
  }

  // Kill all build processes
  for (const [prototypeId, process] of worker.activeBuildProcesses) {
    try {
      process.kill("SIGKILL");
    } catch (error) {
      fastify.log.error(
        `Error killing build process for ${prototypeId}:`,
        error
      );
    }
  }

  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start server
const start = async () => {
  try {
    await fastify.listen({
      port: process.env.PORT || 3001,
      host: process.env.HOST || "0.0.0.0",
    });
    fastify.log.info("Build worker server started successfully");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
