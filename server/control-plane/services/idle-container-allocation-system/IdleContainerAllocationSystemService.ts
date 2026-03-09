import type { ECSClient, RunTaskCommandInput } from "@aws-sdk/client-ecs";
import {
  DescribeTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  waitUntilTasksRunning,
} from "@aws-sdk/client-ecs";
import {
  AssumeRoleCommand,
  STSClient,
} from "@aws-sdk/client-sts";
import axios from "axios";
import { randomBytes } from "crypto";
import type { SystemLogger } from "../../loggers/SystemLogger.js";
import {
  PublicAllocateRequest,
  PublicAllocateSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse as BuildWorkerStandardErrorResponse,
} from "../../types/BuildWorkerTypes.js";
import {
  ActiveBuild,
  BUILD_TIMEOUTS,
  FargateInstanceInfo,
  IdleBuild,
} from "../../types/InternalTypes.js";
import {
  getIdleContainerCount,
  popOldestIdleContainer,
  popNewestIdleContainer,
  insertIdleContainer,
  updateIdleContainerReady,
  deleteIdleContainer,
  idleContainerExists,
  updateBuildFields,
  updateBuildTunnelInfo,
  getInfraConfig,
} from "../../utils/cacheInteractionUtils.js";
// CLOUDFLARE TUNNEL DISABLED - import kept for potential re-enablement
// import { deleteCloudflareTunnel } from "../../utils/cloudflareTunnelManagementUtils.js";
import { getSubscriptionInfo } from "../../utils/subscriptionChecks.js";
// CLOUDFLARE TUNNEL DISABLED - import kept for potential re-enablement
// import { IdleCloudflareTunnelSystem } from "./IdleCloudflareTunnelSystem.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../types/supabase.js";

export class IdleContainerAllocationSystemService {
  private readonly ecsClient: ECSClient;
  private readonly log2: SystemLogger;
  private readonly stsClient: STSClient;
  // CLOUDFLARE TUNNEL DISABLED - field kept for potential re-enablement
  // private readonly cloudflareTunnelSystem: IdleCloudflareTunnelSystem;
  private readonly supabaseServiceRoleClient: SupabaseClient<Database>;
  private maintenanceTimer?: NodeJS.Timeout;

