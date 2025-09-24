import {
  DescribeTasksCommand,
  RunTaskCommand,
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
    if (toCreate <= 0) return;

    this.log2.info(
      `[IdleAlloc] Creating ${toCreate} idle builds to reach max ${MAX_IDLE_FARGATE_BUILDS}`,
    );

    await Promise.all(
      Array.from({ length: toCreate }, () => this.launchIdleContainer()),
    );
  }

  /** Launch one idle build (with PROTOTYPE_ID=idle) */
  private async launchIdleContainer(): Promise<void> {}

  /** Wait until ECS says task is RUNNING, then cache as ready */
  private async waitForTaskReadyAndStoreIdleBuildInCache(
    taskArn: string,
  ): Promise<FargateInstanceInfo> {
    const privateIp = await this.waitForFargateTaskToBeReadyAndGetPrivateIP(
      taskArn,
    );
    if (!privateIp) {
      // TODO
      return {
        taskArn,
        privateIp: 'DNE',
      };
    }
    await this.cache.hset(`idle_build:${taskArn}`, {
      taskArn,
      status: 'ready',
      privateIp,
    });
    return {
      taskArn,
      privateIp: 'DNE',
    };
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
