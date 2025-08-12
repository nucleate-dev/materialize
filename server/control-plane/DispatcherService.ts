import { EC2Client } from "@aws-sdk/client-ec2";
import { createClient } from "@supabase/supabase-js";
import { GlideClient } from "@valkey/valkey-glide";
import axios from "axios";
import * as dotenv from "dotenv";
import FormData from "form-data";
import type { Database } from "./types/supabase";
import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
  waitUntilTasksRunning, // optional helper waiter
} from "@aws-sdk/client-ecs";

// type StartTaskOpts = {
//   region: string; // e.g. "us-east-2"
//   cluster: string; // ECS cluster name or ARN
//   taskDefinition: string; // Task def family:revision or full ARN
//   subnets: string[]; // VPC private subnets recommended
//   securityGroups: string[]; // SG that allows egress; inbound usually not needed
//   assignPublicIp?: "ENABLED" | "DISABLED"; // default DISABLED
//   containerName?: string; // name from your task def to override env/command
//   command?: string[]; // optional: override container command
//   env?: Record<string, string>; // optional: per-run env vars
//   cpu?: string; // optional: override task-level CPU (e.g., "1024")
//   memory?: string; // optional: override task-level Memory (e.g., "2048")
//   tags?: Record<string, string>;
//   enableExec?: boolean; // optional: enable ECS Exec into the task
// };

dotenv.config();

export class DispatcherService {
  private ec2Client: EC2Client;
  private ecsClient: ECSClient;
  private cache: GlideClient;
  // private allocateSha: string | null = null;

  constructor(cache: GlideClient, ec2Client: EC2Client, ecsClient: ECSClient) {
    this.cache = cache;
    this.ec2Client = ec2Client;
    this.ecsClient = ecsClient;
  }

