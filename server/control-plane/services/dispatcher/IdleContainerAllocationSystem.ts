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
  FargateInstanceInfo,
  IdleBuild,
  IdleContainerStatus,
} from '../../types/InternalTypes.js';

const MAX_IDLE_FARGATE_BUILDS: number = 1;

export class IdleContainerAllocationSystemService {
  private readonly cache: GlideClient;
  private readonly ecsClient: ECSClient;
  private readonly log2: SystemLogger;
  private maintenanceTimer?: NodeJS.Timeout;

  constructor(opts: {
    redis: GlideClient;
    ecsClient: ECSClient;
    log2: SystemLogger;
  }) {
    this.cache = opts.redis;
    this.ecsClient = opts.ecsClient;
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
    const currentIdle = await this.cache.llen('idle_builds:list');
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
        const taskArn = await this.cache.rpop('idle_builds:list');
        if (taskArn) {
          taskArns.push(taskArn as string);
        }
      }

      // Run cleanup concurrently
      await Promise.all(
        taskArns.map(async (taskArn) => {
          const idleKey = `idle_builds:${taskArn}`;
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
  ): Promise<FargateInstanceInfo> {
    // 1. Try to pop an idle container from the pool
    const taskArn = (await this.cache.lpop('idle_builds:list')) as  // NOTE: this is an atomic operation
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
      );
      return info;
    }

    // 3. We got an idle container reference. Retrieve data from cache and remove from cache
    const idleKey = `idle_builds:${taskArn}`;
    const taskData = await this.hgetallAsIdleBuild(idleKey);
    await this.cache.del([idleKey]);

    // 4. If the idle container is not usable, clean it up in the background and fallback to direct launch
    if (!taskData || !taskData.fargate_private_ip) {
      this.log2.warn(
        `[ContainerAlloc] Idle container ${taskArn} missing metadata, falling back to direct launch`,
      );
      this.terminateFargateTask(taskArn); // in background do not await
      return await this.launchFargateInstanceForDispatcherDirectly(
        prototypeId,
        this.log2,
        activeBuildKey,
        newBuildCacheData,
      );
    }

    // 5. Assign idle container to prototype
    let privateIp: string = '';
    if (taskData.status === 'creating') {
      // Status = "creating" → wait until container is ready, then assign prototype
      this.log2.info(
        `[ContainerAlloc] Waiting for idle container ${taskArn} to finish creating`,
      );
      privateIp = await this.waitForFargateTaskToBeReadyAndGetPrivateIP(
        taskArn,
      );
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
      );
    }
    this.log2.info('[ContainerAlloc] Allocating idle container to prototype', {
      prototypeId,
      taskArn,
      privateIp,
    });
    const info = { taskArn, privateIp };
    await this.assignPrototypeToTask(info, prototypeId);
    // Replenish idle pool in background
    this.launchIdleContainer().catch((err) =>
      this.log2.error(err, '[IdleAlloc] Failed to replenish idle container'),
    );
    return info;
  }

  /** Launch one idle build (with PROTOTYPE_ID=idle) */
  private async launchIdleContainer(): Promise<void> {
    let taskArn: string;
    try {
      taskArn = await this.launchFargateInstanceNotReady(this.log2);
    } catch (error) {
      this.log2.error(error, 'Failed to launch idle container');
      return;
    }

    // Immediately add placeholder entry in cache
    const idleKey = `idle_builds:${taskArn}`;
    try {
      await this.cache.hset(idleKey, {
        fargate_task_arn: taskArn,
        fargate_private_ip: '',
        status: 'creating',
      });
      await this.cache.lpush('idle_builds:list', [taskArn]);
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
    const privateIp = await this.waitForFargateTaskToBeReadyAndGetPrivateIP(
      taskArn,
    );
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
  ): Promise<FargateInstanceInfo> {
    try {
      const taskArn = await this.launchFargateInstanceNotReady(
        log2,
        prototypeId,
      );
      await this.cache.set(
        activeBuildKey,
        JSON.stringify({
          ...newBuildCacheData,
          fargate_task_arn: taskArn,
        }),
      );
      const privateIp = await this.waitForFargateTaskToBeReadyAndGetPrivateIP(
        taskArn,
      );
      if (!privateIp) {
        throw new Error('Failed to get private IP for idle container');
      }
      return { taskArn, privateIp };
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
    prototypeId: string | null = null,
  ): Promise<string> {
    try {
      const command = new RunTaskCommand(
        this.getFargateRunTaskCommandConfiguration(prototypeId),
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

  private getFargateRunTaskCommandConfiguration(
    prototypeId: string | null = null,
  ): RunTaskCommandInput {
    return {
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
                value: prototypeId || 'idle',
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
          value: prototypeId || 'idle',
        },
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
  private async assignPrototypeToTask(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    info: FargateInstanceInfo,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    prototypeId: string,
  ): Promise<void> {
    // try {
    //   const url = `http://${info.privateIp}:4000/assign-prototype`; // adjust if needed
    //   const res = await fetch(url, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ prototypeId }),
    //   });
    //   if (!res.ok) throw new Error(`Assign failed: ${res.status}`);
    //   this.log2.info('[IdleAlloc] Assigned prototype to idle task', {
    //     taskArn: info.taskArn,
    //     prototypeId,
    //   });
    // } catch (err) {
    //   this.log2.error(
    //     err,
    //     '[IdleAlloc] Failed to assign prototype to idle task',
    //   );
    //   throw err;
    // }
  }
}
