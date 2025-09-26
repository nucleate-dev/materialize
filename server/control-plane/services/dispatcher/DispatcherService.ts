import { createClient } from '@supabase/supabase-js';
import { GlideClient } from '@valkey/valkey-glide';
import axios from 'axios';
import * as dotenv from 'dotenv';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LatencyEvents } from '../../loggers/LatencyEvents.js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import {
  type ActiveBuild,
  BUILD_TIMEOUTS,
  CACHE_KEYS,
  type FargateDevServerResponse,
  type FargateInstanceInfo,
  type FileScope,
  type Framework,
  isActiveBuildType,
  S3_URL_TEMPLATE,
} from '../../types/InternalTypes.js';
import {
  type APIResponse,
  type DispatchPrecheckErrorResponse,
  type DispatchPrecheckRequestBody,
  type DispatchPrecheckSuccessResponse,
  type DispatchRequestBody,
  type DispatchSuccessResponse,
  HTTP_STATUS,
  PrototypeAssetInput,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  type StandardErrorResponse,
  StartDevServerRequestBody,
} from '../../types/PublicAPITypes.js';
import { Database } from '../../types/supabase.js';
import { removeBuildDataFromCache } from '../../utils/cacheInteractionUtils.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import {
  isDevServerInShutdownStages,
  isDispatchInProgress,
  isEditableDevServer,
} from '../../utils/prototypeDevServerStatusUtils.js';
import { IdleContainerAllocationSystemService } from './IdleContainerAllocationSystemService.js';

dotenv.config();

export class DispatcherService {
  private cache: GlideClient;
  private fastifyApp: FastifyInstance;
  private idleContainerAllocationSystem: IdleContainerAllocationSystemService;

  constructor(
    cache: GlideClient,
    fastifyApp: FastifyInstance,
    idleContainerAllocationSystem: IdleContainerAllocationSystemService,
  ) {
    this.cache = cache;
    this.fastifyApp = fastifyApp;
    this.idleContainerAllocationSystem = idleContainerAllocationSystem;
  }

