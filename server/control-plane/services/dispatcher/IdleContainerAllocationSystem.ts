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
  BUILD_TIMEOUTS,
  FargateInstanceInfo,
} from '../../types/InternalTypes.js';

const MAX_IDLE_FARGATE_BUILDS: number = 1;
export class IdleContainerAllocationSystem {
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
      route: 'IdleContainerAllocationSystem',
    });
  }

  /** Initialize idle pool and start maintenance loop */
  public async init(): Promise<void> {
    await this.ensureIdleCapacity();
    this.maintenanceTimer = setInterval(
      () =>
        this.ensureIdleCapacity().catch((e) =>
          this.log2.error(e, 'Idle maintenance failed'),
        ),
      5 * 60 * 1000, // every 5 minutes
    );
  }

  /** Dispatcher calls this to get a ready container for a prototype */
  //   public async allocateFargateDevServer(
  //     prototypeId: string,
  //   ): Promise<FargateInstanceInfo> {
  //     const taskArn = await this.cache.lpop('idle_builds:list');
  //     if (!taskArn) {
  //       this.log2.info('[IdleAlloc] No idle build available, launching fresh');
  //       return this.launchAndWait(prototypeId);
  //     }

  //     const idleKey = `idle_build:${taskArn}`;
  //     const build = await this.cache.hgetall(idleKey);

  //     let info: FargateInstanceInfo;
  //     if (build.status === 'ready') {
  //       info = { taskArn: build.taskArn, privateIp: build.privateIp };
  //       await this.cache.del(idleKey);
  //       this.ensureIdleCapacity().catch((e) => this.log2.error(e));
  //     } else if (build.status === 'creating') {
  //       info = await this.waitForTaskReady(taskArn);
  //       await this.cache.del(idleKey);
  //       this.ensureIdleCapacity().catch((e) => this.log2.error(e));
  //     } else {
  //       throw new Error(`Idle build had unknown status: ${build.status}`);
  //     }

  //     // Assign real prototypeId to this container
  //     await this.assignPrototypeToTask(info, prototypeId);

  //     return info;
  //   }

  /** Internal: ensure we always have maxIdle in the pool */
  private async ensureIdleCapacity(): Promise<void> {
    const currentIdle = await this.cache.llen('idle_builds:list');
    const toCreate = MAX_IDLE_FARGATE_BUILDS - currentIdle;
    if (toCreate === 0) return;
    else if (toCreate < 0) {
      // TODO cleanup idle builds till we have only MAX_IDLE_FARGATE_BUILDS idle builds
      return;
    } else {
      this.log2.info(
        `[IdleAlloc] Creating ${toCreate} idle builds to reach max ${MAX_IDLE_FARGATE_BUILDS}`,
      );

      await Promise.all(
        Array.from({ length: toCreate }, () => this.launchIdleContainer()),
      );
    }
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
      await this.cache.hset(idleKey, {
        fargate_task_arn: taskArn,
        fargate_private_ip: privateIp,
        status: 'ready',
      });
      this.log2.info('Idle container launched and marked ready', {
        taskArn,
        privateIp,
      });
    } catch (error) {
      this.log2.error(
        error,
        'Failed to update idle container state to ready in cache, deleting and cleaning up fargate task',
      );
      await this.terminateFargateTask(taskArn);
      await this.cache.del([idleKey]);
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
  ): Promise<string | null> {
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
    if (!eni) return null;
    const privateIpDetail = task?.attachments?.[0]?.details?.find(
      (detail) => detail.name === 'privateIPv4Address',
    );
    return privateIpDetail?.value || '';
  }

  private getFargateRunTaskCommandConfiguration(): RunTaskCommandInput {
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
                value: 'idle',
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
          value: 'idle',
        },
        {
          key: 'Service',
          value: 'materialize-build-worker',
        },
      ],
    };
  }

  /** Tell running idle container to switch to a real prototypeId */
  private async assignPrototypeToTask(
    info: FargateInstanceInfo,
    prototypeId: string,
  ): Promise<void> {
    try {
      const url = `http://${info.privateIp}:4000/assign-prototype`; // adjust if needed
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prototypeId }),
      });
      if (!res.ok) throw new Error(`Assign failed: ${res.status}`);
      this.log2.info('[IdleAlloc] Assigned prototype to idle task', {
        taskArn: info.taskArn,
        prototypeId,
      });
    } catch (err) {
      this.log2.error(
        err,
        '[IdleAlloc] Failed to assign prototype to idle task',
      );
      throw err;
    }
  }
}
