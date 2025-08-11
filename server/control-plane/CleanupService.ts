import { GlideClient } from "@valkey/valkey-glide";
import { CONFIG } from "./config";

export class CleanupService {
  private cleanupIntervals: ReturnType<typeof setInterval>[];
  private cache: GlideClient;

  constructor() {
    this.cleanupIntervals = [];
    this.startCleanupServices();
    // TODO take in Valkey Elasticache client in the constructor
  }
  // Cleanup idle hot reload services
  async cleanupIdleHotReload() {
    console.log("Cleaning up idle hot reload services");
    // 1. Get all active builds from the cache
    // 2. For every active build, check the last_touched timestamp
    // 3. If the last_touched timestamp is older than the idle timeout for hot reload and the build has a port assigned:
    //    - Dispatch a request to the build worker to kill the hot reload server
    //    - Remove the port from the active build and update the cache with the new URL returned from the request
    //    - Release the port in the cache port registry
  }

  // Cleanup old builds and files
  async cleanupOldBuilds() {
    console.log("Cleaning up active builds from the cache");
    // 1. Get all active builds from the cache
    // 2. For every active build, check the last_touched timestamp
    // 3. If the last_touched timestamp is older than the idle timeout for builds:
    //    - Dispatch a request to the build worker to delete the build files
    //    - Remove the active build from the cache
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
}
