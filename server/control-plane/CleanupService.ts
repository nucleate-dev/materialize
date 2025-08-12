import { GlideClient } from "@valkey/valkey-glide";
import { CONFIG } from "./config";
import axios from "axios";

export class CleanupService {
  private cleanupIntervals: ReturnType<typeof setInterval>[];
  private cache: GlideClient;

  constructor(cache: GlideClient) {
    this.cache = cache;
    this.cleanupIntervals = [];
    this.startCleanupServices();
  }
  // Cleanup idle hot reload services
  private async cleanupIdleHotReload() {
    console.log("Cleaning up idle hot reload services");

    try {
      // Get all active build keys using SCAN command
      const activeBuildKeys = await this.scanKeys("active_build:*");

      if (!activeBuildKeys || activeBuildKeys.length === 0) {
        console.log("No active builds found for hot reload cleanup");
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const idleTimeoutSeconds = CONFIG.IDLE_TIMEOUT_HOT_RELOAD / 1000;

      for (const buildKey of activeBuildKeys) {
        try {
          const buildJson = await this.cache.get(buildKey);
          if (!buildJson) continue;

          const build: ActiveBuild = JSON.parse(buildJson as string);

          // Check if this is a hot reload build with a port assigned
          if (!build.port || build.port === "") {
            continue;
          }

          // Check if it's been idle too long
          const timeSinceLastTouch = currentTime - build.last_touched;
          if (!(timeSinceLastTouch > idleTimeoutSeconds)) {
            continue;
          }

          console.log(`Cleaning up idle hot reload for prototype: ${buildKey}`);

          // Extract prototype ID from the key (remove "active_build:" prefix)
          const prototypeId = buildKey.replace("active_build:", "");

          // Dispatch request to build worker to kill the hot reload server
          const killResponse = await this.dispatchKillHotReloadDevServerRequest(
            build.worker_private_ip,
            prototypeId,
            Number(build.port)
          );

          // Update the build in cache - remove port and update URL
          const updatedBuild: ActiveBuild = {
            ...build,
            port: "",
            url: killResponse.buildUrl,
            type: "build",
            last_touched: currentTime,
          };
          await this.cache.set(buildKey, JSON.stringify(updatedBuild));

          // Release the port in the cache port registry
          await this.releasePort(build.worker_private_ip, Number(build.port));

          console.log(
            `Successfully cleaned up hot reload for prototype: ${prototypeId}`
          );
        } catch (error) {
          console.error(`Error processing build ${buildKey}:`, error);
          // Continue with other builds
        }
      }
    } catch (error) {
      console.error("Error during hot reload cleanup:", error);
    }
  }

  // Cleanup old builds and files
  private async cleanupOldBuilds() {
    console.log("Cleaning up old builds from the cache");

    try {
      // Get all active build keys using SCAN command
      const activeBuildKeys = await this.scanKeys("active_build:*");

      if (!activeBuildKeys || activeBuildKeys.length === 0) {
        console.log("No active builds found for cleanup");
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const cleanupTimeoutSeconds = CONFIG.IDLE_TIMEOUT_CLEANUP / 1000;

      for (const buildKey of activeBuildKeys) {
        try {
          const buildJson = await this.cache.get(buildKey);
          if (!buildJson) continue;

          const build: ActiveBuild = JSON.parse(buildJson as string);

          // Check if it's been idle too long
          const timeSinceLastTouch = currentTime - build.last_touched;
          if (!(timeSinceLastTouch > cleanupTimeoutSeconds)) {
            continue;
          }

          console.log(`Cleaning up old build: ${buildKey}`);
          // Extract prototype ID from the key (remove "active_build:" prefix)
          const prototypeId = buildKey.replace("active_build:", "");

          // Dispatch request to build worker to delete the build files
          const deleteResponse = await this.dispatchDeleteBuildRequest(
            build.worker_private_ip,
            prototypeId
          );

          // Only remove from cache if the delete request was successful
          if (deleteResponse.success) {
            await this.cache.del([buildKey]);
          }

          console.log(
            `Successfully cleaned up old build for prototype: ${prototypeId}`
          );
        } catch (error) {
          console.error(`Error processing build ${buildKey}:`, error);
          // Continue with other builds
        }
      }
    } catch (error) {
      console.error("Error during build cleanup:", error);
    }
  }

  // Start cleanup services
  private startCleanupServices() {
    // Hot reload cleanup every 5 minutes
    this.cleanupIntervals.push(
      setInterval(
        () => this.cleanupIdleHotReload(),
        CONFIG.CLEANUP_INTERVAL_HOT_RELOAD
      )
    );

    // File cleanup every 15 minutes
    this.cleanupIntervals.push(
      setInterval(() => this.cleanupOldBuilds(), CONFIG.CLEANUP_INTERVAL_FILES)
    );

    console.log("Cleanup services started");
  }

  // Stop cleanup services
  public stopCleanupServices() {
    this.cleanupIntervals.forEach((interval) => clearInterval(interval));
    this.cleanupIntervals = [];
  }

  // Dispatch kill hot reload request to build worker
  private async dispatchKillHotReloadDevServerRequest(
    workerIp: string,
    prototypeId: string,
    port: number
  ): Promise<KillHotReloadResponse> {
    console.log(
      `Dispatching kill hot reload request to worker ${workerIp} for prototype ${prototypeId} on port ${port}`
    );

    try {
      const response = await axios.delete(
        `http://${workerIp}:3002/dev-server/port/${port}`,
        {
          timeout: 30000, // 30 second timeout
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      // Check if the response indicates successful stop
      if (response.data.status === "stopped") {
        console.log(
          `Successfully killed hot reload server on port ${port} for prototype ${prototypeId}`
        );

        return {
          success: true,
          buildUrl:
            response.data.buildUrl ||
            `https://materializeui.com/builds/${prototypeId}`,
        };
      } else {
        // Worker returned an error
        const errorMessage = response.data.error || "Unknown error from worker";
        console.error(
          `Worker failed to kill hot reload server on port ${port}: ${errorMessage}`
        );
      }
    } catch (error) {
      console.error(
        `Failed to kill hot reload server on worker ${workerIp} port ${port}:`,
        error
      );
      throw error; // Re-throw the error so cleanup fails
    }
  }

  // Dispatch delete build request to build worker
  private async dispatchDeleteBuildRequest(
    workerIp: string,
    prototypeId: string
  ): Promise<DeleteBuildResponse> {
    console.log(
      `Dispatching delete build request to worker ${workerIp} for prototype ${prototypeId}`
    );

    try {
      const response = await axios.delete(
        `http://${workerIp}:3002/build/${prototypeId}`,
        {
          timeout: 30000, // 30 second timeout
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status === "deleted") {
        console.log(
          `Successfully deleted build files for prototype ${prototypeId} on worker ${workerIp}`
        );
        return {
          success: true,
        };
      } else {
        const errorMessage = response.data.error || "Unknown error from worker";
        console.error(
          `Worker failed to delete build for prototype ${prototypeId}: ${errorMessage}`
        );
      }
    } catch (error) {
      console.error(
        `Failed to delete build files on worker ${workerIp} for prototype ${prototypeId}:`,
        error
      );
      throw error; // Re-throw the error so cleanup can handle it appropriately
    }
  }

  // Helper method to scan for keys matching a pattern
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";

    do {
      try {
        const result = (await this.cache.customCommand([
          "SCAN",
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          "100",
        ])) as [string, string[]];

        cursor = result[0];
        keys.push(...result[1]);
      } catch (error) {
        console.error(`Error scanning keys with pattern ${pattern}:`, error);
        break;
      }
    } while (cursor !== "0");

    return keys;
  }

  // Release a port in the cache port registry
  private async releasePort(workerIp: string, port: number): Promise<void> {
    try {
      const key = `ports:${workerIp}:used`;
      await this.cache.srem(key, [String(port)]);
      console.log(`Released port ${port} for worker ${workerIp}`);
    } catch (error) {
      console.error(
        `Error releasing port ${port} for worker ${workerIp}:`,
        error
      );
    }
  }
}

// Interface definitions
interface ActiveBuild {
  worker_host: string;
  worker_private_ip: string;
  port: string | number;
  url: string;
  type: "build" | "hot_reload";
  status: "starting" | "running" | "error" | "stopped";
  last_touched: number;
}

interface KillHotReloadResponse {
  success: boolean;
  buildUrl?: string;
}

interface DeleteBuildResponse {
  success: boolean;
  message?: string;
}
