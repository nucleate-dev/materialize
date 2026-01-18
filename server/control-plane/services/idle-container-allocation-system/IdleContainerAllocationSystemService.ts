import type { ECSClient, RunTaskCommandInput } from '@aws-sdk/client-ecs';
import {
  DescribeTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  waitUntilTasksRunning,
} from '@aws-sdk/client-ecs';
import {
  AssumeRoleCommand,
  // GetCallerIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GlideClient } from '@valkey/valkey-glide';
import axios from 'axios';
import { randomBytes } from 'crypto';
import type { SystemLogger } from '../../loggers/SystemLogger.js'; // adjust your path
import {
  AllocationSourceRepository,
  StandardErrorResponse as BuildWorkerStandardErrorResponse,
  PublicAllocateRequest,
  PublicAllocateSuccessResponse,
  SandboxAPIResponse,
} from '../../types/BuildWorkerTypes.js';
import {
  ActiveBuild,
  BUILD_TIMEOUTS,
  CACHE_KEYS,
  FargateInstanceInfo,
  IdleBuild,
  IdleContainerStatus,
} from '../../types/InternalTypes.js';
import { Database } from '../../types/supabase.js';
import { updateBuildTunnelInfo } from '../../utils/cacheInteractionUtils.js';
import { deleteCloudflareTunnel } from '../../utils/cloudflareTunnelManagementUtils.js';
import {
  createInstallationToken,
  fetchRepositoryById,
} from '../../utils/githubClient.js';
import { getValidGitHubUserAccessToken } from '../../utils/githubTokenUtils.js';
import { IdleCloudflareTunnelSystem } from './IdleCloudflareTunnelSystem.js';

const MAX_IDLE_FARGATE_BUILDS: number = 1;

export class IdleContainerAllocationSystemService {
  private readonly cache: GlideClient;
  private readonly ecsClient: ECSClient;
  private readonly log2: SystemLogger;
  private readonly stsClient: STSClient;
  private readonly cloudflareTunnelSystem: IdleCloudflareTunnelSystem;
  private readonly supabaseServiceRoleClient: SupabaseClient<Database>;
  private maintenanceTimer?: NodeJS.Timeout;

  constructor(opts: {
    cacheClient: GlideClient;
    ecsClient: ECSClient;
    stsClient: STSClient;
    log2: SystemLogger;
  }) {
    this.cache = opts.cacheClient;
    this.ecsClient = opts.ecsClient;
    this.stsClient = opts.stsClient;
    this.log2 = opts.log2.child({
      route: 'IdleContainerAllocationSystemService',
    });
    this.cloudflareTunnelSystem = new IdleCloudflareTunnelSystem({
      log2: this.log2,
    });
    this.supabaseServiceRoleClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    this.init();
  }

  /** Initialize idle pool and start maintenance loop */
  public async init(): Promise<void> {
    this.maintenanceTimer = setInterval(
      () =>
        this.ensureIdleCapacity().catch((e) =>
          this.log2.error(e, 'Idle maintenance failed'),
        ),
      5 * 60 * 1000, // every 5 minutes
    );
    await this.ensureIdleCapacity();
  }

  public shutdown(): void {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
  }

  private async ensureIdleCapacity(): Promise<void> {
    if (process.env.NODE_ENV === 'development') return; // no idle containers in development mode
    const currentIdle = await this.cache.llen(CACHE_KEYS.idleBuildsListKey);
    const toCreate = MAX_IDLE_FARGATE_BUILDS - currentIdle;
    if (toCreate === 0) return;
    else if (toCreate > 0) {
      this.log2.consoleLogDevOnly(
        'info',
        `Refreshing idle container capacity: Creating ${toCreate} idle builds to reach max ${MAX_IDLE_FARGATE_BUILDS}`,
      );
      await Promise.all(
        Array.from({ length: toCreate }, () => this.launchIdleContainer()),
      );
    } else {
      // Too many idle builds, clean them up
      const toRemove = Math.abs(toCreate);
      this.log2.warn(
        `[IdleAlloc] Found ${currentIdle} idle builds, cleaning up ${toRemove} to reach max ${MAX_IDLE_FARGATE_BUILDS}`,
      );

      // Collect tasks to remove
      const taskArns: string[] = [];
      for (let i = 0; i < toRemove; i++) {
        const taskArn = await this.cache.lpop(CACHE_KEYS.idleBuildsListKey); // clean newer tasks that may not be ready first
        if (taskArn) {
          taskArns.push(taskArn as string);
        }
      }

      // Run cleanup concurrently
      await Promise.all(
        taskArns.map(async (taskArn) => {
          const idleKey = CACHE_KEYS.idleBuild(taskArn);
          try {
            await this.terminateFargateTask(taskArn);
            await this.cache.del([idleKey]);
          } catch (error) {
            this.log2.error(
              error,
              `[IdleAlloc] Failed to terminate extra idle task ${taskArn}`,
            );
          }
        }),
      );

      return;
    }
  }

  /** Dispatcher calls this to get a ready container for a prototype */
  /** Dispatcher calls this to get a ready container for a prototype */
  public async allocateFargateDevServer(
    prototypeId: string,
    activeBuildKey: string,
    newBuildCacheData: ActiveBuild,
    jwt: string,
    userId: string,
  ): Promise<FargateInstanceInfo> {
    // If we are in development mode, we need to use the development container.
    // There will never be any idle development containers. Just directly allocate a new container.
    if (process.env.NODE_ENV === 'development') {
      return await this.launchFargateInstanceForDispatcherDirectly(
        prototypeId,
        this.log2,
        activeBuildKey,
        newBuildCacheData,
        jwt,
        userId,
      );
    }

    // 1. Try to pop an idle container from the pool
    const taskArn = (await this.cache.rpop(CACHE_KEYS.idleBuildsListKey)) as  // NOTE: this is an atomic operation
      | string
      | null;

    // 2. No idle containers found. Fallback to direct launch and replenish in background
    if (!taskArn) {
      this.log2.consoleLogDevOnly(
        'info',
        '[ContainerAlloc] No idle containers found, falling back to direct launch',
        { prototypeId },
      );
      if (MAX_IDLE_FARGATE_BUILDS > 0) {
        // background replenish
        this.launchIdleContainer().catch((err) =>
          this.log2.error(
            err,
            '[ContainerAlloc] Failed to replenish idle container',
          ),
        );
      }
      const info = await this.launchFargateInstanceForDispatcherDirectly(
        prototypeId,
        this.log2,
        activeBuildKey,
        newBuildCacheData,
        jwt,
        userId,
      );
      return info;
    }

    // 3. We got an idle container reference. Retrieve data from cache and remove from cache
    const idleKey = CACHE_KEYS.idleBuild(taskArn);
    const taskData = await this.hgetallAsIdleBuild(idleKey);
    await this.cache.del([idleKey]);
    // Replenish idle pool in background
    this.launchIdleContainer().catch((err) =>
      this.log2.error(err, '[IdleAlloc] Failed to replenish idle container'),
    );

    // 4. If the idle container is not usable, clean it up in the background and fallback to direct launch
    if (!taskData || !taskData.fargate_task_arn) {
      this.log2.warn(
        `[ContainerAlloc] Idle container ${taskArn} missing metadata, falling back to direct launch`,
      );
      this.terminateFargateTask(taskArn); // in background do not await
      return await this.launchFargateInstanceForDispatcherDirectly(
        prototypeId,
        this.log2,
        activeBuildKey,
        newBuildCacheData,
        jwt,
        userId,
      );
    }

    // 5. Assign idle container to prototype
    let privateIp: string = '';
    if (taskData.status === 'creating') {
      // Status = "creating" → wait until container is ready, then assign prototype
      this.log2.consoleLogDevOnly(
        'info',
        `[ContainerAlloc] Waiting for idle container ${taskArn} to finish creating`,
      );
      privateIp =
        await this.waitForFargateTaskToBeReadyAndGetPrivateIP(taskArn);
    } else if (taskData.status === 'ready') {
      privateIp = taskData.fargate_private_ip;
    }

    if (!privateIp) {
      // clean up unusable container and fallback to direct launch
      this.log2.error(
        new Error('failed to get private IP for idle container'),
        `[ContainerAlloc] Idle container ${taskArn} failed to get private IP`,
      );
      this.terminateFargateTask(taskArn);
      return this.launchFargateInstanceForDispatcherDirectly(
        prototypeId,
        this.log2,
        activeBuildKey,
        newBuildCacheData,
        jwt,
        userId,
      );
    }
    this.log2.consoleLogDevOnly(
      'info',
      '[ContainerAlloc] Allocating idle container to prototype',
      {
        prototypeId,
        taskArn,
        privateIp,
      },
    );
    const info: FargateInstanceInfo = {
      taskArn,
      privateIp,
      terminalTunnelId: '',
      terminalTunnelHostname: '',
      orchestrationToken: '',
    };
    try {
      const tunnelInfo =
        await this.scopeS3PermissionsAndTerminalTunnelsForContainer(
          info,
          activeBuildKey,
          prototypeId,
          jwt,
          userId,
        );
      return { ...info, ...tunnelInfo };
    } catch (error) {
      this.log2.error(
        error,
        'Failed to scope S3 permissions for container and initialize S3client',
      );
      this.terminateFargateTask(taskArn);
      throw new Error(
        'Could not allocate a container: failed to scope S3 permissions for container',
      );
    }
  }

  /** Launch one idle build (with PROTOTYPE_ID=idle) */
  private async launchIdleContainer(): Promise<void> {
    if (process.env.NODE_ENV === 'development') return; // no idle containers in development mode

    let taskArn: string;
    try {
      taskArn = await this.launchFargateInstanceNotReady(this.log2);
    } catch (error) {
      this.log2.error(error, 'Failed to launch idle container');
      return;
    }

    // Immediately add placeholder entry in cache
    const idleKey = CACHE_KEYS.idleBuild(taskArn);
    try {
      await this.cache.hset(idleKey, {
        fargate_task_arn: taskArn,
        fargate_private_ip: '',
        status: 'creating',
      });
      await this.cache.lpush(CACHE_KEYS.idleBuildsListKey, [taskArn]);
    } catch (error) {
      this.log2.error(
        error,
        'Failed to set initial idle container state in cache',
      );
      // If we can't write to cache, terminate the task to avoid leaks
      await this.terminateFargateTask(taskArn);
      return;
    }

    // Wait for container to become ready
    const privateIp =
      await this.waitForFargateTaskToBeReadyAndGetPrivateIP(taskArn);
    if (!privateIp) {
      this.log2.error('Failed to get private IP for idle container');
      await this.terminateFargateTask(taskArn);
      await this.cache.del([idleKey]);
      return;
    }
    // Update entry to ready
    try {
      const exists = await this.cache.exists([idleKey]);
      if (!exists) {
        this.log2.consoleLogDevOnly(
          'info',
          'Idle container Fargate Task is ready, but idle container is already popped from the cache for use',
          { idleKey },
        );
        return;
      }
      await this.cache.hset(idleKey, {
        fargate_task_arn: taskArn,
        fargate_private_ip: privateIp,
        status: 'ready',
      });
      this.log2.consoleLogDevOnly(
        'info',
        'Idle container launched and marked ready',
        {
          taskArn,
          privateIp,
        },
      );
      return;
    } catch (error) {
      this.log2.error(
        error,
        'Failed to update idle container state to ready in cache, deleting and cleaning up fargate task',
      );
      await this.terminateFargateTask(taskArn);
      await this.cache.del([idleKey]);
      return;
    }
  }

  /** Helper to terminate a Fargate task */
  private async terminateFargateTask(taskArn: string): Promise<void> {
    try {
      const command = new StopTaskCommand({
        cluster: process.env.ECS_CLUSTER_NAME!,
        task: taskArn,
        reason: 'Idle container cleanup',
      });
      await this.ecsClient.send(command);
      this.log2.consoleLogDevOnly('info', 'Terminated Fargate task', {
        taskArn,
      });
    } catch (error) {
      this.log2.error(error, 'Failed to terminate Fargate task');
    }
  }

  public async launchFargateInstanceForDispatcherDirectly(
    prototypeId: string,
    log2: SystemLogger,
    activeBuildKey: string,
    newBuildCacheData: ActiveBuild,
    jwt: string,
    userId: string,
  ): Promise<FargateInstanceInfo> {
    try {
      const taskArn = await this.launchFargateInstanceNotReady(log2);
      await this.cache.hset(activeBuildKey, {
        fargate_task_arn: taskArn,
        fargate_private_ip: newBuildCacheData.fargate_private_ip,
        url: newBuildCacheData.url,
        status: newBuildCacheData.status,
        last_touched: newBuildCacheData.last_touched.toString(),
      });
      const privateIp =
        await this.waitForFargateTaskToBeReadyAndGetPrivateIP(taskArn);
      if (!privateIp) {
        throw new Error('Failed to get private IP for idle container');
      }
      const info: FargateInstanceInfo = {
        taskArn,
        privateIp,
        terminalTunnelId: '',
        terminalTunnelHostname: '',
        orchestrationToken: '',
      };
      try {
        const tunnelInfo =
          await this.scopeS3PermissionsAndTerminalTunnelsForContainer(
            info,
            activeBuildKey,
            prototypeId,
            jwt,
            userId,
          );
        return { ...info, ...tunnelInfo };
      } catch (error) {
        this.log2.error(
          error,
          'Failed to scope S3 permissions for container and initialize S3client',
        );
        this.terminateFargateTask(taskArn);
        throw new Error(
          'Could not allocate a container: failed to scope S3 permissions for container',
        );
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

  // Returns the task arn
  private async launchFargateInstanceNotReady(
    log2: SystemLogger,
  ): Promise<string> {
    try {
      const command = new RunTaskCommand(
        this.getFargateRunTaskCommandConfiguration(),
      );
      const response = await this.ecsClient.send(command);
      if (!response.tasks || response.tasks.length === 0) {
        log2.error(
          new Error('No task was created'),
          'Failed to launch Fargate task:',
          { response },
        );
        throw new Error('No task was created');
      }
      // save taskArn to the cache immediately to prevent case where server/request fails before cache is updated
      // this edge case could result in an eternally running fargate task
      return response.tasks[0].taskArn!;
    } catch (error) {
      log2.error(error, 'Failed to launch Fargate task:');
      throw new Error(
        `Failed to launch Fargate instance: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  // Return the Fargate private IP
  private async waitForFargateTaskToBeReadyAndGetPrivateIP(
    taskArn: string,
  ): Promise<string> {
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
    const describeCommand = new DescribeTasksCommand({
      cluster: process.env.ECS_CLUSTER_NAME!,
      tasks: [taskArn],
    });
    const describeResponse = await this.ecsClient.send(describeCommand);
    const task = describeResponse.tasks?.[0];
    const eni = task?.attachments?.[0]?.details?.find(
      (detail) => detail.name === 'networkInterfaceId',
    )?.value;
    if (!eni) return '';
    const privateIpDetail = task?.attachments?.[0]?.details?.find(
      (detail) => detail.name === 'privateIPv4Address',
    );
    return privateIpDetail?.value || '';
  }

  private getFargateRunTaskCommandConfiguration(): RunTaskCommandInput {
    return {
      cluster: process.env.ECS_CLUSTER_NAME!,
      taskDefinition:
        process.env.NODE_ENV === 'production'
          ? 'fastify-build-worker'
          : 'materialize-development-containers',
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
            name:
              process.env.NODE_ENV === 'production'
                ? 'materialize-fargate-build-worker-container'
                : 'materialize-build-worker-container-development',
            environment: [
              {
                name: 'AWS_REGION',
                value: 'us-east-2',
              },
              {
                name: 'PORT',
                value: '3002',
              },
              {
                name: 'NODE_ENV',
                value: process.env.NODE_ENV!,
              },
              {
                name: 'NUCLEATE_SERVER_ENDPOINT',
                value: 'https://api.nucleate.dev',
              },
              {
                name: 'S3_BUCKET',
                value: 'materialize-sites',
              },
              {
                name: 'SUPABASE_URL',
                value: process.env.SUPABASE_URL!,
              },
              {
                name: 'SUPABASE_ANON_KEY',
                value: process.env.SUPABASE_ANON_KEY!,
              },
              {
                name: 'ANTHROPIC_API_KEY',
                value: process.env.ANTHROPIC_API_KEY!,
              },
              {
                name: 'POSTHOG_KEY',
                value: process.env.POSTHOG_KEY!,
              },
              {
                name: 'POSTHOG_HOST',
                value: process.env.POSTHOG_HOST!,
              },
              {
                name: 'GOOGLE_GENERATIVE_AI_API_KEY',
                value: process.env.GOOGLE_AI_API_KEY!,
              },
            ],
          },
        ],
      },
      tags: [
        {
          key: 'Service',
          value: 'materialize-build-worker',
        },
      ],
    };
  }

  private async hgetallAsIdleBuild(key: string): Promise<IdleBuild | null> {
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

    return {
      fargate_task_arn: obj.fargate_task_arn,
      fargate_private_ip: obj.fargate_private_ip,
      status: obj.status as IdleContainerStatus,
    };
  }

  /** Tell running idle container to switch to a real prototypeId */
  private async scopeS3PermissionsAndTerminalTunnelsForContainer(
    info: FargateInstanceInfo,
    activeBuildKey: string,
    prototypeId: string,
    jwt: string,
    userId: string,
  ): Promise<
    Pick<
      FargateInstanceInfo,
      'terminalTunnelId' | 'terminalTunnelHostname' | 'orchestrationToken'
    >
  > {
    // Assume AWS STS role for S3 access
    let out;
    try {
      // const callerIdentity = await this.stsClient.send(
      //   new GetCallerIdentityCommand({}),
      // );
      // this.log2.consoleLogDevOnly(
      //   'debug',
      //   'STS caller identity from Node before AssumeRole',
      //   { callerIdentity },
      // );
      // this.log2.consoleLogDevOnly('debug', 'AWS env in Node', {
      //   AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      //   AWS_PROFILE: process.env.AWS_PROFILE,
      // });
      out = await this.stsClient.send(
        new AssumeRoleCommand({
          RoleArn: process.env.S3_PROTOTYPE_ACCESS_ROLE_ARN!,
          RoleSessionName: `proto-${prototypeId}`,
          Tags: [{ Key: 'PrototypeId', Value: prototypeId }],
          DurationSeconds: 3600 * 12, // 12 hours, refresh as needed
        }),
      );
    } catch (error) {
      this.log2.error(
        error,
        `Failed to assume STS role for prototype ${prototypeId}`,
        {
          roleArn: process.env.S3_PROTOTYPE_ACCESS_ROLE_ARN,
          prototypeId,
        },
      );
      throw new Error(
        `Failed to assume AWS STS role: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!out.Credentials) {
      const error = new Error(
        'STS AssumeRole succeeded but returned no credentials',
      );
      this.log2.error(error, 'Missing credentials from STS response', {
        prototypeId,
        roleArn: process.env.S3_PROTOTYPE_ACCESS_ROLE_ARN,
      });
      throw error;
    }

    // Retrieve Cloudflare tunnel
    let tunnelConfig;
    try {
      tunnelConfig =
        await this.cloudflareTunnelSystem.retrieveIdleTunnelForAllocation(
          prototypeId,
        );
    } catch (error) {
      this.log2.error(
        error,
        `Failed to retrieve Cloudflare tunnel for prototype ${prototypeId}`,
        {
          prototypeId,
        },
      );
      throw new Error(
        `Failed to retrieve Cloudflare tunnel: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Store tunnel info in cache with wss:// prefix
    this.log2.consoleLogDevOnly(
      'debug',
      'updating cache with cloudflare tunnel final Tunnel config',
      {
        tunnelId: tunnelConfig.tunnel_id,
        hostname: tunnelConfig.hostname,
        cnameTarget: tunnelConfig.cname_target,
      },
    );
    const tunnelHostnameWithProtocol = `wss://${tunnelConfig.hostname}`;

    // Generate orchestration token for authenticating container orchestration requests
    const orchestrationToken = randomBytes(32).toString('hex');

    try {
      await updateBuildTunnelInfo(
        this.cache,
        activeBuildKey,
        tunnelConfig.tunnel_id || '',
        tunnelHostnameWithProtocol,
        orchestrationToken,
      );
    } catch (error) {
      this.log2.error(error, 'Failed to update build tunnel info in cache', {
        activeBuildKey,
        tunnelId: tunnelConfig.tunnel_id,
        tunnelHostname: tunnelHostnameWithProtocol,
      });
      throw new Error(
        `Failed to update tunnel info in cache: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const sourceRepository = await this.fetchSourceRepositoryForAllocation(
      prototypeId,
      jwt,
    );

    const creds: PublicAllocateRequest = {
      s3_credentials: {
        accessKeyId: out.Credentials.AccessKeyId!,
        secretAccessKey: out.Credentials.SecretAccessKey!,
        sessionToken: out.Credentials.SessionToken!,
        expiration: out.Credentials.Expiration!.toISOString(),
      },
      user_details: {
        prototypeId,
        userId: userId || 'unknown',
      },
      cloudflare_credentials: {
        cloudflare_tunnel_token: tunnelConfig.token || '',
        cloudflare_tunnel_hostname: tunnelConfig.hostname ?? undefined,
      },
      keys: {
        orchestration_token: orchestrationToken,
        aak: process.env.ANTHROPIC_API_KEY,
      },
      source_repository: sourceRepository ?? undefined,
    };

    // Send creds to worker
    try {
      const allocationResponse = await axios.post<
        SandboxAPIResponse<
          PublicAllocateSuccessResponse,
          BuildWorkerStandardErrorResponse
        >
      >(`http://${info.privateIp}:3002/allocate`, creds, {
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
      });
      if (allocationResponse.data.error) {
        this.log2.error(
          new Error(allocationResponse.data.error.error),
          `Worker returned error status for allocation to ${info.privateIp}`,
          {
            workerIp: info.privateIp,
            prototypeId,
            errorMessage: allocationResponse.data.error.message,
          },
        );
        throw new Error(
          `Worker allocation failed: ${
            allocationResponse.data.error.message || 'Unknown error from worker'
          }`,
        );
      }
    } catch (error) {
      // clean up the tunnel if it was created, task will be cleaned up as the error propagates up the stack
      if (tunnelConfig.tunnel_id) {
        try {
          await deleteCloudflareTunnel(
            tunnelConfig.tunnel_id,
            this.log2,
            tunnelConfig.hostname || undefined,
            this.supabaseServiceRoleClient,
          );
        } catch (error) {
          this.log2.error(
            error,
            'Failed to delete Cloudflare tunnel after allocation failure',
          );
        }
      }
      // Handle both axios errors and our thrown errors
      if (axios.isAxiosError(error)) {
        this.log2.error(
          error,
          'Axios request failed when allocating to worker',
          {
            workerIp: info.privateIp,
            prototypeId,
            statusCode: error.response?.status,
            responseData: error.response?.data,
            errorMessage: error.message,
          },
        );
        throw new Error(
          `Failed to connect to worker at ${info.privateIp}: ${error.message}`,
        );
      }
      // Re-throw if it's already our custom error
      throw error;
    }

    return {
      terminalTunnelId: tunnelConfig.tunnel_id || '',
      terminalTunnelHostname: tunnelHostnameWithProtocol,
      orchestrationToken: orchestrationToken,
    };
  }

  /**
   * Refresh all idle containers by terminating existing ones and launching new ones.
   * Note: New container launches are initiated but not awaited.
   * @returns Object containing count of terminated containers, initiated launches, and any errors
   */
  public async refreshAllIdleContainers(): Promise<{
    terminated: number;
    launched: number; // Number of launches initiated (not necessarily completed)
    errors: string[];
  }> {
    const errors: string[] = [];
    let terminatedCount = 0;
    let launchedCount = 0;

    try {
      // Get all idle container task ARNs from the list
      const idleCount = await this.cache.llen(CACHE_KEYS.idleBuildsListKey);

      if (idleCount === 0) {
        this.log2.consoleLogDevOnly('info', 'No idle containers to refresh');
        return { terminated: 0, launched: 0, errors: [] };
      }

      this.log2.consoleLogDevOnly(
        'info',
        `Refreshing ${idleCount} idle containers`,
      );

      // Collect all task ARNs from the idle list
      const taskArns: string[] = [];
      for (let i = 0; i < idleCount; i++) {
        const taskArn = await this.cache.lpop(CACHE_KEYS.idleBuildsListKey);
        if (taskArn) {
          taskArns.push(taskArn as string);
        }
      }

      // Terminate all idle containers
      for (const taskArn of taskArns) {
        const idleKey = CACHE_KEYS.idleBuild(taskArn);
        try {
          await this.terminateFargateTask(taskArn);
          await this.cache.del([idleKey]);
          terminatedCount++;
          this.log2.consoleLogDevOnly(
            'info',
            `Terminated idle container ${taskArn}`,
          );
        } catch (error) {
          const errorMsg = `Failed to terminate idle container ${taskArn}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          this.log2.error(error, errorMsg);
          errors.push(errorMsg);
        }
      }

      // Launch new idle containers to replace the terminated ones (without waiting)
      this.log2.consoleLogDevOnly(
        'info',
        `Launching ${terminatedCount} new idle containers`,
      );

      for (let i = 0; i < terminatedCount; i++) {
        this.launchIdleContainer().catch((error) => {
          this.log2.error(
            error,
            `Failed to launch replacement idle container: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        });
      }

      launchedCount = terminatedCount; // Initiated (not necessarily completed)

      this.log2.consoleLogDevOnly(
        'info',
        `Idle container refresh complete: terminated ${terminatedCount}, initiated launch of ${launchedCount}`,
        { errors: errors.length > 0 ? errors : undefined },
      );

      return {
        terminated: terminatedCount,
        launched: launchedCount,
        errors,
      };
    } catch (error) {
      const errorMsg = `Failed to refresh idle containers: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
      this.log2.error(error, errorMsg);
      errors.push(errorMsg);
      return {
        terminated: terminatedCount,
        launched: launchedCount,
        errors,
      };
    }
  }

  public async fetchSourceRepositoryForAllocation(
    prototypeId: string,
    jwt: string,
  ): Promise<AllocationSourceRepository | null> {
    this.log2.consoleLogDevOnly(
      'info',
      'fetchSourceRepositoryForAllocation started',
      { prototypeId },
    );

    const supabaseRlsClient = createClient<Database>(
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
    try {
      const { data: sensitiveMetadata, error: metadataError } =
        await supabaseRlsClient
          .from('prototype_sensitive_metadata')
          .select('source_repo_id')
          .eq('prototype_id', prototypeId)
          .maybeSingle();

      this.log2.consoleLogDevOnly(
        'info',
        'Fetched prototype_sensitive_metadata',
        {
          prototypeId,
          hasData: !!sensitiveMetadata,
          sourceRepoId: sensitiveMetadata?.source_repo_id,
          hasError: !!metadataError,
        },
      );

      if (metadataError) {
        this.log2.error(
          metadataError,
          'Failed to fetch prototype sensitive metadata for source repository lookup',
          { prototypeId },
        );
        return null;
      }

      if (!sensitiveMetadata?.source_repo_id) {
        this.log2.consoleLogDevOnly(
          'info',
          'No source_repo_id found in sensitive metadata, returning null',
          { prototypeId },
        );
        return null;
      }

      const sourceRepoId = sensitiveMetadata.source_repo_id;

      this.log2.consoleLogDevOnly(
        'info',
        'Source repo ID found, fetching prototype team',
        { prototypeId, sourceRepoId },
      );

      const { data: prototypeRecord, error: prototypeError } =
        await supabaseRlsClient
          .from('prototypes')
          .select('team_id')
          .eq('id', prototypeId)
          .maybeSingle();

      this.log2.consoleLogDevOnly('info', 'Fetched prototype team_id', {
        prototypeId,
        hasData: !!prototypeRecord,
        teamId: prototypeRecord?.team_id,
        hasError: !!prototypeError,
      });

      if (prototypeError) {
        this.log2.error(
          prototypeError,
          'Failed to fetch prototype team for source repository lookup',
          { prototypeId },
        );
        return null;
      }

      if (!prototypeRecord?.team_id) {
        this.log2.warn(
          'Prototype missing team_id, cannot fetch GitHub repository metadata',
          { prototypeId, sourceRepoId },
        );
        return null;
      }

      const teamId = prototypeRecord.team_id;

      this.log2.consoleLogDevOnly(
        'info',
        'Fetching GitHub integration for team',
        { prototypeId, teamId, sourceRepoId },
      );

      const { data: integration, error: integrationError } =
        await supabaseRlsClient
          .from('github_integrations')
          .select('account_type, installation_id')
          .eq('team_id', teamId)
          .maybeSingle();

      this.log2.consoleLogDevOnly('info', 'Fetched GitHub integration', {
        prototypeId,
        teamId,
        hasData: !!integration,
        accountType: integration?.account_type,
        installationId: integration?.installation_id,
        hasError: !!integrationError,
      });

      if (integrationError) {
        this.log2.error(
          integrationError,
          'Failed to fetch GitHub integration for source repository lookup',
          { prototypeId, teamId },
        );
        return null;
      }

      if (!integration) {
        this.log2.warn(
          'No GitHub integration configured for team, skipping repository metadata fetch',
          { prototypeId, teamId, sourceRepoId },
        );
        return null;
      }

      let githubAccessToken: string | null = null;

      this.log2.consoleLogDevOnly('info', 'Acquiring GitHub access token', {
        prototypeId,
        accountType: integration.account_type,
        installationId: integration.installation_id,
      });

      if (integration.account_type === 'Organization') {
        try {
          const installationToken = await createInstallationToken(
            integration.installation_id,
            this.log2,
          );
          githubAccessToken = installationToken.token;
          this.log2.consoleLogDevOnly(
            'info',
            'Successfully created installation token',
            { prototypeId, teamId },
          );
        } catch (installationTokenError) {
          this.log2.error(
            installationTokenError instanceof Error
              ? installationTokenError
              : new Error(String(installationTokenError)),
            'Failed to create installation token for source repository metadata fetch',
            {
              prototypeId,
              teamId,
              sourceRepoId,
              installationId: integration.installation_id,
            },
          );
          return null;
        }
      } else if (integration.account_type === 'User') {
        try {
          const tokenResult = await getValidGitHubUserAccessToken({
            supabaseClient: this.supabaseServiceRoleClient,
            teamId,
            logger: this.log2,
          });
          githubAccessToken = tokenResult.accessToken;
          this.log2.consoleLogDevOnly(
            'info',
            'Acquired valid GitHub OAuth token for user integration',
            {
              prototypeId,
              teamId,
              refreshed: tokenResult.refreshed,
            },
          );
        } catch (tokenError) {
          this.log2.error(
            tokenError instanceof Error
              ? tokenError
              : new Error(String(tokenError)),
            'Failed to acquire valid GitHub OAuth token for repository metadata fetch',
            { prototypeId, teamId, sourceRepoId },
          );
          return null;
        }
      } else {
        this.log2.warn(
          'Unsupported GitHub integration account type for repository metadata fetch',
          {
            prototypeId,
            teamId,
            sourceRepoId,
            accountType: integration.account_type,
          },
        );
        return null;
      }

      if (!githubAccessToken) {
        this.log2.warn(
          'Unable to acquire GitHub access token, skipping repository metadata fetch',
          { prototypeId, teamId, sourceRepoId },
        );
        return null;
      }

      this.log2.consoleLogDevOnly(
        'info',
        'Fetching repository metadata from GitHub',
        { prototypeId, sourceRepoId },
      );

      try {
        const repoInfo = await fetchRepositoryById(
          sourceRepoId,
          githubAccessToken,
          this.log2,
        );

        this.log2.consoleLogDevOnly(
          'info',
          'Successfully fetched repository metadata from GitHub',
          {
            prototypeId,
            repositoryFullName: repoInfo.full_name,
            githubRepoId: repoInfo.id,
          },
        );

        this.log2.info('Source repository configured for worker allocation', {
          prototypeId,
          repositoryFullName: repoInfo.full_name,
          githubRepoId: repoInfo.id,
        });

        const result = {
          github_repo_id: repoInfo.id,
          installation_id: integration.installation_id,
          repository_url: repoInfo.html_url,
          repository_owner: repoInfo.owner?.login ?? '',
          repository_name: repoInfo.name,
          default_branch: repoInfo.default_branch,
          full_name: repoInfo.full_name,
        };

        this.log2.consoleLogDevOnly(
          'info',
          'Returning source repository data for allocation',
          { prototypeId, result },
        );

        return result;
      } catch (repoFetchError) {
        this.log2.error(
          repoFetchError instanceof Error
            ? repoFetchError
            : new Error(String(repoFetchError)),
          'Failed to fetch GitHub repository metadata for allocation',
          { prototypeId, teamId, sourceRepoId },
        );
        return null;
      }
    } catch (error) {
      this.log2.error(
        error instanceof Error ? error : new Error(String(error)),
        'Unexpected error while fetching source repository data',
        { prototypeId },
      );
      return null;
    }
  }
}
