import { GlideClient } from '@valkey/valkey-glide';
import axios from 'axios';
import { LatencyEvents } from '../../../loggers/LatencyEvents.js';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import {
  StandardErrorResponse as BuildWorkerStandardErrorResponse,
  PublicAllocateSuccessResponse,
  PublicDevServerStartSuccessResponse,
  PublicStartDevServerRequest,
  SandboxAPIResponse,
} from '../../../types/BuildWorkerTypes.js';
import {
  ActiveBuild,
  BUILD_TIMEOUTS,
  CACHE_KEYS,
  FargateInstanceInfo,
  isActiveBuildType,
  S3_URL_TEMPLATE,
} from '../../../types/InternalTypes.js';
import {
  APIResponse,
  BuildStatus,
  DispatchSuccessResponse,
  StandardErrorResponse,
} from '../../../types/PublicAPITypes.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
  hgetallAsDevBuild,
  removeBuildDataFromCache,
} from '../../../utils/cacheInteractionUtils.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import {
  isDevServerInShutdownStages,
  isDispatchInProgress,
} from '../../../utils/prototypeDevServerStatusUtils.js';
import { IdleContainerAllocationSystemService } from '../../idle-container-allocation-system/IdleContainerAllocationSystemService.js';

export async function handleDispatchImpl(
  prototype_id: string,
  jwt: string,
  cache: GlideClient,
  idleContainerAllocationSystem: IdleContainerAllocationSystemService,
  log2: SystemLogger,
): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
  // ------------------------------------------------------------------------------------------------
  // FOR DEVELOPMENT PURPOSES: if env is dev, fargate dev mode is enabled, and an ip is provided, skip
  // all auth & cache management logic and just dispatch to the provided ip directly
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.FARGATE_DEV_MODE === 'true' &&
    process.env.FARGATE_DEV_IP
  ) {
    const devKey = CACHE_KEYS.protoDev(prototype_id);
    const existingDevData = await hgetallAsDevBuild(cache, devKey);

    if (
      existingDevData?.status &&
      isDispatchInProgress(existingDevData.status as BuildStatus)
    ) {
      return {
        data: null,
        error: {
          error: 'Conflict',
          message:
            'There is already an active dispatch request for this prototype',
        },
      };
    }

    // Set initial status, url, and tunnel hostname
    const devTerminalUrl = `wss://${process.env.FARGATE_DEV_IP}:3002`;
    await cache.hset(devKey, {
      status: 'updating' as BuildStatus,
      url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
      terminal_tunnel_hostname: devTerminalUrl,
    });

    try {
      const allocateResponse = await axios.post<
        SandboxAPIResponse<
          PublicAllocateSuccessResponse,
          BuildWorkerStandardErrorResponse
        >
      >(
        `http://${process.env.FARGATE_DEV_IP}:3002/allocate`,
        {
          s3_credentials: {
            accessKeyId: '',
            secretAccessKey: '',
            sessionToken: '',
            expiration: '',
          },
          user_details: {
            prototypeId: prototype_id,
            userId: 'dev-user', // Placeholder for dev mode since auth is skipped
          },
          cloudflare_credentials: {
            cloudflare_tunnel_token: '',
            cloudflare_tunnel_hostname: `http://${process.env.FARGATE_TUNNEL_IP}`,
          },
          keys: {
            orchestration_token: '',
            aak: '',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
        },
      );

      if (allocateResponse.data.error) {
        log2.error(
          new Error(allocateResponse.data.error.error || 'Allocation failed'),
          'Failed to allocate worker in dev mode',
          { details: allocateResponse.data.error.details },
        );
        await cache.hset(devKey, {
          status: 'error' as BuildStatus,
          url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
        });
        return {
          data: null,
          error: {
            error: 'Allocation Failed',
            message: `Failed to allocate worker: ${allocateResponse.data.error.message || 'Unknown error'}`,
          },
        };
      }
      log2.consoleLogDevOnly(
        'info',
        'Worker allocated successfully in dev mode',
      );
    } catch (allocateError) {
      log2.error(allocateError, 'Failed to call /allocate in dev mode');
      await cache.hset(devKey, {
        status: 'error' as BuildStatus,
        url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
      });
      return {
        data: null,
        error: {
          error: 'Allocation Failed',
          message:
            'Failed to allocate dev EC2 for build workers: ' +
            (allocateError instanceof Error
              ? allocateError.message
              : 'Unknown error'),
        },
      };
    }

    const fargateResponse = await dispatchRequestToFargateInstanceServer({
      prototype_id,
      log2,
      fargate_private_ip: process.env.FARGATE_DEV_IP,
    });

    if (fargateResponse.data) {
      const newUrl = normalizeUrl(
        fargateResponse.data.tunnel_url || getS3Url(prototype_id),
      );
      await cache.hset(devKey, {
        status: 'stable' as BuildStatus,
        url: newUrl,
      });
      return {
        data: {
          viewing_url: newUrl,
          terminal_url: devTerminalUrl,
        },
        error: null,
      };
    } else {
      await cache.hset(devKey, {
        status: 'error' as BuildStatus,
        url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
      });
      return {
        data: null,
        error: {
          error: fargateResponse.error?.error || 'Build Failed',
          message:
            fargateResponse.error?.message ||
            'Build failed on development fargate instance',
        },
      };
    }
  }
  // ------------------------------------------------------------------------------------------------

  // 2. Authenticate
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    log2,
  );
  if (authResult === null || authResult.user === null || !authResult.canEdit) {
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      },
    };
  }
  // update logger context
  log2 = log2.child({
    userId: authResult.user.id,
    prototypeId: prototype_id,
  });

  try {
    const currentTime = Math.floor(Date.now() / 1000);

    // Check if there's an existing current build
    const currentBuildId = await cache.get(
      CACHE_KEYS.protoCurrentBuild(prototype_id),
    );

    let shouldCreateNewBuild = true;
    if (currentBuildId) {
      log2.consoleLogDevOnly('info', 'Current build ID found: ', {
        currentBuildId,
      });
      const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
      const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);

      if (existingBuild) {
        if (!isActiveBuildType(existingBuild)) {
          return {
            data: null,
            error: {
              error: 'Internal Server Error',
              message: 'Invalid build data in cache',
            },
          };
        }

        // If build is cleaning or building, proceed with new build
        if (isDevServerInShutdownStages(existingBuild.status)) {
          log2.consoleLogDevOnly(
            'info',
            `Existing devserver ${currentBuildId} is cleaning or building, creating new devserver`,
          );
          shouldCreateNewBuild = true;
        } else if (isDispatchInProgress(existingBuild.status)) {
          // If build is actively working, return error
          return {
            data: null,
            error: {
              error: 'Conflict',
              message:
                'There is already an active dispatch request for this prototype',
            },
          };
        } else {
          // Reuse existing stable build
          shouldCreateNewBuild = false;
        }
      }
    }

    let activeBuildKey: string;
    let updatedBuildCacheData: ActiveBuild;
    if (shouldCreateNewBuild) {
      log2.consoleLogDevOnly('info', 'Creating new build');
      const newBuildCacheData: ActiveBuild = {
        fargate_task_arn: '',
        fargate_private_ip: '',
        url: getS3Url(prototype_id),
        status: 'creating',
        last_touched: currentTime,
        terminal_tunnel_id: '',
        terminal_tunnel_hostname: '',
        orchestration_token: '',
        clean_attempts: 0,
      };
      activeBuildKey = await setNewBuildCacheData(
        cache,
        prototype_id,
        currentTime,
        newBuildCacheData,
      );
      let newFargateInstance: FargateInstanceInfo;
      try {
        newFargateInstance = await log2.time(
          LatencyEvents.launch_fargate_instance_latency,
          async (): Promise<FargateInstanceInfo> => {
            return await idleContainerAllocationSystem.allocateFargateDevServer(
              prototype_id,
              activeBuildKey,
              newBuildCacheData,
              jwt,
              authResult.user!.id,
            );
          },
        );
      } catch (error) {
        const buildIdFromKey = activeBuildKey.replace('active_build:', '');
        await removeBuildDataFromCache(
          cache,
          log2,
          prototype_id,
          buildIdFromKey,
        ); // remove build data from cache so it doesn't affect future builds
        log2.error(error, 'Failed to launch fargate instance for dispatcher');
        throw error;
      }
      updatedBuildCacheData = {
        ...newBuildCacheData,
        status: 'updating',
        fargate_task_arn: newFargateInstance.taskArn,
        fargate_private_ip: newFargateInstance.privateIp,
        terminal_tunnel_id: newFargateInstance.terminalTunnelId,
        terminal_tunnel_hostname: newFargateInstance.terminalTunnelHostname,
        orchestration_token: newFargateInstance.orchestrationToken,
      };
    } else {
      // Reuse existing build
      log2.consoleLogDevOnly('info', 'Reusing existing build');
      activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
      const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);
      if (!existingBuild || !isActiveBuildType(existingBuild)) {
        return {
          data: null,
          error: {
            error: 'Internal Server Error',
            message: 'Invalid build data in cache',
          },
        };
      }
      updatedBuildCacheData = {
        ...existingBuild,
        status: 'updating',
        last_touched: currentTime,
      };
    }
    await cache.hset(
      activeBuildKey,
      activeBuildToStringRecord(updatedBuildCacheData),
    );
    // NOTE: at this point, there should always be an active build, with status "updating"

    // Dispatch request to fargate instance
    try {
      const fargateResponse = await dispatchRequestToFargateInstanceServer({
        prototype_id,
        log2,
        fargate_private_ip: updatedBuildCacheData.fargate_private_ip,
      });
      if (fargateResponse.data) {
        updatedBuildCacheData.status = 'stable';
        updatedBuildCacheData.url =
          fargateResponse.data.tunnel_url || getS3Url(prototype_id);
        updatedBuildCacheData.last_touched = Math.floor(Date.now() / 1000);
        await cache.hset(
          activeBuildKey,
          activeBuildToStringRecord(updatedBuildCacheData),
        );
        // Update builds ZSET with new timestamp
        const buildIdFromKey = activeBuildKey.replace('active_build:', '');
        await cache.customCommand([
          'ZADD',
          CACHE_KEYS.protoBuilds(prototype_id),
          updatedBuildCacheData.last_touched.toString(),
          buildIdFromKey,
        ]);
        log2.consoleLogDevOnly('info', 'Updated build cache data: ', {
          activeBuildCacheData: updatedBuildCacheData,
        });

        return {
          data: {
            viewing_url: normalizeUrl(
              fargateResponse.data.tunnel_url || getS3Url(prototype_id),
            ),
            terminal_url:
              updatedBuildCacheData.terminal_tunnel_hostname || null,
          },
          error: null,
        };
      } else {
        log2.error(undefined, 'Dispatch request failed to Fargate instance', {
          fargateResponse,
        });
        return {
          data: null,
          error: {
            error: fargateResponse.error?.error || 'Dispatch Failed',
            message:
              fargateResponse.error?.message ||
              'Dispatch request failed to Fargate instance',
          },
        };
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      log2.error(
        error,
        'There was an error dispatching the request to the fargate instance',
      );
      updatedBuildCacheData.status = 'error';
      await cache.hset(
        activeBuildKey,
        activeBuildToStringRecord(updatedBuildCacheData),
      );

      return {
        data: null,
        error: {
          error: 'Internal Server Error',
          message:
            'There was a server error building the prototype. ' + e.message,
        },
      };
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    log2.error(error, 'Dispatch request failed');

    return {
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    };
  }
}

