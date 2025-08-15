import { GlideClient } from '@valkey/valkey-glide';
import { CONFIG } from './config.js';
import axios from 'axios';
import { ECSClient, StopTaskCommand } from '@aws-sdk/client-ecs';

export class CleanupService {
  private cleanupIntervals: ReturnType<typeof setInterval>[];
  private cache: GlideClient;
  private ecsClient: ECSClient;

  constructor(cache: GlideClient, ecsClient: ECSClient) {
    this.cache = cache;
    this.ecsClient = ecsClient;
    this.cleanupIntervals = [];
    this.startCleanupServices();
  }
  // Cleanup idle hot reload services

  private async cleanupIdleActiveBuilds() {
    const currentTimeReadable = this.formatTimestampEST(Date.now());
    console.log(
      `Cleaning up idle active builds, current time: ${Date.now()} (${currentTimeReadable})`,
    );

    // get all active builds
    const activeBuildKeys = await this.scanKeys('active_build:*');

    if (!activeBuildKeys || activeBuildKeys.length === 0) {
      console.log('No active builds found for hot reload cleanup');
      return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const idleTimeoutSeconds = CONFIG.IDLE_TIMEOUT_HOT_RELOAD / 1000;

    // 1. Get all idle builds
    const idleBuilds: Array<{
      build: ActiveBuild;
      buildId: string;
      buildKey: string;
    }> = [];
    
    for (const buildKey of activeBuildKeys) {
      const buildJson = await this.cache.get(buildKey);
      if (!buildJson) {
        continue;
      }

      const build: ActiveBuild = JSON.parse(buildJson as string);
      
      // Skip if already cleaning
      if (build.status === 'cleaning') {
        continue;
      }
      
      const timeSinceLastTouch = currentTime - build.last_touched;
      if (timeSinceLastTouch > idleTimeoutSeconds) {
        // Extract build ID from key: "active_build:build_id" -> "build_id"
        const buildId = buildKey.replace('active_build:', '');
        idleBuilds.push({ build, buildId, buildKey });
      }
    }

    // 2. For each idle build, clean it up
    console.log(`Found ${idleBuilds.length} idle builds to clean up`);

    for (const { build, buildId, buildKey } of idleBuilds) {
      console.log(`Cleaning up idle build: ${buildId}`);
      const lastTouchedReadable = this.formatTimestampEST(
        build.last_touched * 1000,
      );
      console.log(`active build cache data:`, {
        ...build,
        last_touched_readable: lastTouchedReadable,
      });

      // Set status to cleaning first
      const cleaningBuild: ActiveBuild = {
        ...build,
        status: 'cleaning',
      };
      
      try {
        await this.cache.set(buildKey, JSON.stringify(cleaningBuild));
        console.log(`Set build ${buildId} status to cleaning`);
      } catch (error) {
        console.error(`Failed to set cleaning status for ${buildId}:`, error);
        continue;
      }

      // Extract prototype ID from build ID (assuming format: build_{prototypeId}_{timestamp}_{random})
      const prototypeId = buildId.split('_')[1];
      
      // a. dispatch a request to the fargate instance to kill the build
      if (build.fargate_private_ip) {
        const killResult = await this.dispatchKillDevServerRequest(
          prototypeId,
          build.fargate_private_ip,
        );
        if (!killResult.success) {
          console.warn(
            `Failed to kill dev server for ${buildId}: ${killResult.error}`,
          );
        }
      }

      // b. Kill the fargate task using the task arn
      if (build.fargate_task_arn) {
        const terminateResult = await this.terminateFargateTask(
          build.fargate_task_arn,
        );
        if (!terminateResult.success) {
          console.warn(
            `Failed to terminate Fargate task for ${buildId}, leaving build as active: ${terminateResult.error}`,
          );
          continue;
        }
      }

      // c. remove the active build from cache and cleanup schema entries
      try {
        // Remove from active_build
        await this.cache.del([buildKey]);
        console.log(`Removed active build cache entry: ${buildId}`);
        
        // Remove from builds ZSET
        await this.cache.customCommand([
          'ZREM',
          `proto:${prototypeId}:builds`,
          buildId,
        ]);
        console.log(`Removed ${buildId} from builds ZSET for prototype ${prototypeId}`);
        
        // If this was the current build, remove the current pointer
        const currentBuildId = await this.cache.get(`proto:${prototypeId}:current`);
        if (currentBuildId === buildId) {
          await this.cache.del([`proto:${prototypeId}:current`]);
          console.log(`Removed current pointer for prototype ${prototypeId}`);
        }
        
      } catch (error) {
        console.error(
          `Failed to remove cache entries for ${buildId}:`,
          error,
        );
      }
    }
  }

  // Start cleanup services
  private startCleanupServices() {
    // Hot reload cleanup every 5 minutes
    this.cleanupIntervals.push(
      setInterval(() => {
        this.cleanupIdleActiveBuilds().catch((error) => {
          console.error('Error in cleanupIdleActiveBuilds:', error);
        });
      }, CONFIG.CLEANUP_INTERVAL_HOT_RELOAD),
    );

    console.log('Cleanup services started');
  }

  // Stop cleanup services
  public stopCleanupServices() {
    this.cleanupIntervals.forEach((interval) => clearInterval(interval));
    this.cleanupIntervals = [];
  }

  // Dispatch kill hot reload request to build worker
  private async dispatchKillDevServerRequest(
    prototypeId: string,
    fargatePrivateIp: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(
        `Dispatching kill dev server request to ${fargatePrivateIp}:3002/dev-server for prototype: ${prototypeId}`,
      );

      const response = await axios.delete(
        `http://${fargatePrivateIp}:3002/dev-server`,
        {
          data: { prototype_id: prototypeId },
          timeout: 30000, // 30 seconds timeout for cleanup
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      console.log(
        `Successfully killed dev server for prototype: ${prototypeId}`,
      );
      console.log(response.data);
      return { success: true };
    } catch (error) {
      console.error(
        `Failed to kill dev server for prototype ${prototypeId}:`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Terminate Fargate task
  private async terminateFargateTask(
    taskArn: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`Terminating Fargate task: ${taskArn}`);

      const command = new StopTaskCommand({
        cluster: process.env.ECS_CLUSTER_NAME!,
        task: taskArn,
        reason: 'Cleanup service - idle timeout',
      });

      await this.ecsClient.send(command);
      console.log(`Successfully terminated Fargate task: ${taskArn}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to terminate Fargate task ${taskArn}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Helper method to scan for keys matching a pattern
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      try {
        const result = (await this.cache.customCommand([
          'SCAN',
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          '100',
        ])) as [string, string[]];

        cursor = result[0];
        keys.push(...result[1]);
      } catch (error) {
        console.error(`Error scanning keys with pattern ${pattern}:`, error);
        break;
      }
    } while (cursor !== '0');

    return keys;
  }

  // Helper method to format timestamp in EST
  private formatTimestampEST(timestamp: number): string {
    return new Date(timestamp).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}

// Interface definitions
interface ActiveBuild {
  fargate_task_arn: string;
  fargate_private_ip: string;
  url: string;
  status: 'creating' | 'updating' | 'error' | 'stable' | 'cleaning';
  last_touched: number;
}
