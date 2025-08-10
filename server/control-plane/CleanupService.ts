import { CONFIG, REDIS_KEYS } from "./config";

export class CleanupService {
  private cleanupIntervals: ReturnType<typeof setInterval>[];
  constructor() {
    this.cleanupIntervals = [];
    this.startCleanupServices();
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