async function dispatchRequestToFargateInstanceServer({
  prototype_id,
  log2,
  fargate_private_ip,
}: {
  prototype_id: string;
  log2: SystemLogger;
  fargate_private_ip: string;
}): Promise<
  SandboxAPIResponse<
    PublicDevServerStartSuccessResponse,
    BuildWorkerStandardErrorResponse
  >
> {
  log2.consoleLogDevOnly(
    'info',
    `Dispatching request to fargate instance at ${fargate_private_ip}:3002/dev-server/start-v2: `,
  );
  const fargateResponse = await log2.time(
    LatencyEvents.dispatch_request_to_fargate_server_latency,
    async (): Promise<
      SandboxAPIResponse<
        PublicDevServerStartSuccessResponse,
        BuildWorkerStandardErrorResponse
      >
    > => {
      return await dispatchFormedRequestToFargateInstanceServer(
        fargate_private_ip,
        { prototype_id },
        log2,
      );
    },
  );
  log2.consoleLogDevOnly('info', 'Fargate responded: ', { fargateResponse });
  return fargateResponse;
}

async function dispatchFormedRequestToFargateInstanceServer(
  fargatePrivateIp: string,
  requestBody: PublicStartDevServerRequest,
  log2: SystemLogger,
): Promise<
  SandboxAPIResponse<
    PublicDevServerStartSuccessResponse,
    BuildWorkerStandardErrorResponse
  >
