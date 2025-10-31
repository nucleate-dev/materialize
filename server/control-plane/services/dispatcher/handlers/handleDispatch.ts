import {
  APIResponse,
  BuildStatus,
  DispatchRequestBody,
  DispatchSuccessResponse,
  PrototypeAssetInput,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  StandardErrorResponse,
  StartDevServerRequestBody,
} from '../../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import { GlideClient } from '@valkey/valkey-glide';
import {
  ActiveBuild,
  BUILD_TIMEOUTS,
  CACHE_KEYS,
  FargateDevServerResponse,
  FargateInstanceInfo,
  FileScope,
  Framework,
  isActiveBuildType,
  S3_URL_TEMPLATE,
} from '../../../types/InternalTypes.js';
import {
  activeBuildToStringRecord,
  hgetallAsActiveBuild,
  hgetallAsDevBuild,
  removeBuildDataFromCache,
} from '../../../utils/cacheInteractionUtils.js';
import {
  isDevServerInShutdownStages,
  isDispatchInProgress,
} from '../../../utils/prototypeDevServerStatusUtils.js';
import { LatencyEvents } from '../../../loggers/LatencyEvents.js';
import { IdleContainerAllocationSystemService } from '../../idle-container-allocation-system/IdleContainerAllocationSystemService.js';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { Database } from '../../../types/supabase.js';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

export async function handleDispatchImpl(
  body: DispatchRequestBody,
  jwt: string,
  cache: GlideClient,
  idleContainerAllocationSystem: IdleContainerAllocationSystemService,
  log2: SystemLogger,
): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
  // 1. Extract validated body
  const { prototype_id, framework, files, assets, file_scope, deleted_files } =
    body;
  const selectedFramework = framework || 'expo_react_native'; // Default framework to expo_react_native if not provided

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
    await cache.hset(devKey, {
      status: 'updating' as BuildStatus,
      url: existingDevData?.url || normalizeUrl(getS3Url(prototype_id)),
      terminal_tunnel_hostname: `http://${process.env.FARGATE_DEV_IP}:3002`,
    });

    const fargateResponse = await dispatchRequestToFargateInstanceServer({
      jwt,
      prototype_id,
      framework: selectedFramework,
      files,
      deleted_files,
      assets,
      file_scope,
      log2,
      fargate_private_ip: process.env.FARGATE_DEV_IP,
    });

    if (fargateResponse.status === 'success') {
      const newUrl = normalizeUrl(
        fargateResponse.tunnel_url || getS3Url(prototype_id),
      );
      await cache.hset(devKey, {
        status: 'stable' as BuildStatus,
        url: newUrl,
      });
      return {
        data: {
          viewing_url: newUrl,
          build_errors: fargateResponse.build_errors,
          build_warnings: fargateResponse.build_warnings,
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
          error: 'Build Failed',
          message: 'Build failed on development fargate instance',
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
  if (!authResult || !authResult.canEdit) {
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
    userId: authResult.user?.id || 'service-role',
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
              authResult.user?.id || 'service-role',
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
        jwt,
        prototype_id,
        framework: selectedFramework,
        files,
        deleted_files,
        assets,
        file_scope,
        log2,
        fargate_private_ip: updatedBuildCacheData.fargate_private_ip,
      });
      updatedBuildCacheData.status = 'stable';
      updatedBuildCacheData.url =
        fargateResponse.tunnel_url || getS3Url(prototype_id);
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
      log2.info('Updated build cache data: ', {
        activeBuildCacheData: updatedBuildCacheData,
      });

      if (fargateResponse.status === 'success') {
        return {
          data: {
            viewing_url: normalizeUrl(
              fargateResponse.tunnel_url || getS3Url(prototype_id),
            ),
            build_errors: fargateResponse.build_errors,
            build_warnings: fargateResponse.build_warnings,
          },
          error: null,
        };
      } else {
        log2.error(undefined, 'Build failed on fargate instance', {
          fargateResponse,
        });
        return {
          data: null,
          error: {
            error: 'Build Failed',
            message: 'Build failed on fargate instance',
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
  jwt,
  prototype_id,
  framework,
  files,
  deleted_files,
  assets,
  file_scope,
  log2,
  fargate_private_ip,
}: {
  jwt: string;
  prototype_id: string;
  framework: Framework;
  files: PrototypeFileInput[];
  deleted_files?: string[];
  assets: PrototypeAssetInput[];
  file_scope: FileScope;
  log2: SystemLogger;
  fargate_private_ip: string;
}): Promise<FargateDevServerResponse> {
  const requestBody = await constructRequestBody({
    token: jwt,
    prototype_id,
    framework,
    files,
    deleted_files,
    assets,
    file_scope,
    log2,
  });
  log2.info(
    `Dispatching request to fargate instance at ${fargate_private_ip}:3002/dev-server: `,
    {
      requestBodyDetails: {
        prototypeId: prototype_id,
        fileCount: files.length,
        assetCount: assets.length,
        fileScope: file_scope,
      },
    },
  );
  const fargateResponse = await log2.time(
    LatencyEvents.dispatch_request_to_fargate_server_latency,
    async (): Promise<FargateDevServerResponse> => {
      return await dispatchFormedRequestToFargateInstanceServer(
        fargate_private_ip,
        requestBody,
        log2,
      );
    },
    { fileScope: file_scope },
  );
  log2.info('Fargate responded: ', { fargateResponse });
  return fargateResponse;
}

async function constructRequestBody({
  token,
  prototype_id,
  framework,
  files,
  assets,
  deleted_files,
  file_scope,
  log2,
}: {
  token: string;
  prototype_id: string;
  framework: Framework;
  files: PrototypeFileInput[];
  assets: PrototypeAssetInput[];
  file_scope: FileScope;
  deleted_files?: string[];
  log2: SystemLogger;
}): Promise<StartDevServerRequestBody> {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );

  // Run all downloads concurrently
  const assetInputs: PrototypeAssetInputWithContent[] = await Promise.all(
    assets.map(async (asset) => {
      try {
        const { data, error } = await supabase.storage
          .from('prototype-assets')
          .download(`${asset.prototype_id}/${asset.name}`);

        if (error || !data) {
          log2.error(
            error,
            `[constructRequestBody] Failed to download asset ${asset.name}: ${
              error?.message ?? 'unknown error'
            }`,
          );
          return null;
        }

        const arrayBuffer = await data.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString('base64');

        return {
          ...asset,
          contents: base64Content,
        };
      } catch (err) {
        log2.error(
          err,
          `[constructRequestBody] Error converting asset ${asset.name}`,
        );
        return null;
      }
    }),
  ).then((results) =>
    results.filter((r): r is PrototypeAssetInputWithContent => r !== null),
  );

  return {
    prototype_id,
    framework,
    files,
    assets: assetInputs,
    deleted_files,
    file_scope,
  };
}

async function dispatchFormedRequestToFargateInstanceServer(
  fargatePrivateIp: string,
  requestBody: StartDevServerRequestBody,
  log2: SystemLogger,
): Promise<FargateDevServerResponse> {
  try {
    const response = await axios.post(
      `http://${fargatePrivateIp}:3002/dev-server`,
      requestBody,
      {
        timeout: BUILD_TIMEOUTS.REQUEST_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          'x-trace-id': log2.getTraceId(),
        },
      },
    );
    return response.data as FargateDevServerResponse;
  } catch (error) {
    log2.error(error, 'Error dispatching request to fargate instance: ');
    return {
      status: 'error',
      tunnel_url: undefined,
      build_errors: [],
      build_warnings: [],
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
  return url && !url.startsWith('http') ? `https://${url}` : url;
}
