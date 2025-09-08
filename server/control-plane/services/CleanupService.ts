import { ECSClient, StopTaskCommand } from '@aws-sdk/client-ecs';
import { GlideClient } from '@valkey/valkey-glide';
import axios, { AxiosError } from 'axios';
import { CONFIG } from '../config.js';
import {
  type ActiveBuild,
  type CleanupOperationResult,
  type CleanupStats,
  type IdleBuildInfo,
  CACHE_KEYS,
  CACHE_PATTERNS,
  isActiveBuildType,
} from '../types/InternalTypes.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import { baseLogger } from '../server.js';

export class CleanupService {
  private cleanupIntervals: ReturnType<typeof setInterval>[];
  private cache: GlideClient;
  private ecsClient: ECSClient;
  private log2: SystemLogger;

  constructor(cache: GlideClient, ecsClient: ECSClient) {
    this.cache = cache;
    this.ecsClient = ecsClient;
    this.cleanupIntervals = [];
    this.startCleanupServices();
    this.log2 = baseLogger.child({
      route: 'CleanupService',
    });
  }
  // Cleanup idle hot reload services

  private async cleanupIdleActiveBuilds(): Promise<CleanupStats> {
    const currentTimeReadable = this.formatTimestampEST(Date.now());
    this.log2.info('Cleaning up idle active builds', {
      currentTime: Date.now(),
      currentTimeReadable,
    });

    // get all active builds
    const activeBuildKeys = await this.scanKeys(CACHE_PATTERNS.allActiveBuilds);

    const stats: CleanupStats = {
      totalBuildsScanned: activeBuildKeys?.length || 0,
      idleBuildsFound: 0,
      successfulCleanups: 0,
      failedCleanups: 0,
    };

    if (!activeBuildKeys || activeBuildKeys.length === 0) {
      this.log2.info('No active builds found for hot reload cleanup');
      return stats;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const idleTimeoutSeconds = CONFIG.IDLE_TIMEOUT_HOT_RELOAD / 1000;

    // 1. Get all idle builds
    const idleBuilds: IdleBuildInfo[] = [];

    for (const buildKey of activeBuildKeys) {
      const buildJson = await this.cache.get(buildKey);
      if (!buildJson) {
        continue;
      }

      const parsedBuild = JSON.parse(buildJson as string);
      if (!isActiveBuildType(parsedBuild)) {
        this.log2.warn('Invalid build data found in cache for key', {
          buildKey,
        });
        continue;
      }
      const build: ActiveBuild = parsedBuild;

      // Skip if already cleaning
      if (build.status === 'cleaning') {
        this.log2.info('Build is already cleaning, skipping', {
          buildKey,
        });
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
    stats.idleBuildsFound = idleBuilds.length;
    this.log2.info('Found idle builds to clean up', {
      idleBuildsFound: stats.idleBuildsFound,
    });

    for (const { build, buildId, buildKey } of idleBuilds) {
      this.log2.info('Cleaning up idle build', {
        buildId,
        buildKey,
        build,
        lastTouchedReadable: this.formatTimestampEST(build.last_touched * 1000),
      });

      // Set status to cleaning first
      const cleaningBuild: ActiveBuild = {
        ...build,
        status: 'cleaning',
      };

      try {
        await this.cache.set(buildKey, JSON.stringify(cleaningBuild));
      } catch (error) {
        this.log2.error(error, 'Failed to set cleaning status for build', {
          buildId,
        });
        stats.failedCleanups++;
        continue;
      }

      // Extract prototype ID from build ID (assuming format: build_{prototypeId}_{timestamp}_{random})
      const prototypeId = buildId.split('_')[1];

      // a. dispatch a request to the fargate instance to kill the build
      let shouldTerminateTask = true;
      if (build.fargate_private_ip) {
        const killResult = await this.dispatchKillDevServerRequest(
          prototypeId,
          build.fargate_private_ip,
        );
        if (killResult.buildInProgress) {
          // TODO @priyam: check status from build worker here
          this.log2.info(
            'Build appears to be in progress, skipping Fargate task termination',
            {
              buildId,
            },
          );
          shouldTerminateTask = false;
        } else if (!killResult.success) {
          this.log2.error(
            killResult.error,
            'Failed to kill dev server for build',
            {
              buildId,
              prototypeId,
            },
          );
          stats.failedCleanups++;
          continue;
        }
      }

      // b. Kill the fargate task using the task arn (only if safe to do so)
      if (!shouldTerminateTask) {
        this.log2.info(
          `Skipping Fargate task termination due to build in progress - task will be cleaned up later`,
          {
            buildId,
            prototypeId,
          },
        );
        // Reset the status back to stable since we're not cleaning up yet
        const activeBuild: ActiveBuild = {
          ...build,
          status: 'building',
          last_touched: currentTime, // Update last_touched to prevent immediate re-cleanup
        };
        await this.cache.set(buildKey, JSON.stringify(activeBuild));
        continue; // Skip termination and cache cleanup
      }

      this.log2.info('Proceeding with Fargate task termination', {
        buildId,
        prototypeId,
      });
      const terminateResult = await this.terminateFargateTask(
        build.fargate_task_arn,
      );
      if (!terminateResult.success) {
        this.log2.error(
          terminateResult.error,
          `Failed to terminate Fargate task for ${buildId}, leaving build as active: ${terminateResult.error}`,
        );
        stats.failedCleanups++;
        continue;
      }

      // c. remove the active build from cache and cleanup schema entries
      try {
        // Remove from active_build
        await this.cache.del([buildKey]);
        // Remove from builds ZSET
        await this.cache.customCommand([
          'ZREM',
          CACHE_KEYS.protoBuilds(prototypeId),
          buildId,
        ]);
        // If this was the current build, remove the current pointer
        const currentBuildId = await this.cache.get(
          CACHE_KEYS.protoCurrentBuild(prototypeId),
        );
        if (currentBuildId === buildId) {
          await this.cache.del([CACHE_KEYS.protoCurrentBuild(prototypeId)]);
        }
        this.log2.info('Removed cache entries for build', {
          buildId,
        });
        stats.successfulCleanups++;
      } catch (error) {
        this.log2.error(error, 'Failed to remove cache entries for build', {
          buildId,
        });
        stats.failedCleanups++;
      }
    }
    return stats;
  }

  // Start cleanup services
  private startCleanupServices(): void {
    // Hot reload cleanup every 5 minutes
    this.cleanupIntervals.push(
      setInterval(async () => {
        try {
          const stats = await this.cleanupIdleActiveBuilds();
          this.log2.info('Cleanup cycle completed with stats', {
            stats,
          });
        } catch (error) {
          this.log2.error(error, 'Error in cleanupIdleActiveBuilds');
        }
      }, CONFIG.CLEANUP_INTERVAL_HOT_RELOAD),
    );

    this.log2.info('Cleanup services started');
  }

  // Stop cleanup services
  public stopCleanupServices(): void {
    this.cleanupIntervals.forEach((interval) => clearInterval(interval));
    this.cleanupIntervals = [];
  }

  // Dispatch kill hot reload request to build worker
  private async dispatchKillDevServerRequest(
    prototypeId: string,
    fargatePrivateIp: string,
  ): Promise<CleanupOperationResult & { buildInProgress?: boolean }> {
    try {
      this.log2.info('Dispatching kill dev server request', {
        fargatePrivateIp,
        prototypeId,
      });

      const response = await axios.delete(
        `http://${fargatePrivateIp}:3002/dev-server`,
        {
          data: { prototype_id: prototypeId },
          timeout: 300000, // 5 minutes timeout to allow build completion
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      this.log2.info(
        'Successfully completed dev server shutdown for prototype',
        {
          prototypeId,
          fargatePrivateIp,
          responseData: response.data,
        },
      );

      return {
        success: true,
        buildInProgress: false, // TODO @priyam: check the status you will return from the build worker here. Should be "building" or "error" or "safe_to_clean"
      };
    } catch (error: unknown) {
      this.log2.error(error, 'Failed to kill dev server for prototype', {
        prototypeId,
      });

      // Check if the error was due to timeout (build taking too long)
      const isTimeout =
        (error instanceof AxiosError && error.code === 'ECONNABORTED') ||
        (error instanceof Error && error.message.includes('timeout'));

      return {
        success: !isTimeout, // Consider timeout as partial success since build might be completing
        error: error instanceof Error ? error.message : 'Unknown error',
        buildInProgress: isTimeout,
      };
    }
  }

  // Terminate Fargate task
  private async terminateFargateTask(
    taskArn: string,
  ): Promise<CleanupOperationResult> {
    try {
      const command = new StopTaskCommand({
        cluster: process.env.ECS_CLUSTER_NAME!,
        task: taskArn,
        reason: 'Cleanup service - idle timeout',
      });

      await this.ecsClient.send(command);
      return { success: true };
    } catch (error) {
      this.log2.error(error, 'Failed to terminate Fargate task', {
        taskArn,
      });
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
        this.log2.error(error, 'Error scanning keys with pattern', {
          pattern,
        });
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
