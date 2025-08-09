const fastify = require("fastify")({ logger: true });
const Redis = require("ioredis");
const path = require("path");
const fs = require("fs").promises;
const { spawn } = require("child_process");
const { promisify } = require("util");

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// Configuration
const CONFIG = {
  WORK_DIR: process.env.WORK_DIR || "/tmp/rn-builds",
  BUILD_TIMEOUT: 120000, // 2 minutes
  METRO_TIMEOUT: 300000, // 5 minutes
  STATIC_PORT: 8080,
};

// Active Metro processes
const metroProcesses = new Map();
const staticServers = new Map();

class WorkerService {
  constructor() {
    this.instanceId = process.env.INSTANCE_ID || require("os").hostname();
    this.setupWorkDirectory();
  }

  async setupWorkDirectory() {
    try {
      await fs.mkdir(CONFIG.WORK_DIR, { recursive: true });
      fastify.log.info(`Work directory setup at: ${CONFIG.WORK_DIR}`);
    } catch (error) {
      fastify.log.error("Failed to setup work directory:", error);
      process.exit(1);
    }
  }

  // Get project directory for prototype
  getProjectDir(prototypeId) {
    return path.join(CONFIG.WORK_DIR, prototypeId);
  }

  // Write files to project directory
  async writeProjectFiles(prototypeId, files) {
    const projectDir = this.getProjectDir(prototypeId);

    try {
      await fs.mkdir(projectDir, { recursive: true });

      // Write each file
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(projectDir, filePath);
        const fileDir = path.dirname(fullPath);

        // Ensure directory exists
        await fs.mkdir(fileDir, { recursive: true });

        // Write file content
        await fs.writeFile(fullPath, content, "utf8");
      }

      // Create package.json if it doesn't exist
      const packageJsonPath = path.join(projectDir, "package.json");
      try {
        await fs.access(packageJsonPath);
      } catch {
        // Create basic package.json for React Native Web
        const defaultPackageJson = {
          name: `rn-prototype-${prototypeId}`,
          version: "1.0.0",
          main: "index.js",
          scripts: {
            start: "expo start --web",
            web: "expo start --web",
            build: "expo build:web"
          },
          dependencies: {
            "expo": "~49.0.0",
            "react": "18.2.0",
            "react-dom": "18.2.0",
            "react-native": "0.72.0",
            "react-native-web": "~0.19.0"
          },
          devDependencies: {
            "@babel/core": "^7.20.0"
          }
        };

        await fs.writeFile(
          packageJsonPath,
          JSON.stringify(defaultPackageJson, null, 2),
          "utf8"
        );
      }

      fastify.log.info(`Files written for prototype ${prototypeId}`);
      return projectDir;
    } catch (error) {
      fastify.log.error(`Error writing files for ${prototypeId}:`, error);
      throw error;
    }
  }

  // Install dependencies
  async installDependencies(projectDir) {
    return new Promise((resolve, reject) => {
      const npm = spawn("npm", ["install"], {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      npm.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      npm.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        npm.kill();
        reject(new Error("npm install timeout"));
      }, CONFIG.BUILD_TIMEOUT);

      npm.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`npm install failed with code ${code}: ${stderr}`));
        }
      });

      npm.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // Build static version
  async buildStatic(prototypeId, projectDir) {
    return new Promise((resolve, reject) => {
      const build = spawn("npm", ["run", "build"], {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let buildErrors = [];

      build.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;

        // Parse build errors
        if (output.includes("ERROR") || output.includes("error")) {
          buildErrors.push(output.trim());
        }
      });

      build.stderr.on("data", (data) => {
        const output = data.toString();
        stderr += output;
        buildErrors.push(output.trim());
      });

      const timeout = setTimeout(() => {
        build.kill();
        reject(new Error("Build timeout"));
      }, CONFIG.BUILD_TIMEOUT);

      build.on("close", (code) => {
        clearTimeout(timeout);

        const buildOutput = path.join(projectDir, "web-build");
        const url = `http://${this.getWorkerIP()}:${CONFIG.STATIC_PORT}/${prototypeId}`;

        resolve({
          success: code === 0,
          url: code === 0 ? url : null,
          buildErrors,
          stdout,
          stderr,
        });
      });

      build.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // Start Metro bundler for hot reload
  async startMetro(prototypeId, projectDir, port) {
    return new Promise((resolve, reject) => {
      // Stop existing metro if running
      this.stopMetro(prototypeId);

      const metro = spawn("npx", ["expo", "start", "--web", "--port", port.toString()], {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let buildErrors = [];
      let isReady = false;

      metro.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;

        if (output.includes("Metro waiting") || output.includes("Expo DevTools")) {
          isReady = true;
          const url = `http://${this.getWorkerIP()}:${port}`;
          resolve({
            success: true,
            url,
            buildErrors,
            pid: metro.pid,
          });
        }

        if (output.includes("ERROR") || output.includes("error")) {
          buildErrors.push(output.trim());
        }
      });

      metro.stderr.on("data", (data) => {
        const output = data.toString();
        stderr += output;
        if (!isReady) {
          buildErrors.push(output.trim());
        }
      });

      metro.on("error", (error) => {
        if (!isReady) {
          reject(error);
        }
      });

      metro.on("close", (code) => {
        fastify.log.info(`Metro process closed for ${prototypeId} with code ${code}`);
        metroProcesses.delete(prototypeId);
      });

      // Store metro process
      metroProcesses.set(prototypeId, metro);

      // Timeout for metro startup
      setTimeout(() => {
        if (!isReady) {
          this.stopMetro(prototypeId);
          reject(new Error(`Metro startup timeout for ${prototypeId}`));
        }
      }, CONFIG.METRO_TIMEOUT);
    });
  }

  // Stop Metro bundler
  stopMetro(prototypeId) {
    const metro = metroProcesses.get(prototypeId);
    if (metro) {
      fastify.log.info(`Stopping Metro for prototype ${prototypeId}`);
      metro.kill("SIGTERM");
      metroProcesses.delete(prototypeId);
      return true;
    }
    return false;
  }

  // Setup static file server
  async setupStaticServer() {
    const staticPath = CONFIG.WORK_DIR;

    // Serve static files
    fastify.register(require("@fastify/static"), {
      root: staticPath,
      prefix: "/static/",
    });

    fastify.log.info(`Static server setup for directory: ${staticPath}`);
  }

  // Clean up project files
  async cleanup(prototypeId) {
    try {
      // Stop metro if running
      this.stopMetro(prototypeId);

      // Remove project directory
      const projectDir = this.getProjectDir(prototypeId);
      await fs.rm(projectDir, { recursive: true, force: true });

      fastify.log.info(`Cleaned up files for prototype ${prototypeId}`);
      return { success: true };
    } catch (error) {
      fastify.log.error(`Cleanup failed for ${prototypeId}:`, error);
      throw error;
    }
  }

  // Get worker IP address
  getWorkerIP() {
    return process.env.WORKER_IP || require("os").networkInterfaces().eth0?.[0]?.address || "localhost";
  }

  // Process build request
  async processBuild(prototypeId, files, isHotReload = false, isUpdate = false, port = null) {
    const projectDir = this.getProjectDir(prototypeId);

    try {
      // Write files
      await this.writeProjectFiles(prototypeId, files);

      // Install dependencies if new project or package.json changed
      if (!isUpdate || files["package.json"]) {
        fastify.log.info(`Installing dependencies for ${prototypeId}`);
        await this.installDependencies(projectDir);
      }

      if (isHotReload && port) {
        // Start or restart Metro bundler
        fastify.log.info(`Starting Metro for ${prototypeId} on port ${port}`);
        return await this.startMetro(prototypeId, projectDir, port);
      } else {
        // Build static version
        fastify.log.info(`Building static version for ${prototypeId}`);
        return await this.buildStatic(prototypeId, projectDir);
      }
    } catch (error) {
      fastify.log.error(`Build failed for ${prototypeId}:`, error);
      throw error;
    }
  }
}

// Initialize worker service
const worker = new WorkerService();

// Setup static file serving
worker.setupStaticServer();

// Routes
fastify.post("/process", async (request, reply) => {
  try {
    const { action, prototypeId, files, isHotReload, isUpdate, port } = request.body;

    // Handle special actions
    if (action === "stop-metro") {
      const stopped = worker.stopMetro(prototypeId);
      return reply.send({ success: stopped });
    }

    if (action === "cleanup") {
      const result = await worker.cleanup(prototypeId);
      return reply.send(result);
    }

    // Process build request
    if (!prototypeId) {
      return reply.status(400).send({ error: "Missing prototypeId" });
    }

    const result = await worker.processBuild(
      prototypeId,
      files || {},
      isHotReload,
      isUpdate,
      port
    );

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
  try {
    await redis.ping();
    return {
      status: "healthy",
      instanceId: worker.instanceId,
      activeBuilds: metroProcesses.size,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return reply
      .status(500)
      .send({ status: "unhealthy", error: error.message });
  }
});

// Metrics endpoint
fastify.get("/metrics", async (request, reply) => {
  return {
    instanceId: worker.instanceId,
    activeMetroProcesses: Array.from(metroProcesses.keys()),
    workDir: CONFIG.WORK_DIR,
    uptime: process.uptime(),
  };
});

// Graceful shutdown
const gracefulShutdown = () => {
  fastify.log.info("Shutting down worker gracefully...");

  // Stop all metro processes
  for (const [prototypeId, metro] of metroProcesses.entries()) {
    fastify.log.info(`Stopping Metro for ${prototypeId}`);
    metro.kill("SIGTERM");
  }

  metroProcesses.clear();
  redis.disconnect();
  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start server
const start = async () => {
  try {
    await fastify.listen({
      port: process.env.WORKER_PORT || 3005,
      host: process.env.HOST || "0.0.0.0",
    });
    fastify.log.info("Worker server started successfully");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();