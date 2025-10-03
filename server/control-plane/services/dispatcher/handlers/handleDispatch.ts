import { FastifyReply, FastifyRequest } from 'fastify';
import {
  APIResponse,
  DispatchRequestBody,
  DispatchSuccessResponse,
  HTTP_STATUS,
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
  removeBuildDataFromCache,
} from '../../../utils/cacheInteractionUtils.js';
import {
  isDevServerInShutdownStages,
  isDispatchInProgress,
} from '../../../utils/prototypeDevServerStatusUtils.js';
import { LatencyEvents } from '../../../loggers/LatencyEvents.js';
import { IdleContainerAllocationSystemService } from '../IdleContainerAllocationSystemService.js';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { Database } from '../../../types/supabase.js';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

export async function handleDispatchImpl(
  request: FastifyRequest<{ Body: DispatchRequestBody }>,
  reply: FastifyReply,
  cache: GlideClient,
  idleContainerAllocationSystem: IdleContainerAllocationSystemService,
): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
  // 1. Extract validated body (validation handled by Fastify schema)
  const { prototype_id, framework, files, assets, file_scope, deleted_files } =
    request.body;
  const selectedFramework = framework || 'expo_react_native'; // Default framework to expo_react_native if not provided

  // 2. Extract JWT from Authorization header && authenticate
  const jwt = request.headers.authorization?.split(' ')[1];
  if (!jwt || !request.headers.authorization?.startsWith('Bearer ')) {
    reply.status(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message: 'No JWT token provided in Authorization header',
      },
    };
  }
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    request.log2,
  );
  if (!authResult || !authResult.canEdit) {
    reply.status(HTTP_STATUS.UNAUTHORIZED);
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
  request.log2 = request.log2.child({
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
      request.log2.consoleLogDevOnly('info', 'Current build ID found: ', {
        currentBuildId,
      });
      const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
      const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);

      if (existingBuild) {
        if (!isActiveBuildType(existingBuild)) {
          reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
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
          request.log2.consoleLogDevOnly(
            'info',
            `Existing devserver ${currentBuildId} is cleaning or building, creating new devserver`,
          );
          shouldCreateNewBuild = true;
        } else if (isDispatchInProgress(existingBuild.status)) {
          // If build is actively working, return error
          reply.status(HTTP_STATUS.CONFLICT);
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
      request.log2.consoleLogDevOnly('info', 'Creating new build');
      const newBuildCacheData: ActiveBuild = {
        fargate_task_arn: '',
        fargate_private_ip: '',
        url: getS3Url(prototype_id),
        status: 'creating',
        last_touched: currentTime,
      };
      activeBuildKey = await setNewBuildCacheData(
        cache,
        prototype_id,
        currentTime,
        newBuildCacheData,
      );
      let newFargateInstance: FargateInstanceInfo;
      try {
        newFargateInstance = await request.log2.time(
          LatencyEvents.launch_fargate_instance_latency,
          async (): Promise<FargateInstanceInfo> => {
            return await idleContainerAllocationSystem.allocateFargateDevServer(
              prototype_id,
              activeBuildKey,
              newBuildCacheData,
            );
          },
        );
      } catch (error) {
        const buildIdFromKey = activeBuildKey.replace('active_build:', '');
        await removeBuildDataFromCache(
          cache,
          request.log2,
          prototype_id,
          buildIdFromKey,
        ); // remove build data from cache so it doesn't affect future builds
        request.log2.error(
          error,
          'Failed to launch fargate instance for dispatcher',
        );
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
      request.log2.consoleLogDevOnly('info', 'Reusing existing build');
      activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
      const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);
      if (!existingBuild || !isActiveBuildType(existingBuild)) {
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
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
    const requestBody = await constructRequestBody({
      token: jwt,
      prototype_id,
      framework: selectedFramework,
      files,
      deleted_files,
      assets,
      file_scope,
      log2: request.log2,
    });
    try {
      request.log2.info(
        `Dispatching request to fargate instance at ${updatedBuildCacheData.fargate_private_ip}:3002/dev-server: `,
        {
          requestBodyDetails: {
            prototypeId: prototype_id,
            fileCount: files.length,
            assetCount: assets.length,
            fileScope: file_scope,
            activeBuildKey,
          },
        },
      );
      const fargateResponse = await request.log2.time(
        LatencyEvents.dispatch_request_to_fargate_server_latency,
        async (): Promise<FargateDevServerResponse> => {
          return await dispatchFormedRequestToFargateInstanceServer(
            updatedBuildCacheData.fargate_private_ip,
            requestBody,
            request.log2,
          );
        },
        { fileScope: file_scope },
      );
      request.log2.info('Fargate responded: ', { fargateResponse });

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
      request.log2.info('Updated build cache data: ', {
        activeBuildCacheData: updatedBuildCacheData,
      });

      if (fargateResponse.status === 'success') {
        reply.status(HTTP_STATUS.OK);
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
        request.log2.error(undefined, 'Build failed on fargate instance', {
          fargateResponse,
        });
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
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
      request.log2.error(
        error,
        'There was an error dispatching the request to the fargate instance',
      );
      updatedBuildCacheData.status = 'error';
      await cache.hset(
        activeBuildKey,
        activeBuildToStringRecord(updatedBuildCacheData),
      );

      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
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
    request.log2.error(error, 'Dispatch request failed');

    reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    };
  }
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
