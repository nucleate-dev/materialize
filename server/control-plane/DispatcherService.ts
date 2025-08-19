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
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  type ActiveBuild,
  type AuthValidationResult,
  BUILD_TIMEOUTS,
  CACHE_KEYS,
  type FargateDevServerResponse,
  type FargateInstanceInfo,
  type FargateRequestBody,
  type Framework,
  type FileScope,
  isActiveBuild,
  S3_URL_TEMPLATE,
} from './types/DispatcherServiceTypes.js';
import {
  type FileInput,
  type DispatchResponse,
  type DispatchRequestBody,
  type DispatchPrecheckRequestBody,
  type DispatchPrecheckResponse,
  StandardErrorResponse,
} from './types/PublicServerAPITypes.js';
import type { Database } from './types/supabase.js';

dotenv.config();

export class DispatcherService {
  private ecsClient: ECSClient;
  private cache: GlideClient;
  // private allocateSha: string | null = null;

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
  ): Promise<DispatchResponse> {
    try {
      const { jwt, prototype_id, framework, files, file_scope } = request.body;

      // Validation
      if (!jwt) {
        reply.status(400);
        return {
          error: 'Bad Request',
          message: 'jwt is required',
        } as any;
      }

      if (!prototype_id) {
        reply.status(400);
        return {
          error: 'Bad Request',
          message: 'prototype_id is required',
        } as any;
      }

      // Default framework to expo_react_native if not provided
      const selectedFramework = framework || 'expo_react_native';

      if (!files || !Array.isArray(files)) {
        reply.status(400);
        return {
          error: 'Bad Request',
          message: 'files is required and must be an array',
        } as any;
      }

      if (!file_scope) {
        reply.status(400);
        return {
          error: 'Bad Request',
          message: 'file_scope is required',
        } as any;
      }

      if (files.length === 0) {
        reply.status(400);
        return {
          error: 'Bad Request',
          message: 'files cannot be empty',
        } as any;
      }

      console.log(`Processing dispatch request for prototype: ${prototype_id}`);

      const result = await this.processDispatchRequest({
        jwt,
        prototype_id,
        framework: selectedFramework,
        files,
        file_scope,
      });

      return result;
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      console.error('Build request failed:', e);

      // Check if it's an authentication or permission error
      if (
        e.message.includes('Invalid JWT') ||
        e.message.includes('not authenticated')
      ) {
        reply.status(401);
        return {
          error: 'Unauthorized',
          message: e.message,
        } as any;
      }

      if (
        e.message.includes('Prototype not found') ||
        e.message.includes('does not have permissions')
      ) {
        reply.status(404);
        return {
          error: 'Not Found',
          message: e.message,
        } as any;
      }

      reply.status(500);
      return {
        error: 'Internal Server Error',
        message: e.message,
      } as any;
    }
  }

  private async handleDispatchPrecheck(
    request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
    reply: FastifyReply,
  ): Promise<DispatchPrecheckResponse> {
    try {
      const { jwt, prototype_id } = request.body;

      if (!jwt) {
        reply.status(400);
        return {
          error: 'Bad Request',
          message: 'JWT is required',
        };
      }

      if (!prototype_id) {
        reply.status(400);
        return {
          error: 'Bad Request',
          message: 'prototype_id is required',
        };
      }

      console.log(`Processing precheck request for prototype: ${prototype_id}`);

      const result = await this.prototypeDispatchPrecheck(jwt, prototype_id);

      return result;
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      console.error('Precheck request failed:', e);

      // Check if it's an authentication or permission error
      if (
        e.message.includes('Invalid JWT') ||
        e.message.includes('not authenticated')
      ) {
        reply.status(401);
        return {
          error: 'Unauthorized',
          message: e.message,
        };
      }

      if (
        e.message.includes('Prototype not found') ||
        e.message.includes('does not have permissions')
      ) {
        reply.status(404);
        return {
          error: 'Prototype not found',
          message: e.message,
        };
      }

      reply.status(500);
      return {
        error: 'Internal Server Error',
        message: e.message,
      };
    }
  }

  // Precheck prototype status
  private async prototypeDispatchPrecheck(
    jwt: string,
    prototypeId: string,
  ): Promise<DispatchPrecheckResponse> {
    try {
      // Authentication and authorization validation
      await this.validateUserAndPrototypeOwner(jwt, prototypeId);

      // Check current build pointer
      const currentBuildId = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(prototypeId),
      );

      if (currentBuildId) {
        const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuildJson = await this.cache.get(activeBuildKey);

        if (existingBuildJson) {
          const parsedBuild = JSON.parse(existingBuildJson as string);
          if (!isActiveBuild(parsedBuild)) {
            throw new Error('Invalid build data in cache');
          }
          const existingBuild: ActiveBuild = parsedBuild;

          // Determine state based on status
          const state = 'active_dev_server';

          return {
            success: true,
            state,
            status: existingBuild.status,
            viewing_url: this.normalizeUrl(
              existingBuild.url || this.getS3Url(prototypeId),
            ),
          };
        }
      }

      // No active build, return S3 URL
      return {
        success: true,
        state: 'dne',
        status: null,
        viewing_url: this.normalizeUrl(this.getS3Url(prototypeId)),
      };
    } catch (error) {
      throw error;
    }
  }

  public async processDispatchRequest({
    jwt,
    prototype_id,
    framework,
    files,
    file_scope,
  }: DispatchRequestBody): Promise<DispatchResponse> {
    try {
      // Authentication and authorization validation
      await this.validateUserAndPrototypeOwner(jwt, prototype_id);

      // Generate unique build ID
      const buildId = `build_${prototype_id}_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const currentTime = Math.floor(Date.now() / 1000);

      // Check if there's an existing current build
      const currentBuildId = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(prototype_id),
      );
      let shouldCreateNewBuild = true;

      if (currentBuildId) {
        const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuildJson = await this.cache.get(activeBuildKey);

        if (existingBuildJson) {
          const parsedBuild = JSON.parse(existingBuildJson as string);
          if (!isActiveBuild(parsedBuild)) {
            throw new Error('Invalid build data in cache');
          }
          const existingBuild: ActiveBuild = parsedBuild;

          // If build is cleaning, proceed with new build
          if (existingBuild.status === 'cleaning') {
            console.log(
              `Existing build ${currentBuildId} is cleaning, creating new build`,
            );
            shouldCreateNewBuild = true;
          }
          // If build is actively working, return error
          else if (
            existingBuild.status === 'creating' ||
            existingBuild.status === 'updating'
          ) {
            return {
              status: 'error',
              viewing_url: this.normalizeUrl(
                existingBuild.url || this.getS3Url(prototype_id),
              ),
              build_errors: [],
              build_warnings: [],
              error_message:
                'There is already an active dispatch request for this prototype',
            };
          }
          // Reuse existing stable build
          else {
            shouldCreateNewBuild = false;
          }
        }
      }

      let activeBuildKey: string;
      let updatedBuildCacheData: ActiveBuild;

      if (shouldCreateNewBuild) {
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

        const newFargateInstance = await this.launchFargateInstance(
          prototype_id,
        );

        updatedBuildCacheData = {
          ...newBuildCacheData,
          status: 'updating',
          fargate_task_arn: newFargateInstance.taskArn,
          fargate_private_ip: newFargateInstance.privateIp,
        };
      } else {
        // Reuse existing build
        activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
        const existingBuildJson = await this.cache.get(activeBuildKey);
        const parsedBuild = JSON.parse(existingBuildJson as string);
        if (!isActiveBuild(parsedBuild)) {
          throw new Error('Invalid build data in cache');
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

      // Dispatch request to fargate instance
      const requestBody = this.constructRequestBody({
        prototype_id,
        framework: framework || 'expo_react_native',
        files,
        file_scope,
      });

      try {
        const fargateResponse =
          await this.dispatchFormedRequestToFargateInstanceServer(
            updatedBuildCacheData.fargate_private_ip,
            requestBody,
          );

        console.log('Fargate responded');
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
          return {
            status: 'success',
            viewing_url: this.normalizeUrl(
              fargateResponse.tunnel_url || this.getS3Url(prototype_id),
            ),
            build_errors: fargateResponse.build_errors,
            build_warnings: fargateResponse.build_warnings,
          };
        } else {
          return {
            status: 'error',
            viewing_url: this.normalizeUrl(this.getS3Url(prototype_id)),
            build_errors: fargateResponse.build_errors,
            build_warnings: fargateResponse.build_warnings,
            error_message: 'Build failed on fargate instance',
          };
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
        return {
          status: 'error',
          viewing_url: this.normalizeUrl(this.getS3Url(prototype_id)),
          build_errors: [],
          build_warnings: [],
          error_message:
            'There was a server error building the prototype. ' + e.message,
        };
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      return {
        status: 'error',
        viewing_url: this.normalizeUrl(this.getS3Url(prototype_id)),
        build_errors: [],
        build_warnings: [],
        error_message: e.message,
      };
    }
  }

  // Authentication and authorization utility
  private async validateUserAndPrototypeOwner(
    jwt: string,
    prototypeId: string,
  ): Promise<AuthValidationResult> {
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
      throw new Error('Invalid JWT or user not authenticated');
    }

    // 3. Attempt to fetch prototype from database to verify permissions
    const { data: prototype, error: prototypeError } = await supabase
      .from('prototypes')
      .select('*')
      .eq('id', prototypeId)
      .single();

    if (prototypeError || !prototype) {
      throw new Error('Prototype not found or user does not have permissions');
    }

    if (prototype.owner_id !== user.id) {
      throw new Error('User does not have permissions to edit this prototype');
    }

    return { user, prototype };
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
    requestBody: FargateRequestBody,
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

  private constructRequestBody({
    prototype_id,
    framework,
    files,
    file_scope,
  }: {
    prototype_id: string;
    framework: Framework;
    files: FileInput[];
    file_scope: FileScope;
  }): FargateRequestBody {
    return {
      prototype_id,
      framework,
      files,
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
