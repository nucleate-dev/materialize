import Fastify from "fastify";
import Redis from "ioredis";
import AWS from "aws-sdk";
import axios from "axios";

// Routes
fastify.post("/build", async (request, reply) => {
  try {
    const { prototypeId, files, isHotReload = false } = request.body;

    if (!prototypeId || !files) {
      return reply.status(400).send({
        error: "Missing required fields: prototypeId, files",
      });
    }

    const result = await controlPlane.processBuildRequest(
      prototypeId,
      files,
      isHotReload
    );

    return reply.send({
      success: true,
      prototypeId,
      url: result.url,
      buildErrors: result.buildErrors || [],
      status: result.status,
    });
  } catch (error) {
    fastify.log.error("Build request failed:", error);
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
    return { status: "healthy", timestamp: new Date().toISOString() };
  } catch (error) {
    return reply
      .status(500)
      .send({ status: "unhealthy", error: error.message });
  }
});

// Status endpoint
fastify.get("/status/:prototypeId", async (request, reply) => {
  try {
    const { prototypeId } = request.params;
    const activeBuild = await redis.hget(REDIS_KEYS.ACTIVE_BUILDS, prototypeId);

    if (!activeBuild) {
      return reply.status(404).send({ error: "Prototype not found" });
    }

    return JSON.parse(activeBuild);
  } catch (error) {
    return reply.status(500).send({ error: error.message });
  }
});

