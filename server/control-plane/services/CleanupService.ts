import { ECSClient, StopTaskCommand } from '@aws-sdk/client-ecs';
import { S3Client } from '@aws-sdk/client-s3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GlideClient } from '@valkey/valkey-glide';
import axios, { AxiosError } from 'axios';
import { CONFIG } from '../config.js';
import { cryptoRandomId, SystemLogger } from '../loggers/SystemLogger.js';
import { baseLogger } from '../server.js';
import { PublicDevServerStopResponse } from '../types/BuildWorkerTypes.js';
import {
  type ActiveBuild,
  type CleanupOperationResult,
  type CleanupStats,
  type IdleBuildInfo,
  CACHE_PATTERNS,
  isActiveBuildType,
} from '../types/InternalTypes.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
  removeBuildDataFromCache,
} from '../utils/cacheInteractionUtils.js';
import { deleteCloudflareTunnel } from '../utils/cloudflareTunnelManagementUtils.js';
import { takeScreenshotsOfKilledBuilds } from '../utils/screenshotUtils.js';

export class CleanupService {
  private cleanupIntervals: ReturnType<typeof setInterval>[];
  private cache: GlideClient;
  private ecsClient: ECSClient;
  private s3Client: S3Client;
  private supabase: SupabaseClient;
  private log2: SystemLogger;

  constructor(cache: GlideClient, ecsClient: ECSClient) {
    this.cache = cache;
    this.ecsClient = ecsClient;
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    this.cleanupIntervals = [];
    this.log2 = baseLogger.child({
      route: 'CleanupService',
    });
    this.startCleanupServices();
  }