> {
  try {
    const response = await axios.post<
      SandboxAPIResponse<
        PublicDevServerStartSuccessResponse,
        BuildWorkerStandardErrorResponse
      >
    >(`http://${fargatePrivateIp}:3002/dev-server/start-v2`, requestBody, {
      timeout: BUILD_TIMEOUTS.REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'x-trace-id': log2.getTraceId(),
      },
    });
    return response.data;
  } catch (error) {
    log2.error(error, 'Error dispatching request to fargate instance: ');
    return {
      data: null,
      error: {
        error: 'Failed to dispatch request',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

async function setNewBuildCacheData(
  cache: GlideClient,
  prototype_id: string,
  currentTime: number,
  newBuildCacheData: ActiveBuild,
): Promise<string> {
  const buildId = `build_${prototype_id}_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const activeBuildKey = CACHE_KEYS.activeBuild(buildId);
  // Set the new build as active
  await cache.hset(
    activeBuildKey,
    activeBuildToStringRecord(newBuildCacheData),
  );
  // Update current pointer
  await cache.set(CACHE_KEYS.protoCurrentBuild(prototype_id), buildId);
  // Add to builds ZSET
  await cache.customCommand([
    'ZADD',
    CACHE_KEYS.protoBuilds(prototype_id),
    currentTime.toString(),
    buildId,
  ]);
  return activeBuildKey;
}

function getS3Url(prototypeId: string): string {
  // Construct S3/CloudFront URL for the prototype
  return S3_URL_TEMPLATE(prototypeId);
}

function normalizeUrl(url: string): string {
  // Ensure URL has protocol (https://) for iframe loading
  // If URL starts with exp://, replace it with https://
  if (url && url.startsWith('exp://')) {
    return url.replace('exp://', 'https://');
  }
  // Otherwise, if URL doesn't start with http, prepend https://
  return url && !url.startsWith('http') && !url.startsWith('wss')
    ? `https://${url}`
    : url;
}
