import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  waitUntilTasksRunning,
} from '@aws-sdk/client-ecs';
import { createClient } from '@supabase/supabase-js';
import { GlideClient } from '@valkey/valkey-glide';
import axios from 'axios';
import * as dotenv from 'dotenv';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  type ActiveBuild,
  type AuthValidationResult,
  BUILD_TIMEOUTS,
  CACHE_KEYS,
  type FargateDevServerResponse,
  type FargateInstanceInfo,
  type FileScope,
  type Framework,
  isActiveBuild,
  S3_URL_TEMPLATE,
} from '../types/InternalTypes.js';
import {
  type DispatchPrecheckRequestBody,
  type DispatchPrecheckResponse,
  type DispatchRequestBody,
  HTTP_STATUS,
  isStandardErrorResponse,
  PrototypeAssetInput,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  StandardErrorResponse,
  StartDevServerRequestBody,
} from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';

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
      this.handleDispatch.bind(this),
    );

    // POST /dispatch-precheck
    app.post<{ Body: DispatchPrecheckRequestBody }>(
      '/dispatch-precheck',
      this.handleDispatchPrecheck.bind(this),
    );
  }

  // Route handlers
  private async handleDispatch(
    request: FastifyRequest<{ Body: DispatchRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    // 1. Parse and Validate Body
    const { jwt, prototype_id, framework, files, assets, file_scope } =
      request.body;
    if (!jwt) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        error: 'Bad Request',
        message: 'jwt is required',
      });
    }
    if (!prototype_id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        error: 'Bad Request',
        message: 'prototype_id is required',
      });
    }
    if (!files || !Array.isArray(files)) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        error: 'Bad Request',
        message: 'files is required and must be an array',
      });
    }
    if (!assets || !Array.isArray(assets)) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        error: 'Bad Request',
        message: 'assets is required and must be an array',
      });
    }
    if (!file_scope) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        error: 'Bad Request',
        message: 'file_scope is required',
      });
    }
    if (files.length === 0) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        error: 'Bad Request',
        message: 'files cannot be empty',
      });
    }
    const selectedFramework = framework || 'expo_react_native'; // Default framework to expo_react_native if not provided

    console.log(`Processing dispatch request for prototype: ${prototype_id}`);

    // 2. Authentication and authorization validation
    const userAccessValidationResult = await this.validateUserAndPrototypeOwner(
      jwt,
      prototype_id,
    );
    if (isStandardErrorResponse(userAccessValidationResult)) {
      if (userAccessValidationResult.error === 'Unauthorized') {
        return reply
          .status(HTTP_STATUS.UNAUTHORIZED)
          .send(userAccessValidationResult);
      } else if (
        userAccessValidationResult.error === 'Not Found' ||
        userAccessValidationResult.error === 'Forbidden'
      ) {
        return reply
          .status(HTTP_STATUS.NOT_FOUND)
          .send(userAccessValidationResult);
      } else {
        return reply
          .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
          .send(userAccessValidationResult);
      }
    }

    console.log('User access validation successful');

    try {
      // Generate unique build ID
      const currentTime = Math.floor(Date.now() / 1000);

      // Check if there's an existing current build
      const currentBuildId = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(prototype_id),
      );

      let shouldCreateNewBuild = true;
      if (currentBuildId) {
        console.log('Current build ID found: ', currentBuildId);
        const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuildJson = await this.cache.get(activeBuildKey);

        if (existingBuildJson) {
          const parsedBuild = JSON.parse(existingBuildJson as string);
          if (!isActiveBuild(parsedBuild)) {
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
              error: 'Internal Server Error',
              message: 'Invalid build data in cache',
            });
          }
          const existingBuild: ActiveBuild = parsedBuild;

          // If build is cleaning, proceed with new build
          if (existingBuild.status === 'cleaning') {
            console.log(
              `Existing build ${currentBuildId} is cleaning, creating new build`,
            );
            shouldCreateNewBuild = true;
          } else if (
            existingBuild.status === 'creating' ||
            existingBuild.status === 'updating'
          ) {
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
        console.log('Creating new build');
        const buildId = `build_${prototype_id}_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        // Create new build
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

        console.log('Set cache data active build: ', buildId);

        // Update current pointer
        await this.cache.set(
          CACHE_KEYS.protoCurrentBuild(prototype_id),
          buildId,
        );

        console.log('Set cache data current build: ', buildId);

        // Add to builds ZSET
        await this.cache.customCommand([
          'ZADD',
          CACHE_KEYS.protoBuilds(prototype_id),
          currentTime.toString(),
          buildId,
        ]);

        console.log('Set cache data builds zset for this prototype: ', buildId);

        console.log('Launching new fargate instance');
        const newFargateInstance =
          await this.launchFargateInstance(prototype_id);
        console.log('Fargate instance launched: ', newFargateInstance);

        updatedBuildCacheData = {
          ...newBuildCacheData,
          status: 'updating',
          fargate_task_arn: newFargateInstance.taskArn,
          fargate_private_ip: newFargateInstance.privateIp,
        };
      } else {
        // Reuse existing build
        console.log('Reusing existing build');
        activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuildJson = await this.cache.get(activeBuildKey);
        const parsedBuild = JSON.parse(existingBuildJson as string);
        if (!isActiveBuild(parsedBuild)) {
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

      console.log('Set cache data active build: ', activeBuildKey);

      // Dispatch request to fargate instance
      const requestBody = await this.constructRequestBody({
        prototype_id,
        framework: selectedFramework,
        files,
        assets,
        file_scope,
      });

      try {
        console.log(
          'Dispatching request to fargate instance: ',
          activeBuildKey,
        );
        const fargateResponse =
          await this.dispatchFormedRequestToFargateInstanceServer(
            updatedBuildCacheData.fargate_private_ip,
            requestBody,
          );

        console.log('Fargate responded: ', fargateResponse);
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

        console.log(updatedBuildCacheData);

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
        console.log(
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
      console.error('Dispatch request failed:', e);

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
    // 1. Parse and Validate Body
    const { jwt, prototype_id } = request.body;
    if (!jwt) {
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        error: 'Bad Request',
        message: 'JWT is required',
      };
    }
    if (!prototype_id) {
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        error: 'Bad Request',
        message: 'prototype_id is required',
      };
    }

    console.log(`Processing precheck request for prototype: ${prototype_id}`);

    // 2. Authentication and authorization validation
    const userAccessValidationResult = await this.validateUserAndPrototypeOwner(
      jwt,
      prototype_id,
    );
    if (isStandardErrorResponse(userAccessValidationResult)) {
      if (userAccessValidationResult.error === 'Unauthorized') {
        return reply
          .status(HTTP_STATUS.UNAUTHORIZED)
          .send(userAccessValidationResult);
      } else if (
        userAccessValidationResult.error === 'Not Found' ||
        userAccessValidationResult.error === 'Forbidden'
      ) {
        return reply
          .status(HTTP_STATUS.NOT_FOUND)
          .send(userAccessValidationResult);
      } else {
        return reply
          .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
          .send(userAccessValidationResult);
      }
    }

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
          if (!isActiveBuild(parsedBuild)) {
            reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
            return {
              error: 'Internal Server Error',
              message: 'Invalid build data in storage',
            };
          }
          const existingBuild: ActiveBuild = parsedBuild;

          return {
            success: true,
            state: 'active_dev_server', // ALWAYS ACTIVE DEV SERVER CURRENTLY
            status: existingBuild.status,
            viewing_url: this.normalizeUrl(
              existingBuild.url || this.getS3Url(prototype_id),
            ),
          };
        }
      }

      // No active build, return S3 URL
      return {
        success: true,
        state: 'dne',
        status: null,
        viewing_url: this.normalizeUrl(this.getS3Url(prototype_id)),
      };
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      console.error('Precheck cache operation failed:', e);

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: e.message,
      });
    }
  }

  // Authentication and authorization utility
  private async validateUserAndPrototypeOwner(
    jwt: string,
    prototypeId: string,
  ): Promise<AuthValidationResult | StandardErrorResponse> {
    try {
      // 1. Create Anon Supabase client with JWT
      const supabase = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${jwt}`,
            },
          },
        },
      );

      // 2. Verify JWT and get user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(jwt);
      if (authError || !user) {
        return {
          error: 'Unauthorized',
          message: 'Invalid JWT or user not authenticated',
        };
      }

      // 3. Attempt to fetch prototype from database to verify permissions
      const { data: prototype, error: prototypeError } = await supabase
        .from('prototypes')
        .select('*')
        .eq('id', prototypeId)
        .single();

      if (prototypeError || !prototype) {
        return {
          error: 'Not Found',
          message: 'Prototype not found or user does not have permissions',
        };
      }

      if (prototype.owner_id !== user.id) {
        return {
          error: 'Forbidden',
          message: 'User does not have permissions to edit this prototype',
        };
      }

      return { user, prototype };
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      console.error('Validation error:', e);
      return {
        error: 'Internal Server Error',
        message: 'Authentication validation failed',
      };
    }
  }

  private async launchFargateInstance(
    prototypeId: string,
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
        console.log(
          `Successfully launched Fargate task: ${taskArn} for prototype: ${prototypeId}`,
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
      console.error('Failed to launch Fargate task:', error);
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
  ): Promise<FargateDevServerResponse> {
    try {
      console.log(
        `Dispatching request to fargate instance at ${fargatePrivateIp}:3002/dev-server`,
      );

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

      console.log('Fargate instance responded successfully');
      return response.data as FargateDevServerResponse;
    } catch (error) {
      console.error('Error dispatching request to fargate instance:', error);
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
  }: {
    prototype_id: string;
    framework: Framework;
    files: PrototypeFileInput[];
    assets: PrototypeAssetInput[];
    file_scope: FileScope;
  }): Promise<StartDevServerRequestBody> {
    // Convert prototype assets to FileInput format by downloading and encoding
    const assetInputs: PrototypeAssetInputWithContent[] = [];
    for (const asset of assets) {
      try {
        console.log(
          `🔍 Converting asset ${asset.name} from storage_url: ${asset.storage_url}`,
        );
        const response = await fetch(asset.storage_url);
        if (!response.ok) {
          console.error(
            `Failed to fetch asset ${asset.name}: ${response.status} ${response.statusText}`,
          );
          continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString('base64');

        assetInputs.push({
          ...asset,
          contents: base64Content,
        });
        console.log(`✅ Successfully converted asset: ${asset.name}`);
      } catch (error) {
        console.error(`Error converting asset ${asset.name}:`, error);
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