  // Start cleanup services
  private startCleanupServices(): void {
    if (process.env.NODE_ENV === 'development') {
      // TO TEST CHANGES TO THIS FILE, COMMENT OUT THIS EARLY RETURN
      return;
    }
    // Hot reload cleanup every 5 minutes
    this.cleanupIntervals.push(
      setInterval(async () => {
        this.log2.setContext({
          traceId: cryptoRandomId(),
        });
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
  // Cleanup idle hot reload services

  private async cleanupIdleActiveBuilds(): Promise<CleanupStats> {
    // 1. get all active builds
    const { totalBuildsScanned, idleBuilds } =
      await this.getAllIdleActiveBuildsForCleanup();
    let stats: CleanupStats = {
      totalBuildsScanned,
      idleBuildsFound: idleBuilds.length,
      successfulCleanups: 0,
      failedCleanups: 0,
    };
    if (idleBuilds.length === 0) {
      return stats;
    }

    // 2. For each idle build, clean it up
    stats.idleBuildsFound = idleBuilds.length;
    this.log2.info('Cleanup cycle running -- found idle builds to clean up', {
      idleBuildsFound: stats.idleBuildsFound,
    });
    const killedBuilds =
      await this.dispatchKillRequestsAndCleanFargateTasksForIdleBuilds(
        idleBuilds,
        stats,
      );
    stats = killedBuilds.stats;

    await takeScreenshotsOfKilledBuilds(
      killedBuilds.killedPrototypeIds,
      this.log2,
      this.supabase,
    );
    return stats;
  }

  private async getAllIdleActiveBuildsForCleanup(): Promise<{
    totalBuildsScanned: number;
    idleBuilds: IdleBuildInfo[];
  }> {
    const activeBuildKeys = await this.scanKeys(CACHE_PATTERNS.allActiveBuilds);
    if (!activeBuildKeys || activeBuildKeys.length === 0) {
      return { totalBuildsScanned: activeBuildKeys.length, idleBuilds: [] };
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const idleTimeoutSeconds = CONFIG.IDLE_TIMEOUT_HOT_RELOAD / 1000;

    // 1. Get all idle builds
    const idleBuilds: IdleBuildInfo[] = [];
    for (const buildKey of activeBuildKeys) {
      const build = await hgetallAsActiveBuild(this.cache, buildKey);
      if (!build) {
        continue;
      }
      if (!isActiveBuildType(build)) {
        this.log2.warn('Invalid build data found in cache for key', {
          buildKey,
        });
        continue;
      }

      // Skip if already cleaning or LLM is actively executing
      if (build.status === 'cleaning' || build.status === 'chatting') {
        continue;
      }

      const timeSinceLastTouch = currentTime - build.last_touched;
      if (timeSinceLastTouch > idleTimeoutSeconds) {
        // Extract build ID from key: "active_build:build_id" -> "build_id"
        const buildId = buildKey.replace('active_build:', '');
        idleBuilds.push({ build, buildId, buildKey });
      }
    }

    return { totalBuildsScanned: activeBuildKeys.length, idleBuilds };
  }

  private async dispatchKillRequestsAndCleanFargateTasksForIdleBuilds(
    idleBuilds: IdleBuildInfo[],
    stats: CleanupStats,
  ): Promise<{ stats: CleanupStats; killedPrototypeIds: string[] }> {
    const killedPrototypeIds: string[] = [];
    for (const { build, buildId, buildKey } of idleBuilds) {
      // 1. Set status to cleaning, so a cleanup service running on another EC2 instance doesn't try to clean up the same build
      const cleaningBuild: ActiveBuild = {
        ...build,
        status: 'cleaning',
      };
      const cacheUpdateResult = await this.setCacheActiveBuildData(
        buildKey,
        cleaningBuild,
        buildId,
      );
      if (!cacheUpdateResult) {
        stats.failedCleanups++;
        continue;
      }

      // 2. Extract prototype ID from build ID (assuming format: build_{prototypeId}_{timestamp}_{random})
      const prototypeId = buildId.split('_')[1];

      // 3. Validate build data. If no fargate task arn or private IP, clean up build from cache appropriately
      if (!build.fargate_task_arn) {
        this.log2.error(
          new Error('Build has no Fargate task ARN, removing build from cache'),
          undefined,
          { buildId },
        );
        const removedFromCache = await removeBuildDataFromCache(
          this.cache,
          this.log2,
          prototypeId,
          buildId,
        );
        removedFromCache ? stats.successfulCleanups++ : stats.failedCleanups++;
      } else if (!build.fargate_private_ip) {
        // no private IP to dispatch kill request to (but we have arn), just terminate fargate task and remove build from cache
        const terminateResult = await this.terminateFargateTask(
          build.fargate_task_arn,
        );
        if (!terminateResult.success) {
          this.log2.error(
            terminateResult.error,
            `Failed to terminate Fargate task for ${buildId}, leaving build as active: ${terminateResult.error}`,
          );
          // reset status back to stable since we didn't kill the build
          const activeBuild: ActiveBuild = {
            ...build,
            status: 'stable',
          };
          await this.setCacheActiveBuildData(buildKey, activeBuild, buildId);
          stats.failedCleanups++;
          continue;
        }
        const removedFromCache = await removeBuildDataFromCache(
          this.cache,
          this.log2,
          prototypeId,
          buildId,
        );
        removedFromCache ? stats.successfulCleanups++ : stats.failedCleanups++;
      }

      // 4. dispatch a request to the fargate instance to kill the build
      const killResult = await this.dispatchKillDevServerRequest(
        prototypeId,
        build.fargate_private_ip,
      );
      if (killResult.buildInProgress) {
        // Increment clean attempts counter
        const newCleanAttempts = (build.clean_attempts || 0) + 1;
        // Check if we've exceeded max cleanup attempts
        if (newCleanAttempts >= 3) {
          // Force cleanup after 3 failed attempts to prevent containers from getting stuck
          this.log2.error(
            new Error('Max cleanup attempts reached - forcing cleanup'),
            'Fargate container stuck in bad state, forcing cleanup',
            {
              fargate_task_arn: build.fargate_task_arn,
              prototype_id: prototypeId,
              clean_attempts: newCleanAttempts,
              utc_timestamp: new Date().toISOString(),
              unix_timestamp: new Date().getTime(),
            },
          );
        } else {
          // Reset the status back to building and increment clean_attempts
          const activeBuild: ActiveBuild = {
            ...build,
            status: 'building',
            clean_attempts: newCleanAttempts,
          };
          const setCacheResult = await this.setCacheActiveBuildData(
            buildKey,
            activeBuild,
            buildId,
          );
          if (!setCacheResult) stats.failedCleanups++;

          this.log2.info(
            'Build still in progress, incrementing clean attempts',
            {
              buildId,
              prototypeId,
              clean_attempts: newCleanAttempts,
            },
          );

          continue;
        }
      }

      // 5. Kill the fargate task using the task arn (only if safe to do so)
      const terminateResult = await this.terminateFargateTask(
        build.fargate_task_arn,
      );
      if (!terminateResult.success) {
        this.log2.error(
          terminateResult.error,
          `Failed to terminate Fargate task for ${buildId}, leaving build as active: ${terminateResult.error}`,
        );
        const activeBuild: ActiveBuild = {
          ...build,
          status: 'stable',
        };
        await this.setCacheActiveBuildData(buildKey, activeBuild, buildId);
        stats.failedCleanups++;
        continue;
      }
      killedPrototypeIds.push(prototypeId);

      // 5.5 Delete the cloudflare tunnel for the build if it exists
      // Delete the Cloudflare tunnel for the build if it exists
      this.log2.info('deleting cloudflare tunnel', {
        tunnelId: build.terminal_tunnel_id,
        tunnelHostname: build.terminal_tunnel_hostname,
      });
      if (build.terminal_tunnel_id) {
        try {
          await deleteCloudflareTunnel(
            build.terminal_tunnel_id,
            this.log2,
            build.terminal_tunnel_hostname,
            this.supabase,
          );
          this.log2.info(
            `Successfully deleted Cloudflare tunnel for build ${buildId}`,
            { tunnelId: build.terminal_tunnel_id },
          );
        } catch (error) {
          this.log2.error(
            error,
            `Failed to delete Cloudflare tunnel for build ${buildId}, continuing with cleanup`,
            { tunnelId: build.terminal_tunnel_id },
          );
          // Continue with cleanup even if tunnel deletion fails
        }
      }

      // 6. remove the active build from cache and cleanup schema entries
      const removedFromCache = await removeBuildDataFromCache(
        this.cache,
        this.log2,
        prototypeId,
        buildId,
      );
      removedFromCache ? stats.successfulCleanups++ : stats.failedCleanups++;
    }
    return { stats, killedPrototypeIds };
  }

  private async setCacheActiveBuildData(
    buildKey: string,
    activeBuild: ActiveBuild,
    buildId: string,
  ): Promise<boolean> {
    try {
      await this.cache.hset(buildKey, activeBuildToStringRecord(activeBuild));
      return true;
    } catch (error) {
      this.log2.error(error, 'Failed to update cache active build data', {
        buildId,
      });
      return false;
    }
  }

  // Dispatch kill hot reload request to build worker
  private async dispatchKillDevServerRequest(
    prototypeId: string,
    fargatePrivateIp: string,
  ): Promise<CleanupOperationResult> {
    return await this.log2.time(
      'cleanup_dispatch_kill_dev_server_latency',
      async () => {
        return await this.dispatchKillDevServerRequestImpl(
          prototypeId,
          fargatePrivateIp,
        );
      },
    );
  }

  private async dispatchKillDevServerRequestImpl(
    prototypeId: string,
    fargatePrivateIp: string,
  ): Promise<CleanupOperationResult> {
    try {
      const response = await axios.delete(
        `http://${fargatePrivateIp}:3002/dev-server`,
        {
          data: { prototype_id: prototypeId },
          timeout: 300000, // 5 minutes timeout to allow build completion
          headers: {
            'Content-Type': 'application/json',
            'x-trace-id': this.log2.getTraceId(),
          },
        },
      );

      // Parse the actual response body to understand what happened
      const responseData: PublicDevServerStopResponse = response.data;
      if (responseData.status === 'success') {
        if (responseData?.version) {
          const { error: updateBuildVersionError } = await this.supabase
            .from('prototypes')
            .update({
              latest_build_key: responseData.version,
            })
            .eq('id', prototypeId);
          if (updateBuildVersionError) {
            this.log2.error(
              updateBuildVersionError,
              'Failed to update prototype latest_build_key',
              {
                prototypeId,
              },
            );
          } else {
            this.log2.info('Successfully updated prototype latest_build_key', {
              prototypeId,
              version: responseData.version,
            });
          }
        } else {
          // Clear latest_build_key when version doesn't exist
          const { error: clearBuildVersionError } = await this.supabase
            .from('prototypes')
            .update({
              latest_build_key: null,
            })
            .eq('id', prototypeId);
          if (clearBuildVersionError) {
            this.log2.error(
              clearBuildVersionError,
              'Failed to clear prototype latest_build_key',
              {
                prototypeId,
              },
            );
          } else {
            this.log2.info('Successfully cleared prototype latest_build_key', {
              prototypeId,
            });
          }
        }
        // We should still return success because the fargate task should be cleaned up.
        // Maybe we need to figure out something better here.
        return {
          success: true,
          buildInProgress: false,
        };
      } else {
        return {
          success: false,
          buildInProgress: true,
        };
      }
    } catch (error: unknown) {
      this.log2.error(error, 'Failed to kill dev server for prototype', {
        prototypeId,
        fargatePrivateIp,
      });

      // Check if the error was due to timeout
      const isTimeout =
        (error instanceof AxiosError && error.code === 'ECONNABORTED') ||
        (error instanceof Error && error.message.includes('timeout'));

      // Check if worker is completely unresponsive (connection refused, etc.)
      const isConnectionError =
        error instanceof AxiosError &&
        (error.code === 'ECONNREFUSED' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'EHOSTUNREACH');

      if (isConnectionError) {
        this.log2.warn(
          'Worker appears to be completely unresponsive, allowing cleanup',
          {
            prototypeId,
            fargatePrivateIp,
            errorCode: error instanceof AxiosError ? error.code : 'unknown',
          },
        );

        return {
          success: true, // Allow cleanup of dead workers
          buildInProgress: false,
          error: error instanceof Error ? error.message : 'Connection error',
        };
      }

      if (isTimeout) {
        this.log2.warn(
          'Dev server stop request timed out, assuming build in progress',
          {
            prototypeId,
            fargatePrivateIp,
          },
        );

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Timeout error',
          buildInProgress: true,
        };
      }

      // Other HTTP errors - might be server error, allow cleanup
      return {
        success: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        buildInProgress: false,
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
      return { success: true, buildInProgress: false };
    } catch (error) {
      this.log2.error(error, 'Failed to terminate Fargate task', {
        taskArn,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        buildInProgress: false,
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
}
