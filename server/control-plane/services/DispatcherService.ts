import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  waitUntilTasksRunning,
} from '@aws-sdk/client-ecs';
import { GlideClient } from '@valkey/valkey-glide';
import axios from 'axios';
import * as dotenv from 'dotenv';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
} from '../types/InternalTypes.js';
import {
  type DispatchPrecheckRequestBody,
  type DispatchPrecheckResponse,
  type DispatchRequestBody,
  HTTP_STATUS,
  PrototypeAssetInput,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  StartDevServerRequestBody,
} from '../types/PublicAPITypes.js';
import {
  isDevServerInShutdownStages,
  isDispatchInProgress,
  isEditableDevServer,
} from '../utils/prototypeDevServerStatusUtils.js';
import { checkUserHasPrototypeEditAccess } from '../utils/prototypeAuth.js';
import { SystemLogger } from '../loggers/SystemLogger.js';

dotenv.config();

export class DispatcherService {
  private ecsClient: ECSClient;
  private cache: GlideClient;

  constructor(cache: GlideClient, ecsClient: ECSClient) {
    this.cache = cache;
    this.ecsClient = ecsClient;
  }

  // Register routes with Fastify
  public registerRoutes(app: FastifyInstance): void {
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
  }

  // Route handlers
  private async handleDispatch(
    request: FastifyRequest<{ Body: DispatchRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    // 1. Extract validated body (validation handled by Fastify schema)
    const { jwt, prototype_id, framework, files, assets, file_scope } =
      request.body;
    const selectedFramework = framework || 'expo_react_native'; // Default framework to expo_react_native if not provided

    // 2. Authentication and authorization validation
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      jwt,
      request.log2,
    );
    if (!authResult || !authResult.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
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
        const existingBuildJson = await this.cache.get(activeBuildKey);

        if (existingBuildJson) {
          const parsedBuild = JSON.parse(existingBuildJson as string);
          if (!isActiveBuildType(parsedBuild)) {
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
              error: 'Internal Server Error',
              message: 'Invalid build data in cache',
            });
          }
          const existingBuild: ActiveBuild = parsedBuild;

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
              error: 'Conflict',
              message:
                'There is already an active dispatch request for this prototype',
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
        const buildId = `build_${prototype_id}_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        activeBuildKey = CACHE_KEYS.activeBuild(buildId);
        const newBuildCacheData: ActiveBuild = {
          fargate_task_arn: '',
          fargate_private_ip: '',
          url: this.getS3Url(prototype_id),
          status: 'creating',
          last_touched: currentTime,
        };

        // Set the new build as active
        await this.cache.set(activeBuildKey, JSON.stringify(newBuildCacheData));
        // Update current pointer
        await this.cache.set(
          CACHE_KEYS.protoCurrentBuild(prototype_id),
          buildId,
        );
        // Add to builds ZSET
        await this.cache.customCommand([
          'ZADD',
          CACHE_KEYS.protoBuilds(prototype_id),
          currentTime.toString(),
          buildId,
        ]);
        request.log2.consoleLogDevOnly(
          'info',
          'Creating a new build. Setting cache data:',
          {
            activeBuildData: newBuildCacheData,
            currentBuildPointer: buildId,
            buildSetAddition: {
              timestamp: currentTime.toString(),
              buildId: buildId,
            },
          },
        );

        request.log2.consoleLogDevOnly(
          'info',
          'Launching new fargate instance',
        );
        const newFargateInstance = await this.launchFargateInstance(
          prototype_id,
          request.log2,
        );
        request.log2.info('Successfully launched new fargate instance: ', {
          newFargateInstance,
        });

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
        const existingBuildJson = await this.cache.get(activeBuildKey);
        const parsedBuild = JSON.parse(existingBuildJson as string);
        if (!isActiveBuildType(parsedBuild)) {
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            error: 'Internal Server Error',
            message: 'Invalid build data in cache',
          });
        }
        const existingBuild: ActiveBuild = parsedBuild;

        updatedBuildCacheData = {
          ...existingBuild,
          status: 'updating',
          last_touched: currentTime,
        };
      }

      await this.cache.set(
        activeBuildKey,
        JSON.stringify(updatedBuildCacheData),
      );
      // NOTE: at this point, there should always be an active build, with status "updating"

      // Dispatch request to fargate instance
      const requestBody = await this.constructRequestBody({
        prototype_id,
        framework: selectedFramework,
        files,
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
        const fargateResponse =
          await this.dispatchFormedRequestToFargateInstanceServer(
            updatedBuildCacheData.fargate_private_ip,
            requestBody,
            request.log2,
          );

        request.log2.info('Fargate responded: ', { fargateResponse });
        updatedBuildCacheData.status = 'stable';
        updatedBuildCacheData.url =
          fargateResponse.tunnel_url || this.getS3Url(prototype_id);
        updatedBuildCacheData.last_touched = Math.floor(Date.now() / 1000);

        await this.cache.set(
          activeBuildKey,
          JSON.stringify(updatedBuildCacheData),
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
            status: 'success',
            viewing_url: this.normalizeUrl(
              fargateResponse.tunnel_url || this.getS3Url(prototype_id),
            ),
            build_errors: fargateResponse.build_errors,
            build_warnings: fargateResponse.build_warnings,
          });
        } else {
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            error: 'Build Failed',
            message: 'Build failed on fargate instance',
          });
        }
      } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        request.log2.error(
          error,
          'There was an error dispatching the request to the fargate instance',
        );
        updatedBuildCacheData.status = 'error';
        await this.cache.set(
          activeBuildKey,
          JSON.stringify(updatedBuildCacheData),
        );

        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Internal Server Error',
          message:
            'There was a server error building the prototype. ' + e.message,
        });
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Dispatch request failed');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: e.message,
      });
    }
  }

  private async handleDispatchEditIntent(
    request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
    reply: FastifyReply,
  ): Promise<DispatchPrecheckResponse> {
    // 1. Extract validated body (validation handled by Fastify schema)
    const { jwt, prototype_id } = request.body;
    request.log2 = request.log2.child({
      prototypeId: prototype_id,
    });

    try {
      // 2. Make a call to dispatch precheck to get the precheck response
      const precheckRequest = {
        body: { jwt, prototype_id },
      } as FastifyRequest<{ Body: DispatchPrecheckRequestBody }>;
      const precheckResponse = await this.handleDispatchPrecheck(
        precheckRequest,
        reply,
      );

      // 3. If there's an editable dev server, then update the last_touched timestamp to now in the current active build so it doesn't get cleaned
      if (
        'success' in precheckResponse &&
        precheckResponse.success &&
        isEditableDevServer(precheckResponse.status)
      ) {
        // Get current build ID and update last_touched timestamp
        const currentBuildId = await this.cache.get(
          CACHE_KEYS.protoCurrentBuild(prototype_id),
        );

        if (currentBuildId) {
          const activeBuildKey = CACHE_KEYS.activeBuild(
            currentBuildId as string,
          );
          const existingBuildJson = await this.cache.get(activeBuildKey);

          if (existingBuildJson) {
            const parsedBuild = JSON.parse(existingBuildJson as string);
            if (isActiveBuildType(parsedBuild)) {
              const updatedBuildData = {
                ...parsedBuild,
                last_touched: Math.floor(Date.now() / 1000),
              };

              // Update the active build cache with new timestamp
              await this.cache.set(
                activeBuildKey,
                JSON.stringify(updatedBuildData),
              );

              // Update builds ZSET with new timestamp
              const buildIdFromKey = activeBuildKey.replace(
                'active_build:',
                '',
              );
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
      }

      // 4. Return the precheck response
      return precheckResponse;
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(
        error,
        '[handleDispatchEditIntent] Edit intent request failed',
      );

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: e.message,
      });
    }
  }

  private async handleDispatchPrecheck(
    request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
    reply: FastifyReply,
  ): Promise<DispatchPrecheckResponse> {
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
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
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
        const existingBuildJson = await this.cache.get(activeBuildKey);

        if (existingBuildJson) {
          const parsedBuild = JSON.parse(existingBuildJson as string);
          if (!isActiveBuildType(parsedBuild)) {
            reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
            return {
              error: 'Internal Server Error',
              message: 'Invalid build data in storage',
            };
          }
          const existingBuild: ActiveBuild = parsedBuild;

          return {
            success: true,
            status: existingBuild.status,
            viewing_url: this.normalizeUrl(
              isEditableDevServer(existingBuild.status)
                ? existingBuild.url
                : this.getS3Url(prototype_id),
            ),
          };
        }
      }

      // No active build, return S3 URL
      return {
        success: true,
        status: null,
        viewing_url: this.normalizeUrl(this.getS3Url(prototype_id)),
      };
    } catch (error) {
      request.log2.error(error, '[handleDispatchPrecheck] Precheck failed');
      const e = error instanceof Error ? error : new Error(String(error));
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: e.message,
      });
    }
  }

  private async launchFargateInstance(
    prototypeId: string,
    log2: SystemLogger,
  ): Promise<FargateInstanceInfo> {
    try {
      const runTaskInput = {
        cluster: process.env.ECS_CLUSTER_NAME!,
        taskDefinition: 'fastify-build-worker',
        launchType: 'FARGATE' as const,
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: process.env.ECS_SUBNETS?.split(',') || [],
            securityGroups: process.env.ECS_SECURITY_GROUPS?.split(',') || [],
            assignPublicIp: 'ENABLED' as const,
          },
        },
        overrides: {
          containerOverrides: [
            {
              name: 'materialize-fargate-build-worker-container',
              environment: [
                {
                  name: 'PROTOTYPE_ID',
                  value: prototypeId,
                },
                {
                  name: 'AWS_REGION',
                  value: process.env.AWS_REGION!,
                },
              ],
            },
          ],
        },
        tags: [
          {
            key: 'PrototypeId',
            value: prototypeId,
          },
          {
            key: 'Service',
            value: 'materialize-build-worker',
          },
        ],
      };

      const command = new RunTaskCommand(runTaskInput);
      const response = await this.ecsClient.send(command);

      if (response.tasks && response.tasks.length > 0) {
        const taskArn = response.tasks[0].taskArn!;
        log2.info(
          `[launchFargateInstance] Successfully initiated Fargate Task Launch`,
          {
            taskArn,
          },
        );

        // Wait for task to be running and get private IP
        await waitUntilTasksRunning(
          {
            client: this.ecsClient,
            maxWaitTime: BUILD_TIMEOUTS.FARGATE_LAUNCH_TIMEOUT,
          },
          {
            cluster: process.env.ECS_CLUSTER_NAME!,
            tasks: [taskArn],
          },
        );

        log2.consoleLogDevOnly(
          'info',
          `[launchFargateInstance] ECS client informed us that the task is running`,
        );

        // Describe the task to get the private IP
        const describeCommand = new DescribeTasksCommand({
          cluster: process.env.ECS_CLUSTER_NAME!,
          tasks: [taskArn],
        });
        const describeResponse = await this.ecsClient.send(describeCommand);

        const task = describeResponse.tasks?.[0];
        const eni = task?.attachments?.[0]?.details?.find(
          (detail) => detail.name === 'networkInterfaceId',
        )?.value;
        let privateIp = '';

        if (eni) {
          // Get private IP from ENI details in task
          const privateIpDetail = task?.attachments?.[0]?.details?.find(
            (detail) => detail.name === 'privateIPv4Address',
          );
          privateIp = privateIpDetail?.value || '';
        }

        return { taskArn, privateIp };
      } else {
        throw new Error('No task was created');
      }
    } catch (error) {
      log2.error(error, 'Failed to launch Fargate task:');
      throw new Error(
        `Failed to launch Fargate instance: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
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
    prototype_id,
    framework,
    files,
    assets,
    file_scope,
    log2,
  }: {
    prototype_id: string;
    framework: Framework;
    files: PrototypeFileInput[];
    assets: PrototypeAssetInput[];
    file_scope: FileScope;
    log2: SystemLogger;
  }): Promise<StartDevServerRequestBody> {
    // Convert prototype assets to FileInput format by downloading and encoding
    const assetInputs: PrototypeAssetInputWithContent[] = [];
    log2.info(`[constructRequestBody] Converting assets to base64 format: `, {
      assetCount: assets.length,
    });
    for (const asset of assets) {
      try {
        const response = await fetch(asset.storage_url);
        if (!response.ok) {
          log2.error(
            new Error(
              `Failed to fetch asset ${asset.name}: ${response.status} ${response.statusText}`,
            ),
            `[constructRequestBody] Failed to fetch asset ${asset.name}: ${response.status} ${response.statusText}`,
          );
          continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString('base64');

        assetInputs.push({
          ...asset,
          contents: base64Content,
        });
      } catch (error) {
        log2.error(
          error,
          `[constructRequestBody] Error converting asset ${asset.name}:`,
        );
      }
    }

    return {
      prototype_id,
      framework,
      files: files,
      assets: assetInputs,
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
}
