import { GlideClient } from "@valkey/valkey-glide";
import { CONFIG } from "./config";

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
      // Get all active build keys using scan command
      const activeBuildKeys = (await this.cache.customCommand([
        "KEYS",
        "active_build:*",
      ])) as string[];

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
      // Get all active build keys
      const activeBuildKeys = (await this.cache.customCommand([
        "KEYS",
        "active_build:*",
      ])) as string[];

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

  // Placeholder function to dispatch kill hot reload request to build worker
  private async dispatchKillHotReloadDevServerRequest(
    workerIp: string,
    prototypeId: string,
    port: number
  ): Promise<KillHotReloadResponse> {
    console.log(
      `Dispatching kill hot reload request to worker ${workerIp} for prototype ${prototypeId} on port ${port}`
    );

    // TODO: Implement actual request to build worker
    // This should make an HTTP request to the build worker to kill the hot reload server
    // and return the new build URL

    // Placeholder response
    return {
      success: true,
      buildUrl: `https://materializeui.com/builds/${prototypeId}`,
    };
  }

  // Placeholder function to dispatch delete build request to build worker
  private async dispatchDeleteBuildRequest(
    workerIp: string,
    prototypeId: string
  ): Promise<DeleteBuildResponse> {
    console.log(
      `Dispatching delete build request to worker ${workerIp} for prototype ${prototypeId}`
    );

    // TODO: Implement actual request to build worker
    // This should make an HTTP request to the build worker to delete the build files
    // and return a success status

    // Placeholder response
    return {
      success: true,
      message: `Build files for prototype ${prototypeId} deleted successfully`,
    };
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