// Start server
const start = async () => {
  try {
    await fastify.listen({
      port: process.env.PORT || 3000,
      host: process.env.HOST || "0.0.0.0",
    });
    fastify.log.info("Control plane server started successfully");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

// Initialize Redis client
const redis = new Redis();

// Initialize AWS clients
const ec2 = new AWS.EC2({ region: process.env.AWS_REGION || "us-east-2" });
const autoscaling = new AWS.AutoScaling({
  region: process.env.AWS_REGION || "us-east-2",
});

// Redis Keys
const REDIS_KEYS = {
  ACTIVE_BUILDS: "active_builds",
  PORT_REGISTRY: "port_registry",
  WORKER_LOAD: "worker_load",
};

// Configuration
const CONFIG = {
  METRO_PORT_RANGE: { min: 8000, max: 8100 },
  IDLE_TIMEOUT_HOT_RELOAD: 15 * 60 * 1000, // 15 minutes
  IDLE_TIMEOUT_CLEANUP: 120 * 60 * 1000, // 120 minutes
  CLEANUP_INTERVAL_HOT_RELOAD: 5 * 60 * 1000, // 5 minutes
  CLEANUP_INTERVAL_FILES: 20 * 60 * 1000, // 20 minutes
  AUTO_SCALING_GROUP_NAME: process.env.ASG_NAME || "rn-web-workers",
};

class ControlPlaneService {
  private cleanupIntervals: ReturnType<typeof setInterval>[];
  constructor() {
    this.cleanupIntervals = [];
    this.startCleanupServices();
  }

  // Get least loaded worker instance
  async getLeastLoadedWorker() {
    try {
      const instances = await this.getActiveWorkerInstances();
      if (instances.length === 0) {
        throw new Error("No active worker instances available");
      }

      let leastLoadedInstance = instances[0];
      let minLoad =
        (await redis.hget(
          REDIS_KEYS.WORKER_LOAD,
          instances[0].PrivateIpAddress
        )) || 0;

      for (const instance of instances.slice(1)) {
        const load =
          (await redis.hget(
            REDIS_KEYS.WORKER_LOAD,
            instance.PrivateIpAddress
          )) || 0;
        if (parseInt(load) < parseInt(minLoad)) {
          leastLoadedInstance = instance;
          minLoad = load;
        }
      }

      return leastLoadedInstance;
    } catch (error) {
      fastify.log.error("Error getting least loaded worker:", error);
      throw error;
    }
  }

  // Get active EC2 instances from Auto Scaling Group
  async getActiveWorkerInstances() {
    try {
      const asgResponse = await autoscaling
        .describeAutoScalingGroups({
          AutoScalingGroupNames: [CONFIG.AUTO_SCALING_GROUP_NAME],
        })
        .promise();

      if (asgResponse.AutoScalingGroups.length === 0) {
        return [];
      }

      const instanceIds = asgResponse.AutoScalingGroups[0].Instances.filter(
        (instance) => instance.LifecycleState === "InService"
      ).map((instance) => instance.InstanceId);

      if (instanceIds.length === 0) return [];

      const ec2Response = await ec2
        .describeInstances({
          InstanceIds: instanceIds,
        })
        .promise();

      const instances: any[] = [];
      ec2Response.Reservations.forEach((reservation) => {
        reservation.Instances.forEach((instance) => {
          if (instance.State.Name === "running") {
            instances.push(instance);
          }
        });
      });

      return instances;
    } catch (error) {
      fastify.log.error("Error getting worker instances:", error);
      throw error;
    }
  }

  // Acquire a free port for hot reload
  async acquireFreePort(workerIp) {
    const lockKey = `port_lock:${workerIp}`;
    const lockValue = Date.now().toString();

    try {
      // Acquire lock with 30 second timeout
      const lockAcquired = await redis.set(
        lockKey,
        lockValue,
        "PX",
        30000,
        "NX"
      );
      if (!lockAcquired) {
        throw new Error("Could not acquire port lock");
      }

      // Find available port
      for (
        let port = CONFIG.METRO_PORT_RANGE.min;
        port <= CONFIG.METRO_PORT_RANGE.max;
        port++
      ) {
        const portKey = `${REDIS_KEYS.PORT_REGISTRY}:${workerIp}:${port}`;
        const portTaken = await redis.get(portKey);

        if (!portTaken) {
          // Mark port as taken
          await redis.set(portKey, "taken", "EX", 7200); // 2 hour expiry

          // Release lock
          await redis.del(lockKey);
          return port;
        }
      }

      // Release lock if no port found
      await redis.del(lockKey);
      throw new Error("No free ports available");
    } catch (error) {
      // Ensure lock is released on error
      await redis.del(lockKey);
      throw error;
    }
  }

  // Release a port
  async releasePort(workerIp, port) {
    const portKey = `${REDIS_KEYS.PORT_REGISTRY}:${workerIp}:${port}`;
    await redis.del(portKey);
  }

  // Send request to worker
  async sendWorkerRequest(workerIp, payload) {
    try {
      const response = await axios.post(
        `http://${workerIp}:3005/process`,
        payload,
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json" },
        }
      );
      return response.data;
    } catch (error) {
      fastify.log.error(
        `Error sending request to worker ${workerIp}:`,
        error.message
      );
      throw error;
    }
  }

  // Process build request
  async processBuildRequest(prototypeId, files, isHotReload = false) {
    try {
      // Check if build already exists
      const activeBuild = await redis.hget(
        REDIS_KEYS.ACTIVE_BUILDS,
        prototypeId
      );

      if (activeBuild) {
        const buildInfo = JSON.parse(activeBuild);

        // Send update to existing worker
        const payload = {
          prototypeId,
          files,
          isHotReload,
          isUpdate: true,
          port: buildInfo.port,
        };

        const result = await this.sendWorkerRequest(
          buildInfo.workerIp,
          payload
        );

        // Update timestamp
        buildInfo.lastUpdated = Date.now();
        await redis.hset(
          REDIS_KEYS.ACTIVE_BUILDS,
          prototypeId,
          JSON.stringify(buildInfo)
        );

        return result;
      }

      // Create new build
      const worker = await this.getLeastLoadedWorker();
      const workerIp = worker.PrivateIpAddress;
      let port: number | null = null;

      if (isHotReload) {
        port = await this.acquireFreePort(workerIp);
      }

      // Create build info
      const buildInfo = {
        prototypeId,
        workerIp,
        port,
        isHotReload,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      // Add to active builds
      await redis.hset(
        REDIS_KEYS.ACTIVE_BUILDS,
        prototypeId,
        JSON.stringify(buildInfo)
      );

      // Increment worker load
      await redis.hincrby(REDIS_KEYS.WORKER_LOAD, workerIp, 1);

      // Send request to worker
      const payload = {
        prototypeId,
        files,
        isHotReload,
        isUpdate: false,
        port,
      };

      const result = await this.sendWorkerRequest(workerIp, payload);
      return result;
    } catch (error) {
      fastify.log.error("Error processing build request:", error);
      throw error;
    }
  }

  // Cleanup idle hot reload services
  async cleanupIdleHotReload() {
    try {
      const activeBuilds = await redis.hgetall(REDIS_KEYS.ACTIVE_BUILDS);
      const now = Date.now();

      for (const [prototypeId, buildInfoStr] of Object.entries(activeBuilds)) {
        const buildInfo = JSON.parse(buildInfoStr as string);

        if (
          buildInfo.isHotReload &&
          now - buildInfo.lastUpdated > CONFIG.IDLE_TIMEOUT_HOT_RELOAD
        ) {
          fastify.log.info(
            `Cleaning up idle hot reload for prototype ${prototypeId}`
          );

          // Stop metro bundler on worker
          try {
            await this.sendWorkerRequest(buildInfo.workerIp, {
              action: "stop-metro",
              prototypeId,
              port: buildInfo.port,
            });
          } catch (error) {
            fastify.log.warn(
              `Failed to stop metro for ${prototypeId}:`,
              error.message
            );
          }

          // Release port
          if (buildInfo.port) {
            await this.releasePort(buildInfo.workerIp, buildInfo.port);
          }

          // Convert to static build
          buildInfo.isHotReload = false;
          buildInfo.port = null;
          await redis.hset(
            REDIS_KEYS.ACTIVE_BUILDS,
            prototypeId,
            JSON.stringify(buildInfo)
          );
        }
      }
    } catch (error) {
      fastify.log.error("Error during hot reload cleanup:", error);
    }
  }

  // Cleanup old builds and files
  async cleanupOldBuilds() {
    try {
      const activeBuilds = await redis.hgetall(REDIS_KEYS.ACTIVE_BUILDS);
      const now = Date.now();

      for (const [prototypeId, buildInfoStr] of Object.entries(activeBuilds)) {
        const buildInfo = JSON.parse(buildInfoStr as string);

        if (now - buildInfo.lastUpdated > CONFIG.IDLE_TIMEOUT_CLEANUP) {
          fastify.log.info(
            `Cleaning up old build for prototype ${prototypeId}`
          );

          // Clean up files on worker
          try {
            await this.sendWorkerRequest(buildInfo.workerIp, {
              action: "cleanup",
              prototypeId,
            });
          } catch (error) {
            fastify.log.warn(
              `Failed to cleanup files for ${prototypeId}:`,
              error.message
            );
          }

          // Release port if hot reload
          if (buildInfo.isHotReload && buildInfo.port) {
            await this.releasePort(buildInfo.workerIp, buildInfo.port);
          }

          // Remove from active builds
          await redis.hdel(REDIS_KEYS.ACTIVE_BUILDS, prototypeId);

          // Decrement worker load
          await redis.hincrby(REDIS_KEYS.WORKER_LOAD, buildInfo.workerIp, -1);
        }
      }
    } catch (error) {
      fastify.log.error("Error during build cleanup:", error);
    }
  }

  // Start cleanup services
  startCleanupServices() {
    // Hot reload cleanup every 5 minutes
    this.cleanupIntervals.push(
      setInterval(
        () => this.cleanupIdleHotReload(),
        CONFIG.CLEANUP_INTERVAL_HOT_RELOAD
      )
    );

    // File cleanup every 20 minutes
    this.cleanupIntervals.push(
      setInterval(() => this.cleanupOldBuilds(), CONFIG.CLEANUP_INTERVAL_FILES)
    );

    fastify.log.info("Cleanup services started");
  }

  // Stop cleanup services
  stopCleanupServices() {
    this.cleanupIntervals.forEach((interval) => clearInterval(interval));
    this.cleanupIntervals = [];
  }
}

// Initialize service
const controlPlane = new ControlPlaneService();

// Graceful shutdown
const gracefulShutdown = () => {
  fastify.log.info("Shutting down gracefully...");
  controlPlane.stopCleanupServices();
  redis.disconnect();
  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