  constructor(opts: {
    ecsClient: ECSClient;
    stsClient: STSClient;
    log2: SystemLogger;
  }) {
    this.ecsClient = opts.ecsClient;
    this.stsClient = opts.stsClient;
    this.log2 = opts.log2.child({
      route: "IdleContainerAllocationSystemService",
    });
    // CLOUDFLARE TUNNEL DISABLED - kept for potential re-enablement
    // this.cloudflareTunnelSystem = new IdleCloudflareTunnelSystem({
    //   log2: this.log2,
    // });
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
          this.log2.error(e, "Idle maintenance failed")
        ),
      5 * 60 * 1000, // every 5 minutes
    );
    await this.ensureIdleCapacity();
  }

  public shutdown(): void {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
  }

  /** Fetch max idle container count from infra_config (defaults to 0) */
  private async getMaxIdleBuilds(): Promise<number> {
    const val = await getInfraConfig('max_idle_fargate_builds', '0');
    return Math.max(0, parseInt(val, 10) || 0);
  }

  private async ensureIdleCapacity(): Promise<void> {
    if (process.env.NODE_ENV === "development") return; // no idle containers in development mode
    const maxIdleBuilds = await this.getMaxIdleBuilds();
    const currentIdle = await getIdleContainerCount();
    const toCreate = maxIdleBuilds - currentIdle;
    if (toCreate === 0) return;
    else if (toCreate > 0) {
      this.log2.consoleLogDevOnly(
        "info",
        `Refreshing idle container capacity: Creating ${toCreate} idle builds to reach max ${maxIdleBuilds}`,
      );
      await Promise.all(
        Array.from({ length: toCreate }, () => this.launchIdleContainer()),
      );
    } else {
      // Too many idle builds, clean them up
      const toRemove = Math.abs(toCreate);
      this.log2.warn(
        `[IdleAlloc] Found ${currentIdle} idle builds, cleaning up ${toRemove} to reach max ${maxIdleBuilds}`,
      );

      // Collect tasks to remove
      const idleBuilds: IdleBuild[] = [];
      for (let i = 0; i < toRemove; i++) {
        const idleBuild = await popNewestIdleContainer(); // clean newer tasks that may not be ready first
        if (idleBuild) {
          idleBuilds.push(idleBuild);
        }
      }

      // Run cleanup concurrently
      await Promise.all(
        idleBuilds.map(async (idleBuild) => {
          try {
            await this.terminateFargateTask(idleBuild.fargate_task_arn);
          } catch (error) {
            this.log2.error(
              error,
              `[IdleAlloc] Failed to terminate extra idle task ${idleBuild.fargate_task_arn}`,
            );
          }
        }),
      );

      return;
    }
  }

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
    if (process.env.NODE_ENV === "development") {
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
    const taskData = await popOldestIdleContainer(); // NOTE: this is an atomic operation

    // 2. No idle containers found. Fallback to direct launch and replenish in background
    if (!taskData) {
      this.log2.consoleLogDevOnly(
        "info",
        "[ContainerAlloc] No idle containers found, falling back to direct launch",
        { prototypeId },
      );
      const maxIdleBuilds = await this.getMaxIdleBuilds();
      if (maxIdleBuilds > 0) {
        // background replenish
        this.launchIdleContainer().catch((err) =>
          this.log2.error(
            err,
            "[ContainerAlloc] Failed to replenish idle container",
          )
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

    // 3. We got an idle container with full data (pop already deleted the row)
    const taskArn = taskData.fargate_task_arn;
    // Replenish idle pool in background
    this.launchIdleContainer().catch((err) =>
      this.log2.error(err, "[IdleAlloc] Failed to replenish idle container")
    );

    // 4. If the idle container is not usable, clean it up in the background and fallback to direct launch
    if (!taskArn) {
      this.log2.warn(
        `[ContainerAlloc] Idle container missing metadata, falling back to direct launch`,
      );
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
    let privateIp: string = "";
    if (taskData.status === "creating") {
      // Status = "creating" → wait until container is ready, then assign prototype
      this.log2.consoleLogDevOnly(
        "info",
        `[ContainerAlloc] Waiting for idle container ${taskArn} to finish creating`,
      );
      privateIp = await this.waitForFargateTaskToBeReadyAndGetIP(
        taskArn,
      );
    } else if (taskData.status === "ready") {
      privateIp = taskData.fargate_private_ip;
    }

    if (!privateIp) {
      // clean up unusable container and fallback to direct launch
      this.log2.error(
        new Error("failed to get private IP for idle container"),
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
      "info",
      "[ContainerAlloc] Allocating idle container to prototype",
      {
        prototypeId,
        taskArn,
        privateIp,
      },
    );
    const info: FargateInstanceInfo = {
      taskArn,
      privateIp,
      terminalTunnelId: "",
      terminalTunnelHostname: "",
      orchestrationToken: "",
    };
    try {
      const tunnelInfo = await this
        .scopeS3PermissionsAndTerminalTunnelsForContainer(
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
        "Failed to scope S3 permissions for container and initialize S3client",
      );
      this.terminateFargateTask(taskArn);
      throw new Error(
        "Could not allocate a container: failed to scope S3 permissions for container",
      );
    }
  }

  /** Launch one idle build (with PROTOTYPE_ID=idle) */
  private async launchIdleContainer(): Promise<void> {
    if (process.env.NODE_ENV === "development") return; // no idle containers in development mode

    let taskArn: string;
    try {
      taskArn = await this.launchFargateInstanceNotReady(this.log2);
    } catch (error) {
      this.log2.error(error, "Failed to launch idle container");
      return;
    }

    // Immediately add placeholder entry in cache
    try {
      await insertIdleContainer(taskArn);
    } catch (error) {
      this.log2.error(
        error,
        "Failed to set initial idle container state in cache",
      );
      // If we can't write to cache, terminate the task to avoid leaks
      await this.terminateFargateTask(taskArn);
      return;
    }

    // Wait for container to become ready
    const privateIp = await this.waitForFargateTaskToBeReadyAndGetIP(
      taskArn,
    );
    if (!privateIp) {
      this.log2.error("Failed to get private IP for idle container");
      await this.terminateFargateTask(taskArn);
      await deleteIdleContainer(taskArn);
      return;
    }
    // Update entry to ready
    try {
      const exists = await idleContainerExists(taskArn);
      if (!exists) {
        this.log2.consoleLogDevOnly(
          "info",
          "Idle container Fargate Task is ready, but idle container is already popped from the cache for use",
          { taskArn },
        );
        return;
      }
      await updateIdleContainerReady(taskArn, privateIp);
      this.log2.consoleLogDevOnly(
        "info",
        "Idle container launched and marked ready",
        {
          taskArn,
          privateIp,
        },
      );
      return;
    } catch (error) {
      this.log2.error(
        error,
        "Failed to update idle container state to ready in cache, deleting and cleaning up fargate task",
      );
      await this.terminateFargateTask(taskArn);
      await deleteIdleContainer(taskArn);
      return;
    }
  }

  /** Helper to terminate a Fargate task */
  private async terminateFargateTask(taskArn: string): Promise<void> {
    try {
      const command = new StopTaskCommand({
        cluster: process.env.ECS_CLUSTER_NAME!,
        task: taskArn,
        reason: "Idle container cleanup",
      });
      await this.ecsClient.send(command);
      this.log2.consoleLogDevOnly("info", "Terminated Fargate task", {
        taskArn,
      });
    } catch (error) {
      this.log2.error(error, "Failed to terminate Fargate task");
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
    const buildId = activeBuildKey.replace('active_build:', '');
    try {
      const taskArn = await this.launchFargateInstanceNotReady(log2);
      await updateBuildFields(buildId, {
        fargate_task_arn: taskArn,
        fargate_private_ip: newBuildCacheData.fargate_private_ip,
        url: newBuildCacheData.url,
        status: newBuildCacheData.status,
        last_touched: newBuildCacheData.last_touched,
      });
      const privateIp = await this.waitForFargateTaskToBeReadyAndGetIP(
        taskArn,
      );
      if (!privateIp) {
        throw new Error("Failed to get private IP for idle container");
      }
      const info: FargateInstanceInfo = {
        taskArn,
        privateIp,
        terminalTunnelId: "",
        terminalTunnelHostname: "",
        orchestrationToken: "",
      };
      try {
        const tunnelInfo = await this
          .scopeS3PermissionsAndTerminalTunnelsForContainer(
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
          "Failed to scope S3 permissions for container and initialize S3client",
        );
        this.terminateFargateTask(taskArn);
        throw new Error(
          "Could not allocate a container: failed to scope S3 permissions for container",
        );
      }
    } catch (error) {
      log2.error(error, "Failed to launch Fargate task:");
      throw new Error(
        `Failed to launch Fargate instance: ${error instanceof Error ? error.message : "Unknown error"
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
          new Error("No task was created"),
          "Failed to launch Fargate task:",
          { response },
        );
        throw new Error("No task was created");
      }
      // save taskArn to the cache immediately to prevent case where server/request fails before cache is updated
      // this edge case could result in an eternally running fargate task
      return response.tasks[0].taskArn!;
    } catch (error) {
      log2.error(error, "Failed to launch Fargate task:");
      throw new Error(
        `Failed to launch Fargate instance: ${error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  // Return the Fargate public IP (stored in fargate_private_ip field for backwards compat)
  private async waitForFargateTaskToBeReadyAndGetIP(
    taskArn: string,
  ): Promise<string> {
    // Wait for task to be running and get public IP
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
      (detail) => detail.name === "networkInterfaceId",
    )?.value;
    if (!eni) return "";
    // CLOUDFLARE TUNNEL DISABLED - was privateIPv4Address, now using publicIPv4Address
    // const privateIpDetail = task?.attachments?.[0]?.details?.find(
    //   (detail) => detail.name === "privateIPv4Address",
    // );
    const publicIpDetail = task?.attachments?.[0]?.details?.find(
      (detail) => detail.name === "publicIPv4Address",
    );
    return publicIpDetail?.value || "";
  }

  private getFargateRunTaskCommandConfiguration(): RunTaskCommandInput {
    return {
      cluster: process.env.ECS_CLUSTER_NAME!,
      taskDefinition: process.env.NODE_ENV === "production"
        ? "fastify-build-worker"
        : "materialize-development-containers",
      launchType: "FARGATE" as const,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: process.env.ECS_SUBNETS?.split(",") || [],
          securityGroups: process.env.ECS_SECURITY_GROUPS?.split(",") || [],
          assignPublicIp: "ENABLED" as const,
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: process.env.NODE_ENV === "production"
              ? "materialize-fargate-build-worker-container"
              : "materialize-build-worker-container-development",
            environment: [
              {
                name: "AWS_REGION",
                value: "us-east-2",
              },
              {
                name: "PORT",
                value: "3002",
              },
              {
                name: "NODE_ENV",
                value: process.env.NODE_ENV!,
              },
              {
                name: "NUCLEATE_SERVER_ENDPOINT",
                value: "https://api.nucleate.dev",
              },
              {
                name: "S3_BUCKET",
                value: "materialize-sites",
              },
              {
                name: "SUPABASE_URL",
                value: process.env.SUPABASE_URL!,
              },
              {
                name: "SUPABASE_ANON_KEY",
                value: process.env.SUPABASE_ANON_KEY!,
              },
              {
                name: "ANTHROPIC_API_KEY",
                value: process.env.ANTHROPIC_API_KEY!,
              },
              {
                name: "CLAUDE_CODE_OAUTH_TOKEN",
                value: process.env.CLAUDE_CODE_OAUTH_TOKEN!,
              },
              {
                name: "POSTHOG_KEY",
                value: process.env.POSTHOG_KEY!,
              },
              {
                name: "POSTHOG_HOST",
                value: process.env.POSTHOG_HOST!,
              },
              {
                name: "GOOGLE_GENERATIVE_AI_API_KEY",
                value: process.env.GOOGLE_AI_API_KEY!,
              },
            ],
          },
        ],
      },
      tags: [
        {
          key: "Service",
          value: "materialize-build-worker",
        },
      ],
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
      "terminalTunnelId" | "terminalTunnelHostname" | "orchestrationToken"
    >
  > {
    const buildId = activeBuildKey.replace('active_build:', '');

    // Assume AWS STS role for S3 access
    let out;
    try {
      out = await this.stsClient.send(
        new AssumeRoleCommand({
          RoleArn: process.env.S3_PROTOTYPE_ACCESS_ROLE_ARN!,
          RoleSessionName: `proto-${prototypeId}`,
          Tags: [{ Key: "PrototypeId", Value: prototypeId }],
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
        `Failed to assume AWS STS role: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!out.Credentials) {
      const error = new Error(
        "STS AssumeRole succeeded but returned no credentials",
      );
      this.log2.error(error, "Missing credentials from STS response", {
        prototypeId,
        roleArn: process.env.S3_PROTOTYPE_ACCESS_ROLE_ARN,
      });
      throw error;
    }

    // CLOUDFLARE TUNNEL DISABLED - using public IP directly instead of Cloudflare tunnels
    // let tunnelConfig;
    // try {
    //   tunnelConfig = await this.cloudflareTunnelSystem
    //     .retrieveIdleTunnelForAllocation(
    //       prototypeId,
    //     );
    // } catch (error) {
    //   this.log2.error(
    //     error,
    //     `Failed to retrieve Cloudflare tunnel for prototype ${prototypeId}`,
    //     {
    //       prototypeId,
    //     },
    //   );
    //   throw new Error(
    //     `Failed to retrieve Cloudflare tunnel: ${error instanceof Error ? error.message : String(error)
    //     }`,
    //   );
    // }
    // this.log2.consoleLogDevOnly(
    //   "debug",
    //   "updating cache with cloudflare tunnel final Tunnel config",
    //   {
    //     tunnelId: tunnelConfig.tunnel_id,
    //     hostname: tunnelConfig.hostname,
    //     cnameTarget: tunnelConfig.cname_target,
    //   },
    // );
    // const tunnelHostnameWithProtocol = `wss://${tunnelConfig.hostname}`;

    // Use public IP directly for terminal hostname (like FARGATE_DEV_MODE)
    const terminalHostname = `http://${info.privateIp}:3002`;

    // Generate orchestration token for authenticating container orchestration requests
    const orchestrationToken = randomBytes(32).toString("hex");

    try {
      await updateBuildTunnelInfo(
        buildId,
        "", // no CF tunnel ID
        terminalHostname,
        orchestrationToken,
      );
    } catch (error) {
      this.log2.error(error, "Failed to update build tunnel info in cache", {
        activeBuildKey,
        terminalHostname,
      });
      throw new Error(
        `Failed to update tunnel info in cache: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Determine user plan to decide which platform credential to pass
    let platformCredential = process.env.ANTHROPIC_API_KEY;
    try {
      const { data: prototypeRow } = await this.supabaseServiceRoleClient
        .from("prototypes")
        .select("team_id")
        .eq("id", prototypeId)
        .single();
      if (prototypeRow?.team_id) {
        const subscriptionInfo = await getSubscriptionInfo(
          jwt,
          userId,
          this.log2,
          prototypeRow.team_id,
        );
        if (subscriptionInfo.userPlan === "free") {
          platformCredential = process.env.CLAUDE_CODE_OAUTH_TOKEN;
        }
      }
    } catch (error) {
      this.log2.error(
        error,
        "Failed to determine user plan for credential selection, falling back to API key",
        { prototypeId, userId },
      );
    }

    const creds: PublicAllocateRequest = {
      s3_credentials: {
        accessKeyId: out.Credentials.AccessKeyId!,
        secretAccessKey: out.Credentials.SecretAccessKey!,
        sessionToken: out.Credentials.SessionToken!,
        expiration: out.Credentials.Expiration!.toISOString(),
      },
      user_details: {
        prototypeId,
        userId: userId || "unknown",
      },
      cloudflare_credentials: {
        // CLOUDFLARE TUNNEL DISABLED - was:
        // cloudflare_tunnel_token: tunnelConfig.token || "",
        // cloudflare_tunnel_hostname: tunnelConfig.hostname ?? undefined,
        cloudflare_tunnel_token: "",
        cloudflare_tunnel_hostname: `http://${info.privateIp}`,
      },
      keys: {
        orchestration_token: orchestrationToken,
        aak: platformCredential,
      },
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
          "content-type": "application/json",
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
          `Worker allocation failed: ${allocationResponse.data.error.message || "Unknown error from worker"
          }`,
        );
      }
    } catch (error) {
      // CLOUDFLARE TUNNEL DISABLED - tunnel cleanup commented out
      // if (tunnelConfig.tunnel_id) {
      //   try {
      //     await deleteCloudflareTunnel(
      //       tunnelConfig.tunnel_id,
      //       this.log2,
      //       tunnelConfig.hostname || undefined,
      //       this.supabaseServiceRoleClient,
      //     );
      //   } catch (error) {
      //     this.log2.error(
      //       error,
      //       "Failed to delete Cloudflare tunnel after allocation failure",
      //     );
      //   }
      // }
      // Handle both axios errors and our thrown errors
      if (axios.isAxiosError(error)) {
        this.log2.error(
          error,
          "Axios request failed when allocating to worker",
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
      // CLOUDFLARE TUNNEL DISABLED - was:
      // terminalTunnelId: tunnelConfig.tunnel_id || "",
      // terminalTunnelHostname: tunnelHostnameWithProtocol,
      terminalTunnelId: "",
      terminalTunnelHostname: terminalHostname,
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
      const idleCount = await getIdleContainerCount();

      if (idleCount === 0) {
        this.log2.consoleLogDevOnly("info", "No idle containers to refresh");
        return { terminated: 0, launched: 0, errors: [] };
      }

      this.log2.consoleLogDevOnly(
        "info",
        `Refreshing ${idleCount} idle containers`,
      );

      // Collect all idle containers by popping them
      const idleBuilds: IdleBuild[] = [];
      for (let i = 0; i < idleCount; i++) {
        const idleBuild = await popNewestIdleContainer();
        if (idleBuild) {
          idleBuilds.push(idleBuild);
        }
      }

      // Terminate all idle containers
      for (const idleBuild of idleBuilds) {
        try {
          await this.terminateFargateTask(idleBuild.fargate_task_arn);
          terminatedCount++;
          this.log2.consoleLogDevOnly(
            "info",
            `Terminated idle container ${idleBuild.fargate_task_arn}`,
          );
        } catch (error) {
          const errorMsg = `Failed to terminate idle container ${idleBuild.fargate_task_arn}: ${error instanceof Error ? error.message : "Unknown error"
            }`;
          this.log2.error(error, errorMsg);
          errors.push(errorMsg);
        }
      }

      // Launch new idle containers to replace the terminated ones (without waiting)
      this.log2.consoleLogDevOnly(
        "info",
        `Launching ${terminatedCount} new idle containers`,
      );

      for (let i = 0; i < terminatedCount; i++) {
        this.launchIdleContainer().catch((error) => {
          this.log2.error(
            error,
            `Failed to launch replacement idle container: ${error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        });
      }

      launchedCount = terminatedCount; // Initiated (not necessarily completed)

      this.log2.consoleLogDevOnly(
        "info",
        `Idle container refresh complete: terminated ${terminatedCount}, initiated launch of ${launchedCount}`,
        { errors: errors.length > 0 ? errors : undefined },
      );

      return {
        terminated: terminatedCount,
        launched: launchedCount,
        errors,
      };
    } catch (error) {
      const errorMsg = `Failed to refresh idle containers: ${error instanceof Error ? error.message : "Unknown error"
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
}
