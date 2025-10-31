import {
  DescribeTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  waitUntilTasksRunning,
} from '@aws-sdk/client-ecs';
import type { ECSClient, RunTaskCommandInput } from '@aws-sdk/client-ecs';
import type { SystemLogger } from '../../loggers/SystemLogger.js'; // adjust your path
import { GlideClient } from '@valkey/valkey-glide';
import {
  ActiveBuild,
  BUILD_TIMEOUTS,
  CACHE_KEYS,
  FargateInstanceInfo,
  IdleBuild,
  IdleContainerStatus,
} from '../../types/InternalTypes.js';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import axios from 'axios';
import {
  PublicAllocateRequest,
  PublicAllocateResponse,
} from '../../types/BuildWorkerTypes.js';
import { updateBuildTunnelInfo } from '../../utils/cacheInteractionUtils.js';
import { createCloudflareTunnelForContainer } from '../../utils/cloudflareTunnelManagementUtils.js';

const MAX_IDLE_FARGATE_BUILDS: number = 0;

export class IdleContainerAllocationSystemService {
  private readonly cache: GlideClient;
  private readonly ecsClient: ECSClient;
  private readonly log2: SystemLogger;
  private readonly stsClient: STSClient;
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
      this.log2.info(
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
    userId?: string,
  ): Promise<FargateInstanceInfo> {
    // If we are in development mode, we need to use the development container.
    // There will never be any idle development containers. Just directly allocate a new container.
    if (process.env.NODE_ENV === 'development') {
      return await this.launchFargateInstanceForDispatcherDirectly(
        prototypeId,
        this.log2,
        activeBuildKey,
        newBuildCacheData,
        userId,
      );
    }

    // 1. Try to pop an idle container from the pool
    const taskArn = (await this.cache.rpop(CACHE_KEYS.idleBuildsListKey)) as  // NOTE: this is an atomic operation
      | string
      | null;

    // 2. No idle containers found. Fallback to direct launch and replenish in background
    if (!taskArn) {
      this.log2.info(
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
        userId,
      );
    }

    // 5. Assign idle container to prototype
    let privateIp: string = '';
    if (taskData.status === 'creating') {
      // Status = "creating" → wait until container is ready, then assign prototype
      this.log2.info(
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
        userId,
      );
    }
    this.log2.info('[ContainerAlloc] Allocating idle container to prototype', {
      prototypeId,
      taskArn,
      privateIp,
    });
    const info: FargateInstanceInfo = {
      taskArn,
      privateIp,
      terminalTunnelId: '',
      terminalTunnelHostname: '',
    };
    try {
      const tunnelInfo =
        await this.scopeS3PermissionsAndTerminalTunnelsForContainer(
          info,
          activeBuildKey,
          prototypeId,
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
        this.log2.info(
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
      this.log2.info('Idle container launched and marked ready', {
        taskArn,
        privateIp,
      });
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
      this.log2.info('Terminated Fargate task', { taskArn });
    } catch (error) {
      this.log2.error(error, 'Failed to terminate Fargate task');
    }
  }

  public async launchFargateInstanceForDispatcherDirectly(
    prototypeId: string,
    log2: SystemLogger,
    activeBuildKey: string,
    newBuildCacheData: ActiveBuild,
    userId?: string,
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
      };
      try {
        const tunnelInfo =
          await this.scopeS3PermissionsAndTerminalTunnelsForContainer(
            info,
            activeBuildKey,
            prototypeId,
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
                value: process.env.AWS_REGION!,
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
    userId?: string,
  ): Promise<
    Pick<FargateInstanceInfo, 'terminalTunnelId' | 'terminalTunnelHostname'>
  > {
    const [out, tunnelConfig] = await Promise.all([
      this.stsClient.send(
        new AssumeRoleCommand({
          RoleArn: process.env.S3_PROTOTYPE_ACCESS_ROLE_ARN!,
          RoleSessionName: `proto-${prototypeId}`,
          Tags: [{ Key: 'PrototypeId', Value: prototypeId }],
          DurationSeconds: 3600 * 12, // 12 hours, refresh as needed
        }),
      ),
      createCloudflareTunnelForContainer(prototypeId, info.taskArn, this.log2),
    ]);

    if (!out.Credentials) throw new Error('Failed to assume role');

    // Store tunnel info in cache with https:// prefix
    this.log2.consoleLogDevOnly(
      'debug',
      'updating cache with cloudflare tunnel final Tunnel config',
      {
        tunnelId: tunnelConfig.tunnelId,
        hostname: tunnelConfig.hostname,
        cnameTarget: tunnelConfig.cnameTarget,
      },
    );
    const tunnelHostnameWithProtocol = `https://${tunnelConfig.hostname}`;
    await updateBuildTunnelInfo(
      this.cache,
      activeBuildKey,
      tunnelConfig.tunnelId,
      tunnelHostnameWithProtocol,
    );

    const creds: PublicAllocateRequest = {
      accessKeyId: out.Credentials.AccessKeyId!,
      secretAccessKey: out.Credentials.SecretAccessKey!,
      sessionToken: out.Credentials.SessionToken!,
      prototypeId,
      userId: userId || 'unknown',
      cloudflare_tunnel_token: tunnelConfig.token,
    };

    // Send creds to worker
    try {
      const allocationResponse: PublicAllocateResponse = await axios.post(
        `http://${info.privateIp}:3002/allocate`,
        creds,
        {
          headers: {
            'content-type': 'application/json',
          },
        },
      );
      if (allocationResponse.status === 'error') {
        this.log2.error(
          new Error(allocationResponse.error),
          `Failed to allocate to worker ${info.privateIp}`,
        );
        throw new Error(
          allocationResponse.error || 'Failed to allocate to worker',
        );
      }
    } catch (error) {
      this.log2.error(error, 'Failed to make allocation request to worker');
      throw error;
    }
    return {
      terminalTunnelId: tunnelConfig.tunnelId,
      terminalTunnelHostname: tunnelHostnameWithProtocol,
    };
  }
}