  // Register routes with Fastify
  public registerRoutes(app: FastifyInstance): void {
    this.fastifyApp = app;
    // POST /dispatch
    app.post<{ Body: DispatchRequestBody }>(
      '/dispatch',
      {
        schema: {
          body: {
            type: 'object',
            required: ['jwt', 'prototype_id', 'files', 'assets', 'file_scope'],
            properties: {
              jwt: { type: 'string' },
              prototype_id: { type: 'string' },
              framework: {
                type: 'string',
                enum: ['expo_react_native', 'react'],
              },
              files: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['contents', 'name', 'prototype_id'],
                  properties: {
                    id: { type: 'string' },
                    contents: { type: 'string' },
                    name: { type: 'string' },
                    prototype_id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                  },
                },
              },
              assets: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['name', 'storage_url', 'prototype_id'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    storage_url: { type: 'string' },
                    prototype_id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                    contents: { type: 'string' },
                  },
                },
              },
              file_scope: {
                type: 'string',
                enum: ['updates', 'complete'],
              },
              hot_reload: { type: 'boolean' },
            },
          },
        },
      },
      this.handleDispatch.bind(this),
    );

    // POST /dispatch-precheck
    app.post<{ Body: DispatchPrecheckRequestBody }>(
      '/dispatch-precheck',
      {
        schema: {
          body: {
            type: 'object',
            required: ['jwt', 'prototype_id'],
            properties: {
              jwt: { type: 'string' },
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleDispatchPrecheck.bind(this),
    );

    // POST /dispatch-edit-intent
    app.post<{ Body: DispatchPrecheckRequestBody }>(
      '/dispatch-edit-intent',
      {
        schema: {
          body: {
            type: 'object',
            required: ['jwt', 'prototype_id'],
            properties: {
              jwt: { type: 'string' },
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleDispatchEditIntent.bind(this),
    );

    // POST /files/restart-dev-server
    app.post<{ Body: { jwt: string; prototype_id: string } }>(
      '/files/restart-dev-server',
      {
        schema: {
          body: {
            type: 'object',
            required: ['jwt', 'prototype_id'],
            properties: {
              jwt: { type: 'string' },
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleRestartDevServer.bind(this),
    );
  }

  private async handleRestartDevServer(
    request: FastifyRequest<{ Body: { jwt: string; prototype_id: string } }>,
    reply: FastifyReply,
  ): Promise<APIResponse<unknown, StandardErrorResponse>> {
    const { jwt, prototype_id } = request.body;

    // 1. Authentication check
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      jwt,
      request.log2,
    );
    if (!authResult || !authResult.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message:
            'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
        },
      });
    }

    request.log2 = request.log2.child({
      userId: authResult.user.id,
      prototypeId: prototype_id,
    });

    try {
      // 2. Get current build ID
      const currentBuildId = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(prototype_id),
      );

      if (!currentBuildId) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: 'Not Found',
            message: 'No active dev server found for this prototype',
          },
        });
      }

      // 3. Get the active build data
      const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
      const existingBuild = await this.hgetallAsActiveBuild(activeBuildKey);

      if (!existingBuild || !isActiveBuildType(existingBuild)) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: 'Not Found',
            message: 'Invalid or missing build data',
          },
        });
      }

      // 4. Check if dev server is in a restartable state
      if (!isEditableDevServer(existingBuild.status)) {
        return reply.status(HTTP_STATUS.CONFLICT).send({
          data: null,
          error: {
            error: 'Conflict',
            message: `Cannot restart dev server in ${existingBuild.status} state`,
          },
        });
      }

      // 5. Call restart endpoint on the fargate instance
      const restartResponse = await this.callFargateRestart(
        existingBuild.fargate_private_ip,
        request.log2,
      );

      if (restartResponse.success) {
        // 6. Update last_touched timestamp
        const updatedBuildData = {
          ...existingBuild,
          last_touched: Math.floor(Date.now() / 1000),
        };

        await this.cache.hset(
          activeBuildKey,
          this.activeBuildToStringRecord(updatedBuildData),
        );

        return reply.status(HTTP_STATUS.OK).send({
          data: { message: 'Dev server restarted successfully' },
          error: null,
        });
      } else {
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'Internal Server Error',
            message: 'Failed to restart dev server',
          },
        });
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to restart dev server');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal Server Error',
          message: e.message,
        },
      });
    }
  }

  private async callFargateRestart(
    fargatePrivateIp: string,
    log2: SystemLogger,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.post(
        `http://${fargatePrivateIp}:3002/dev-server/restart`,
        {},
        {
          timeout: 90000, // 90 second timeout for restart
          headers: {
            'Content-Type': 'application/json',
            'x-trace-id': log2.getTraceId(),
          },
        },
      );

      log2.info('Fargate restart response:', { response: response.data });
      return { success: true };
    } catch (error) {
      log2.error(error, 'Error calling fargate restart endpoint');
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Route handlers
  private async handleDispatch(
    request: FastifyRequest<{ Body: DispatchRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<DispatchSuccessResponse, StandardErrorResponse>> {
    // 1. Extract validated body (validation handled by Fastify schema)
    const {
      jwt,
      prototype_id,
      framework,
      files,
      assets,
      file_scope,
      deleted_files,
    } = request.body;
    const selectedFramework = framework || 'expo_react_native'; // Default framework to expo_react_native if not provided
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      jwt,
      request.log2,
    );
    if (!authResult || !authResult.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message:
            'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
        } as StandardErrorResponse,
      });
    }
    // update logger context
    request.log2 = request.log2.child({
      userId: authResult.user.id,
      prototypeId: prototype_id,
    });
    try {
      const currentTime = Math.floor(Date.now() / 1000);

      // Check if there's an existing current build
      const currentBuildId = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(prototype_id),
      );

      let shouldCreateNewBuild = true;
      if (currentBuildId) {
        request.log2.consoleLogDevOnly('info', 'Current build ID found: ', {
          currentBuildId,
        });
        const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuild = await this.hgetallAsActiveBuild(activeBuildKey);

        if (existingBuild) {
          if (!isActiveBuildType(existingBuild)) {
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
              data: null,
              error: {
                error: 'Internal Server Error',
                message: 'Invalid build data in cache',
              } as StandardErrorResponse,
            });
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
            return reply.status(HTTP_STATUS.CONFLICT).send({
              data: null,
              error: {
                error: 'Conflict',
                message:
                  'There is already an active dispatch request for this prototype',
              } as StandardErrorResponse,
            });
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
          url: this.getS3Url(prototype_id),
          status: 'creating',
          last_touched: currentTime,
        };
        activeBuildKey = await this.setNewBuildCacheData(
          prototype_id,
          currentTime,
          newBuildCacheData,
        );
        let newFargateInstance: FargateInstanceInfo;
        try {
          newFargateInstance = await request.log2.time(
            LatencyEvents.launch_fargate_instance_latency,
            async (): Promise<FargateInstanceInfo> => {
              return await this.idleContainerAllocationSystem.allocateFargateDevServer(
                prototype_id,
                activeBuildKey,
                newBuildCacheData,
              );
            },
          );
        } catch (error) {
          const buildIdFromKey = activeBuildKey.replace('active_build:', '');
          await removeBuildDataFromCache(
            this.cache,
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
        const existingBuild = await this.hgetallAsActiveBuild(activeBuildKey);
        if (!existingBuild || !isActiveBuildType(existingBuild)) {
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: 'Internal Server Error',
              message: 'Invalid build data in cache',
            } as StandardErrorResponse,
          });
        }
        updatedBuildCacheData = {
          ...existingBuild,
          status: 'updating',
          last_touched: currentTime,
        };
      }
      await this.cache.hset(
        activeBuildKey,
        this.activeBuildToStringRecord(updatedBuildCacheData),
      );
      // NOTE: at this point, there should always be an active build, with status "updating"

      // Dispatch request to fargate instance
      const requestBody = await this.constructRequestBody({
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
            return await this.dispatchFormedRequestToFargateInstanceServer(
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
          fargateResponse.tunnel_url || this.getS3Url(prototype_id);
        updatedBuildCacheData.last_touched = Math.floor(Date.now() / 1000);
        await this.cache.hset(
          activeBuildKey,
          this.activeBuildToStringRecord(updatedBuildCacheData),
        );
        // Update builds ZSET with new timestamp
        const buildIdFromKey = activeBuildKey.replace('active_build:', '');
        await this.cache.customCommand([
          'ZADD',
          CACHE_KEYS.protoBuilds(prototype_id),
          updatedBuildCacheData.last_touched.toString(),
          buildIdFromKey,
        ]);
        request.log2.info('Updated build cache data: ', {
          activeBuildCacheData: updatedBuildCacheData,
        });

        if (fargateResponse.status === 'success') {
          return reply.status(HTTP_STATUS.OK).send({
            data: {
              viewing_url: this.normalizeUrl(
                fargateResponse.tunnel_url || this.getS3Url(prototype_id),
              ),
              build_errors: fargateResponse.build_errors,
              build_warnings: fargateResponse.build_warnings,
            } as DispatchSuccessResponse,
            error: null,
          });
        } else {
          request.log2.error(undefined, 'Build failed on fargate instance', {
            fargateResponse,
          });
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: 'Build Failed',
              message: 'Build failed on fargate instance',
            } as StandardErrorResponse,
          });
        }
      } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        request.log2.error(
          error,
          'There was an error dispatching the request to the fargate instance',
        );
        updatedBuildCacheData.status = 'error';
        await this.cache.hset(
          activeBuildKey,
          this.activeBuildToStringRecord(updatedBuildCacheData),
        );

        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'Internal Server Error',
            message:
              'There was a server error building the prototype. ' + e.message,
          } as StandardErrorResponse,
        });
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Dispatch request failed');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal Server Error',
          message: e.message,
        } as StandardErrorResponse,
      });
    }
  }

  private async setNewBuildCacheData(
    prototype_id: string,
    currentTime: number,
    newBuildCacheData: ActiveBuild,
  ): Promise<string> {
    const buildId = `build_${prototype_id}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const activeBuildKey = CACHE_KEYS.activeBuild(buildId);
    // Set the new build as active
    await this.cache.hset(
      activeBuildKey,
      this.activeBuildToStringRecord(newBuildCacheData),
    );
    // Update current pointer
    await this.cache.set(CACHE_KEYS.protoCurrentBuild(prototype_id), buildId);
    // Add to builds ZSET
    await this.cache.customCommand([
      'ZADD',
      CACHE_KEYS.protoBuilds(prototype_id),
      currentTime.toString(),
      buildId,
    ]);
    return activeBuildKey;
  }

  private async handleDispatchEditIntent(
    request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<DispatchPrecheckSuccessResponse, DispatchPrecheckErrorResponse>
  > {
    // 1. Extract validated body (validation handled by Fastify schema)
    const { jwt, prototype_id } = request.body;
    request.log2 = request.log2.child({
      prototypeId: prototype_id,
    });

    try {
      // 2. Make a call to dispatch precheck to get the precheck response
      const precheckInjectResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch-precheck',
        headers: {
          'x-trace-id': request.log2.getTraceId(),
        },
        payload: {
          jwt,
          prototype_id,
        } as DispatchPrecheckRequestBody,
      });

      const precheckResponse: APIResponse<
        DispatchPrecheckSuccessResponse,
        DispatchPrecheckErrorResponse
      > = JSON.parse(precheckInjectResponse.payload);

      // 3. If there's an editable dev server, then update the last_touched timestamp to now in the current active build so it doesn't get cleaned
      if (
        precheckResponse.data &&
        isEditableDevServer(precheckResponse.data.status)
      ) {
        // Get current build ID and update last_touched timestamp
        const currentBuildId = await this.cache.get(
          CACHE_KEYS.protoCurrentBuild(prototype_id),
        );

        if (currentBuildId) {
          const activeBuildKey = CACHE_KEYS.activeBuild(
            currentBuildId as string,
          );
          const existingBuild = await this.hgetallAsActiveBuild(activeBuildKey);

          if (existingBuild && isActiveBuildType(existingBuild)) {
            const updatedBuildData = {
              ...existingBuild,
              last_touched: Math.floor(Date.now() / 1000),
            };

            // Update the active build cache with new timestamp
            await this.cache.hset(
              activeBuildKey,
              this.activeBuildToStringRecord(updatedBuildData),
            );

            // Update builds ZSET with new timestamp
            const buildIdFromKey = activeBuildKey.replace('active_build:', '');
            await this.cache.customCommand([
              'ZADD',
              CACHE_KEYS.protoBuilds(prototype_id),
              updatedBuildData.last_touched.toString(),
              buildIdFromKey,
            ]);

            request.log2.consoleLogDevOnly(
              'info',
              `[handleDispatchEditIntent] Updated last_touched timestamp for build: ${currentBuildId}`,
            );
          }
        }
      }

      // 4. Return the precheck response
      return reply.status(HTTP_STATUS.OK).send(precheckResponse);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(
        error,
        '[handleDispatchEditIntent] Edit intent request failed',
      );

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal Server Error',
          message: e.message,
        },
      });
    }
  }

  private async handleDispatchPrecheck(
    request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<DispatchPrecheckSuccessResponse, DispatchPrecheckErrorResponse>
  > {
    // 1. Extract validated body (validation handled by Fastify schema)
    const { jwt, prototype_id } = request.body;

    // 2. Authentication and authorization validation
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      jwt,
      request.log2,
    );
    if (!authResult || !authResult.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message:
            'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
        } as DispatchPrecheckErrorResponse,
      });
    }
    // update logger context
    request.log2 = request.log2.child({
      userId: authResult.user.id,
      prototypeId: prototype_id,
    });

    try {
      // Check current build pointer
      const currentBuildId = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(prototype_id),
      );

      if (currentBuildId) {
        const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuild = await this.hgetallAsActiveBuild(activeBuildKey);

        if (existingBuild) {
          if (!isActiveBuildType(existingBuild)) {
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
              data: null,
              error: {
                error: 'Internal Server Error',
                message: 'Invalid build data in storage',
              } as DispatchPrecheckErrorResponse,
            });
          }

          return reply.status(HTTP_STATUS.OK).send({
            data: {
              status: existingBuild.status,
              viewing_url: this.normalizeUrl(
                isEditableDevServer(existingBuild.status)
                  ? existingBuild.url
                  : this.getS3Url(prototype_id),
              ),
            } as DispatchPrecheckSuccessResponse,
            error: null,
          });
        }
      }

      // No active build, return S3 URL
      return reply.status(HTTP_STATUS.OK).send({
        data: {
          status: null,
          viewing_url: this.normalizeUrl(this.getS3Url(prototype_id)),
        } as DispatchPrecheckSuccessResponse,
        error: null,
      });
    } catch (error) {
      request.log2.error(error, '[handleDispatchPrecheck] Precheck failed');
      const e = error instanceof Error ? error : new Error(String(error));
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal Server Error',
          message: e.message,
        } as DispatchPrecheckErrorResponse,
      });
    }
  }

  private async dispatchFormedRequestToFargateInstanceServer(
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

  private async constructRequestBody({
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

  private getS3Url(prototypeId: string): string {
    // Construct S3/CloudFront URL for the prototype
    return S3_URL_TEMPLATE(prototypeId);
  }

  private normalizeUrl(url: string): string {
    // Ensure URL has protocol (https://) for iframe loading
    return url && !url.startsWith('http') ? `https://${url}` : url;
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
