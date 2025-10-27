import { ECSClient, StopTaskCommand } from '@aws-sdk/client-ecs';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GlideClient } from '@valkey/valkey-glide';
import axios, { AxiosError } from 'axios';
import puppeteer from 'puppeteer';
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
import { removeBuildDataFromCache } from '../utils/cacheInteractionUtils.js';

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

    await this.takeScreenshotsOfKilledBuilds(killedBuilds.killedPrototypeIds);
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
      const build = await this.hgetallAsActiveBuild(buildKey);
      if (!build) {
        continue;
      }
      if (!isActiveBuildType(build)) {
        this.log2.warn('Invalid build data found in cache for key', {
          buildKey,
        });
        continue;
      }

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
        // Reset the status back to building since we're not cleaning up yet
        // TODO: add some sort of counter here so there is a max number of times we can do this
        const activeBuild: ActiveBuild = {
          ...build,
          status: 'building',
        };
        const setCacheResult = await this.setCacheActiveBuildData(
          buildKey,
          activeBuild,
          buildId,
        );
        if (!setCacheResult) stats.failedCleanups++;
        continue;
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

  public async takeScreenshotsOfKilledBuilds(
    killedPrototypeIds: string[],
  ): Promise<void> {
    for (const prototypeId of killedPrototypeIds) {
      try {
        // Generate signed URL for the S3 object
        const signedUrl = await this.generateS3SignedUrl(prototypeId);
        if (!signedUrl) {
          this.log2.warn('Failed to generate signed URL for prototype', {
            prototypeId,
          });
          continue;
        }

        // Take screenshot using Puppeteer
        const screenshot = await this.takeScreenshot(signedUrl);
        if (!screenshot) {
          this.log2.warn('Failed to take screenshot for prototype', {
            prototypeId,
          });
          continue;
        }

        // Upload screenshot to Supabase Storage
        const uploadSuccess = await this.uploadScreenshotToSupabase(
          prototypeId,
          screenshot,
        );
        if (uploadSuccess) {
          this.log2.info('Successfully took and uploaded screenshot', {
            prototypeId,
          });

          // Update the thumbnail_url in the prototypes table
          const updateSuccess =
            await this.updatePrototypeThumbnailUrl(prototypeId);
          if (!updateSuccess) {
            this.log2.warn('Failed to update prototype thumbnail_url', {
              prototypeId,
            });
          }
        } else {
          this.log2.warn('Failed to upload screenshot to Supabase', {
            prototypeId,
          });
        }
      } catch (error) {
        this.log2.error(error, 'Error processing screenshot for prototype', {
          prototypeId,
        });
      }
    }
  }

  private async setCacheActiveBuildData(
    buildKey: string,
    activeBuild: ActiveBuild,
    buildId: string,
  ): Promise<boolean> {
    try {
      await this.cache.hset(
        buildKey,
        this.activeBuildToStringRecord(activeBuild),
      );
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

  private async generateS3SignedUrl(
    prototypeId: string,
  ): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: 'materialize-sites',
        Key: `${prototypeId}/latest/index.html`,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AWS SDK version mismatch requires any cast
      const signedUrl = await getSignedUrl(
        this.s3Client as any,
        command as any,
        {
          expiresIn: 300, // 5 min expiration
        },
      );

      return signedUrl;
    } catch (error) {
      this.log2.error(error, 'Failed to generate S3 signed URL', {
        prototypeId,
      });
      return null;
    }
  }

  private async takeScreenshot(url: string): Promise<Buffer | null> {
    let browser;
    try {
      // Try to launch with minimal Chrome dependencies
      browser = await puppeteer.launch({
        headless: true, // Use new headless mode
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-gpu-sandbox',
          '--disable-software-rasterizer',
          '--disable-web-security',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI,VizDisplayCompositor',
          '--disable-extensions',
          '--disable-default-apps',
          '--no-default-browser-check',
          '--no-proxy-server',
          '--disable-sync',
          '--disable-plugins',
          '--disable-logging',
          '--disable-background-media-processing',
          '--mute-audio',
          '--disable-audio',
          '--disable-ipc-flooding-protection',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-background-networking',
        ],
        timeout: 30000,
        ignoreDefaultArgs: ['--disable-extensions'],
      });

      const page = await browser.newPage();

      // Set mobile phone viewport
      await page.setViewport({
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
      });

      // Set a reasonable timeout for page load
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      // Take screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      return screenshot as Buffer;
    } catch (error) {
      // Check if this is a Chrome dependency error
      if (error instanceof Error && error.message.includes('libnspr4.so')) {
        this.log2.error(
          error,
          'Chrome dependencies missing. Run install-chrome-dependencies.sh script to fix this issue.',
          { url, errorType: 'missing_chrome_dependencies' },
        );
      } else if (
        error instanceof Error &&
        error.message.includes('Failed to launch the browser process')
      ) {
        this.log2.error(
          error,
          'Browser launch failed. This may be due to missing system dependencies.',
          { url, errorType: 'browser_launch_failed' },
        );
      } else {
        this.log2.error(error, 'Failed to take screenshot', { url });
      }
      return null;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          this.log2.error(closeError, 'Failed to close browser');
        }
      }
    }
  }

  private async uploadScreenshotToSupabase(
    prototypeId: string,
    screenshot: Buffer,
  ): Promise<boolean> {
    const fileName = `${prototypeId}.png`;
    const { error } = await this.supabase.storage
      .from('prototype-thumbnails')
      .upload(fileName, screenshot, {
        contentType: 'image/png',
        upsert: true, // Overwrite if exists
        cacheControl: '600', // 10 min
      });
    if (error) {
      this.log2.error(error, 'Supabase storage upload failed', {
        prototypeId,
        fileName,
      });
      return false;
    }
    return true;
  }

  private async updatePrototypeThumbnailUrl(
    prototypeId: string,
  ): Promise<boolean> {
    // Generate the public URL for the uploaded screenshot
    const { data } = this.supabase.storage
      .from('prototype-thumbnails')
      .getPublicUrl(`${prototypeId}.png`);

    const thumbnailUrl = data.publicUrl;

    // Update the prototypes table with the thumbnail URL
    const { error } = await this.supabase
      .from('prototypes')
      .update({
        thumbnail_url: thumbnailUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prototypeId);

    if (error) {
      this.log2.error(
        error,
        'Failed to update prototype thumbnail_url in database',
        {
          prototypeId,
          thumbnailUrl,
        },
      );
      return false;
    }
    return true;
  }

  private activeBuildToStringRecord(
    build: ActiveBuild,
  ): Record<string, string> {
    return {
      fargate_task_arn: build.fargate_task_arn,
      fargate_private_ip: build.fargate_private_ip,
      url: build.url,
      status: build.status,
      last_touched: build.last_touched.toString(),
    };
  }

  private async hgetallAsActiveBuild(key: string): Promise<ActiveBuild | null> {
    const raw = await this.cache.hgetall(key);

    if (!raw || raw.length === 0) return null;

    const obj = Object.fromEntries(
      raw.map(
        (e: {
          field: { toString(): string };
          value: { toString(): string };
        }) => [e.field.toString(), e.value.toString()],
      ),
    ) as Record<string, string>;

    // Handle missing fields gracefully
    if (!obj.status || !obj.last_touched) {
      return null;
    }

    return {
      fargate_task_arn: obj.fargate_task_arn || '',
      fargate_private_ip: obj.fargate_private_ip || '',
      url: obj.url || '',
      status: obj.status as ActiveBuild['status'],
      last_touched: parseInt(obj.last_touched, 10),
    };
  }
}
