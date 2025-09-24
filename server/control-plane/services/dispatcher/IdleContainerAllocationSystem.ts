import {
  DescribeTasksCommand,
  waitUntilTasksRunning,
} from '@aws-sdk/client-ecs';
import type { ECSClient } from '@aws-sdk/client-ecs';
import type { SystemLogger } from '../../loggers/SystemLogger.js'; // adjust your path
import { GlideClient } from '@valkey/valkey-glide';
import { FargateInstanceInfo } from '../../types/InternalTypes.js';

export class IdleContainerAllocationSystem {
  private readonly redis: GlideClient;
  private readonly ecsClient: ECSClient;
  private readonly log: SystemLogger;
  private readonly maxIdle: number;
  private maintenanceTimer?: NodeJS.Timeout;

  constructor(opts: {
    redis: GlideClient;
    ecsClient: ECSClient;
    log: SystemLogger;
    maxIdle: number;
  }) {
    this.redis = opts.redis;
    this.ecsClient = opts.ecsClient;
    this.log = opts.log;
    this.maxIdle = opts.maxIdle;
  }

  /** Initialize idle pool and start maintenance loop */
  public async init() {
    await this.ensureIdleCapacity();
    this.maintenanceTimer = setInterval(
      () =>
        this.ensureIdleCapacity().catch((e) =>
          this.log.error(e, 'Idle maintenance failed'),
        ),
      5 * 60 * 1000, // every 5 minutes
    );
  }

  /** Dispatcher calls this to get a ready container for a prototype */
  public async allocateFargateDevServer(
    prototypeId: string,
  ): Promise<FargateInstanceInfo> {
    const taskArn = await this.redis.lpop('idle_builds:list');
    if (!taskArn) {
      this.log.info('[IdleAlloc] No idle build available, launching fresh');
      return this.launchAndWait(prototypeId);
    }

    const idleKey = `idle_build:${taskArn}`;
    const build = await this.redis.hgetall(idleKey);

    let info: FargateInstanceInfo;
    if (build.status === 'ready') {
      info = { taskArn: build.taskArn, privateIp: build.privateIp };
      await this.redis.del(idleKey);
      this.ensureIdleCapacity().catch((e) => this.log.error(e));
    } else if (build.status === 'creating') {
      info = await this.waitForTaskReady(taskArn);
      await this.redis.del(idleKey);
      this.ensureIdleCapacity().catch((e) => this.log.error(e));
    } else {
      throw new Error(`Idle build had unknown status: ${build.status}`);
    }

    // Assign real prototypeId to this container
    await this.assignPrototypeToTask(info, prototypeId);

    return info;
  }

  /** Internal: ensure we always have maxIdle in the pool */
  private async ensureIdleCapacity() {
    const currentIdle = await this.redis.llen('idle_builds:list');
    const toCreate = this.maxIdle - currentIdle;
    if (toCreate <= 0) return;

    this.log.info(
      `[IdleAlloc] Creating ${toCreate} idle builds to reach max ${this.maxIdle}`,
    );

    await Promise.all(
      Array.from({ length: toCreate }, () => this.launchIdleBuild()),
    );
  }

  /** Launch one idle build (with PROTOTYPE_ID=idle) */
  private async launchIdleBuild() {
    const activeBuildKey = `idle_build:temp:${Date.now()}`;
    const newBuildCacheData = { status: 'creating', prototype_id: 'idle' };

    const info = await this.launchFargateInstance(
      'idle',
      this.log,
      activeBuildKey,
      newBuildCacheData,
    );

    // Save to idle cache
    const idleKey = `idle_build:${info.taskArn}`;
    await this.redis.hset(idleKey, {
      taskArn: info.taskArn,
      status: 'ready',
      privateIp: info.privateIp,
      prototypeId: 'idle',
      createdAt: new Date().toISOString(),
    });
    await this.redis.rpush('idle_builds:list', info.taskArn);

    this.log.info('[IdleAlloc] Idle build launched', info);
  }

  /** Wait until ECS says task is RUNNING, then cache as ready */
  private async waitForTaskReady(
    taskArn: string,
  ): Promise<FargateInstanceInfo> {
    await waitUntilTasksRunning(
      { client: this.ecsClient, maxWaitTime: 60 },
      { cluster: process.env.ECS_CLUSTER_NAME!, tasks: [taskArn] },
    );

    const desc = await this.ecsClient.send(
      new DescribeTasksCommand({
        cluster: process.env.ECS_CLUSTER_NAME!,
        tasks: [taskArn],
      }),
    );

    const eni = desc.tasks?.[0]?.attachments?.[0]?.details?.find(
      (d) => d.name === 'privateIPv4Address',
    );
    const privateIp = eni?.value || '';
    const info = { taskArn, privateIp };

    await this.redis.hset(`idle_build:${taskArn}`, {
      status: 'ready',
      privateIp,
    });

    return info;
  }

  /** Fallback: launch a fresh task directly for a prototype */
  private async launchAndWait(
    prototypeId: string,
  ): Promise<FargateInstanceInfo> {
    const newBuildCacheData = { status: 'creating' };
    return this.launchFargateInstance(
      prototypeId,
      this.log,
      `dispatcher:${prototypeId}:${Date.now()}`,
      newBuildCacheData,
    );
  }

  /** Dispatcher-provided implementation (injected globally for now) */
  private async launchFargateInstance(
    prototypeId: string,
    log2: SystemLogger,
    activeBuildKey: string,
    newBuildCacheData: any,
  ): Promise<FargateInstanceInfo> {
    return (globalThis as any).launchFargateInstance(
      prototypeId,
      log2,
      activeBuildKey,
      newBuildCacheData,
    );
  }

  /** Tell running idle container to switch to a real prototypeId */
  private async assignPrototypeToTask(
    info: FargateInstanceInfo,
    prototypeId: string,
  ) {
    try {
      const url = `http://${info.privateIp}:4000/assign-prototype`; // adjust if needed
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prototypeId }),
      });
      if (!res.ok) throw new Error(`Assign failed: ${res.status}`);
      this.log.info('[IdleAlloc] Assigned prototype to idle task', {
        taskArn: info.taskArn,
        prototypeId,
      });
    } catch (err) {
      this.log.error(
        err,
        '[IdleAlloc] Failed to assign prototype to idle task',
      );
      throw err;
    }
  }
}