  private async launchFargateInstance(
    prototypeId: string
  ): Promise<{ taskArn: string; privateIp: string }> {
    try {
      const runTaskInput = {
        cluster: process.env.ECS_CLUSTER_NAME!,
        taskDefinition: "fastify-build-worker",
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
              name: "fastify-server",
              environment: [
                {
                  name: "PROTOTYPE_ID",
                  value: prototypeId,
                },
                {
                  name: "AWS_REGION",
                  value: process.env.AWS_REGION!,
                },
              ],
            },
          ],
        },
        tags: [
          {
            key: "PrototypeId",
            value: prototypeId,
          },
          {
            key: "Service",
            value: "materialize-build-worker",
          },
        ],
      };

      const command = new RunTaskCommand(runTaskInput);
      const response = await this.ecsClient.send(command);

      if (response.tasks && response.tasks.length > 0) {
        const taskArn = response.tasks[0].taskArn!;
        console.log(
          `Successfully launched Fargate task: ${taskArn} for prototype: ${prototypeId}`
        );

        // Wait for task to be running and get private IP
        await waitUntilTasksRunning(
          { client: this.ecsClient, maxWaitTime: 300 }, // 5 min
          {
            cluster: process.env.ECS_CLUSTER_NAME!,
            tasks: [taskArn],
          }
        );

        // Describe the task to get the private IP
        const describeCommand = new DescribeTasksCommand({
          cluster: process.env.ECS_CLUSTER_NAME!,
          tasks: [taskArn],
        });
        const describeResponse = await this.ecsClient.send(describeCommand);

        const task = describeResponse.tasks?.[0];
        const eni = task?.attachments?.[0]?.details?.find(
          (detail) => detail.name === "networkInterfaceId"
        )?.value;
        let privateIp = "";

        if (eni) {
          // Get private IP from ENI details in task
          const privateIpDetail = task?.attachments?.[0]?.details?.find(
            (detail) => detail.name === "privateIPv4Address"
          );
          privateIp = privateIpDetail?.value || "";
        }

        return { taskArn, privateIp };
      } else {
        throw new Error("No task was created");
      }
    } catch (error) {
      console.error("Failed to launch Fargate task:", error);
      throw new Error(
        `Failed to launch Fargate instance: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Precheck prototype status
  public async prototypeDispatchPrecheck(
    jwt: string,
    prototypeId: string
  ): Promise<{
    state: "dne" | "active_dev_server" | "active_build";
    status: "updating" | "error" | "stable" | "creating" | null;
    viewing_url: string;
  }> {
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
        }
      );

      // 2. Verify JWT and get user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(jwt);
      if (authError || !user) {
        throw new Error("Invalid JWT or user not authenticated");
      }

      // 3. Attempt to fetch prototype from database to verify permissions
      const { data: prototype, error: prototypeError } = await supabase
        .from("prototypes")
        .select("*")
        .eq("id", prototypeId)
        .single();

      if (prototypeError || !prototype) {
        throw new Error(
          "Prototype not found or user does not have permissions"
        );
      }

      // 4. Check active build in cache
      const activeBuildKey = `active_build:${prototypeId}`;
      const existingBuildJson = await this.cache.get(activeBuildKey);

      if (existingBuildJson) {
        const existingBuild: ActiveBuild = JSON.parse(
          existingBuildJson as string
        );

        // Determine state based on port
        const state = existingBuild.status ? "active_dev_server" : "dne";

        return {
          state,
          status: existingBuild.status,
          viewing_url: existingBuild.url || this.getS3Url(prototypeId),
        };
      } else {
        // No active build, return S3 URL
        return {
          state: "dne",
          status: null,
          viewing_url: this.getS3Url(prototypeId),
        };
      }
    } catch (error) {
      throw error;
    }
  }

  private getS3Url(prototypeId: string): string {
    // Construct S3/CloudFront URL for the prototype
    return `${prototypeId}.render.materializeui.com/`;
  }

  public async processDispatchRequest({
    prototypeId,
    zipBuffer,
  }: DispatchRequest): Promise<any> {
    try {
      // Check if build already exists
      const activeBuildKey = `active_build:${prototypeId}`;
      const existingBuildJson = await this.cache.get(activeBuildKey);

      let updatedBuildCacheData: ActiveBuild;
      if (!existingBuildJson) {
        const newBuildCacheData: ActiveBuild = {
          fargate_task_arn: "",
          fargate_private_ip: "",
          url: this.getS3Url(prototypeId),
          status: "creating",
          last_touched: Math.floor(Date.now() / 1000),
        };
        await this.cache.set(activeBuildKey, JSON.stringify(newBuildCacheData));
        const newFargateInstance = await this.launchFargateInstance(
          prototypeId
        );

        updatedBuildCacheData = {
          ...newBuildCacheData,
          status: "updating",
          fargate_task_arn: newFargateInstance.taskArn,
          fargate_private_ip: newFargateInstance.privateIp,
        };
      } else {
        const existingBuild: ActiveBuild = JSON.parse(
          existingBuildJson as string
        );
        updatedBuildCacheData = {
          ...existingBuild,
          status: "updating",
          fargate_task_arn: existingBuild.fargate_task_arn,
          fargate_private_ip: existingBuild.fargate_private_ip,
        };
      }

      await this.cache.set(
        activeBuildKey,
        JSON.stringify(updatedBuildCacheData)
      );

      // TODO: Dispatch request to fargate instance (this.dispatchFormedRequestToFargateInstance())
      const formData = this.constructFormData(prototypeId, zipBuffer);
      try {
        const fargateResponse =
          await this.dispatchFormedRequestToFargateInstance(
            updatedBuildCacheData.fargate_private_ip,
            formData
          );
        console.log("Fargate responded");
        updatedBuildCacheData.status = "stable";
        updatedBuildCacheData.url = fargateResponse.tunnelUrl;
        updatedBuildCacheData.last_touched = Math.floor(Date.now() / 1000);
        await this.cache.set(
          activeBuildKey,
          JSON.stringify(updatedBuildCacheData)
        );
        console.log(updatedBuildCacheData);
        return fargateResponse;
      } catch (error) {
        console.log(
          "There was an error dispatching the request to the fargate instance"
        );
        updatedBuildCacheData.status = "error";
        await this.cache.set(
          activeBuildKey,
          JSON.stringify(updatedBuildCacheData)
        );
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  private async dispatchFormedRequestToFargateInstance(
    fargatePrivateIp: string,
    formData: FormData
  ) {
    // TODO:
    console.log("Dispatching request to fargate instance");
    return {
      fargatePrivateIp,
      formData,
      tunnelUrl: "https://tunnel.url",
    };
    // try {
    //   const response = await axios.post(
    //     `http://${fargatePrivateIp}:3002/dev-server`,
    //     formData,
    //     {
    //       timeout: 300000,
    //       headers: {
    //         ...formData.getHeaders(),
    //       },
    //     }
    //   );
    //   return response.data;
    // } catch (error) {
    //   console.log(
    //     "There was an error dispatching the request to the fargate instance"
    //   );
    // }
  }

  private constructFormData(
    prototypeId: string,
    zipBuffer: Buffer,
    port?: number
  ) {
    const formData = new FormData();
    formData.append("prototypeId", prototypeId);
    formData.append("files", zipBuffer, {
      filename: "project.zip",
      contentType: "application/zip",
    });
    if (port) {
      formData.append("port", port.toString());
    }
    return formData;
  }

  public async launchFargateInstancePublic(
    prototypeId: string
  ): Promise<{ taskArn: string; privateIp: string }> {
    return await this.launchFargateInstance(prototypeId);
  }
}

// const ALLOCATE_LUA = `
// local usedKey = KEYS[1]
// local startP = tonumber(ARGV[1]) or 4000
// local endP   = tonumber(ARGV[2]) or 4099
// local range  = endP - startP + 1
// if range <= 0 then return nil end
// local hint = tonumber(ARGV[3] or "")
// local offset = 0
// if hint and hint >= startP and hint <= endP then
//   offset = hint - startP
// end
// for i = 0, range - 1 do
//   local p = startP + ((offset + i) % range)
//   if redis.call('SADD', usedKey, tostring(p)) == 1 then
//     return tostring(p)
//   end
// end
// return nil
// `;

interface ActiveBuild {
  fargate_task_arn: string;
  fargate_private_ip: string;
  url: string;
  status: "creating" | "updating" | "error" | "stable";
  last_touched: number;
}

interface DispatchRequest {
  prototypeId: string;
  zipBuffer: Buffer;
  hotReload: boolean;
}
