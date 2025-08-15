import { createClient } from '@supabase/supabase-js';
import { GlideClient } from '@valkey/valkey-glide';
import axios from 'axios';
import * as dotenv from 'dotenv';
import type { Database } from './types/supabase.js';
import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
  waitUntilTasksRunning, // optional helper waiter
} from '@aws-sdk/client-ecs';

dotenv.config();

export class DispatcherService {
  private ecsClient: ECSClient;
  private cache: GlideClient;
  // private allocateSha: string | null = null;

  constructor(cache: GlideClient, ecsClient: ECSClient) {
    this.cache = cache;
    this.ecsClient = ecsClient;
  }

  // Authentication and authorization utility
  private async validateUserAndPrototypeOwner(
    jwt: string,
    prototypeId: string,
  ) {
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

  // Precheck prototype status
  public async prototypeDispatchPrecheck(
    jwt: string,
    prototypeId: string,
  ): Promise<{
    state: 'dne' | 'active_dev_server' | 'active_build';
    status: 'updating' | 'error' | 'stable' | 'creating' | 'cleaning' | null;
    viewing_url: string;
  }> {
    try {
      // Authentication and authorization validation
      await this.validateUserAndPrototypeOwner(jwt, prototypeId);

      // Check current build pointer
      const currentBuildId = await this.cache.get(
        `proto:${prototypeId}:current`,
      );

      if (currentBuildId) {
        const activeBuildKey = `active_build:${currentBuildId}`;
        const existingBuildJson = await this.cache.get(activeBuildKey);

        if (existingBuildJson) {
          const existingBuild: ActiveBuild = JSON.parse(
            existingBuildJson as string,
          );

          // Determine state based on status
          const state = 'active_dev_server';

          return {
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
        state: 'dne',
        status: null,
        viewing_url: this.normalizeUrl(this.getS3Url(prototypeId)),
      };
    } catch (error) {
      throw error;
    }
  }

  private getS3Url(prototypeId: string): string {
    // Construct S3/CloudFront URL for the prototype
    return `${prototypeId}.render.materializeui.com/`;
  }

  private normalizeUrl(url: string): string {
    // Ensure URL has protocol (https://) for iframe loading
    return url && !url.startsWith('http') ? `https://${url}` : url;
  }

  public async processDispatchRequest({
    jwt,
    prototype_id,
    framework,
    files,
    file_scope,
  }: DispatchRequest): Promise<{
    status: 'success' | 'error';
    viewing_url: string;
    build_errors: CodeError[];
    build_warnings: CodeWarning[];
    error_message?: string;
  }> {
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
        `proto:${prototype_id}:current`,
      );
      let shouldCreateNewBuild = true;

      if (currentBuildId) {
        const activeBuildKey = `active_build:${currentBuildId}`;
        const existingBuildJson = await this.cache.get(activeBuildKey);

        if (existingBuildJson) {
          const existingBuild: ActiveBuild = JSON.parse(
            existingBuildJson as string,
          );

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
        activeBuildKey = `active_build:${buildId}`;
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
        await this.cache.set(`proto:${prototype_id}:current`, buildId);

        // Add to builds ZSET
        await this.cache.customCommand([
          'ZADD',
          `proto:${prototype_id}:builds`,
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
        activeBuildKey = `active_build:${currentBuildId}`;
        const existingBuildJson = await this.cache.get(activeBuildKey);
        const existingBuild: ActiveBuild = JSON.parse(
          existingBuildJson as string,
        );

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
        framework,
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
          `proto:${prototype_id}:builds`,
          updatedBuildCacheData.last_touched.toString(),
          buildIdFromKey,
        ]);

        console.log(updatedBuildCacheData);

        return {
          status: fargateResponse.status,
          viewing_url: this.normalizeUrl(
            fargateResponse.tunnel_url || this.getS3Url(prototype_id),
          ),
          build_errors: fargateResponse.build_errors,
          build_warnings: fargateResponse.build_warnings,
        };
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

  private async launchFargateInstance(
    prototypeId: string,
  ): Promise<{ taskArn: string; privateIp: string }> {
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
          { client: this.ecsClient, maxWaitTime: 300 }, // 5 min
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
    requestBody: any,
  ): Promise<FargateDevServerResponse> {
    try {
      console.log(
        `Dispatching request to fargate instance at ${fargatePrivateIp}:3002/dev-server`,
      );

      const response = await axios.post(
        `http://${fargatePrivateIp}:3002/dev-server`,
        requestBody,
        {
          timeout: 300000, // 5 minutes
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
    framework: 'expo_react_native' | 'react';
    files: FileInput[];
    file_scope: 'updates' | 'complete';
  }) {
    return {
      prototype_id,
      framework,
      files,
      file_scope,
    };
  }
}

interface ActiveBuild {
  fargate_task_arn: string;
  fargate_private_ip: string;
  url: string;
  status: 'creating' | 'updating' | 'error' | 'stable' | 'cleaning';
  last_touched: number;
}

interface CodeError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  type: 'build' | 'runtime' | 'dependency' | 'syntax';
}

interface CodeWarning {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  type: 'build' | 'deprecation' | 'performance' | 'unused';
}

interface FargateDevServerResponse {
  status: 'success' | 'error';
  tunnel_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}

interface FileInput {
  path: string;
  content: string;
  isBase64?: boolean;
}

interface DispatchRequest {
  jwt: string;
  prototype_id: string;
  framework: 'expo_react_native' | 'react';
  files: FileInput[];
  file_scope: 'updates' | 'complete';
}
