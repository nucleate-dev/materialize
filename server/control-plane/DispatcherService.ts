import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
} from "@aws-sdk/client-auto-scaling";
import { DescribeInstancesCommand, EC2Client } from "@aws-sdk/client-ec2";
import { createClient } from "@supabase/supabase-js";
import { GlideClient } from "@valkey/valkey-glide";
import axios from "axios";
import * as dotenv from "dotenv";
import FormData from "form-data";
import type { Database } from "./types/supabase";

dotenv.config();

export class DispatcherService {
  private autoScalingClient: AutoScalingClient;
  private ec2Client: EC2Client;
  private cache: GlideClient;
  private allocateSha: string | null = null;

  constructor(
    cache: GlideClient,
    ec2Client: EC2Client,
    autoScalingClient: AutoScalingClient
  ) {
    this.cache = cache;
    this.ec2Client = ec2Client;
    this.autoScalingClient = autoScalingClient;
  }

  // Precheck prototype status
  public async prototypeDispatchPrecheck(
    jwt: string,
    prototypeId: string
  ): Promise<{
    state: "dne" | "active_dev_server" | "active_build";
    status: "updating" | "error" | "stable" | null;
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
        const state =
          existingBuild.port === null || existingBuild.port === ""
            ? "active_build"
            : "active_dev_server";

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

  // Process build request with zipped files
  public async processDispatchRequest({
    prototypeId,
    zipBuffer,
    hotReload = false,
  }: DispatchRequest): Promise<any> {
    try {
      // Check if build already exists
      const activeBuildKey = `active_build:${prototypeId}`;
      const existingBuildJson = await this.cache.get(activeBuildKey);

      let workerIp: string;
      let formData: FormData;
      let existingBuild: ActiveBuild;
      if (existingBuildJson) {
        const preDispatchResult = await this.handlePreDispatchForExistingBuild(
          activeBuildKey,
          existingBuildJson as string,
          { prototypeId, zipBuffer, hotReload }
        );
        workerIp = preDispatchResult.workerIp;
        formData = preDispatchResult.formData;
        existingBuild = preDispatchResult.existingBuild;
      } else {
        const preDispatchResult = await this.handlePreDispatchForNewBuild(
          activeBuildKey,
          { prototypeId, zipBuffer, hotReload }
        );
        workerIp = preDispatchResult.workerIp;
        formData = preDispatchResult.formData;
        existingBuild = preDispatchResult.existingBuild;
      }

      let buildResponse: BuildResponse | null = null;
      let url: string;
      if (hotReload) {
        try {
          buildResponse = await this.sendWorkerLiveDevServerRequest(
            workerIp,
            formData
          );
        } catch (error) {
          await this.cache.set(
            activeBuildKey,
            JSON.stringify({ ...existingBuild, status: "error" })
          );
          throw error;
        }
        url = buildResponse.tunnelUrl;
      } else {
        try {
          buildResponse = await this.sendWorkerBuildRequest(workerIp, formData);
        } catch (error) {
          await this.cache.set(
            activeBuildKey,
            JSON.stringify({ ...existingBuild, status: "error" })
          );
          throw error;
        }
        url = buildResponse.buildUrl;
      }

      // Create new build entry in cache
      const updatedBuild: ActiveBuild = {
        ...existingBuild,
        url,
        status: "stable",
        last_touched: Math.floor(Date.now() / 1000),
      };
      await this.cache.set(activeBuildKey, JSON.stringify(updatedBuild));
      console.log("New build: ", updatedBuild);
      return buildResponse;
    } catch (error) {
      throw error;
    }
  }

  private async handlePreDispatchForNewBuild(
    activeBuildKey: string,
    dispatchRequest: DispatchRequest
  ): Promise<{
    workerIp: string;
    formData: FormData;
    existingBuild: ActiveBuild;
  }> {
    console.log("No existing build found, creating a new build:");
    const { prototypeId, zipBuffer, hotReload } = dispatchRequest;

    // Get least loaded worker instance to assign to new build
    const instances = await this.getActiveWorkerInstances();
    const workerIp = instances[0].PrivateIpAddress;
    console.log("Instance to push to: ", workerIp);

    // Acquire a free port if hot reload is requested
    let allocatedPort: number | undefined;
    if (hotReload) {
      const port = await this.acquireFreePort(workerIp);
      if (port === null) {
        throw new Error(
          `No available ports on worker ${workerIp} for hot reload`
        );
      }
      allocatedPort = port;
      console.log(`Allocated port ${allocatedPort} for hot reload`);
    }

    // Create new build entry in cache PRIOR to sending request to build worker, in case build worker request fails
    // and because status needs to be updated to "updating"
    const newBuild: ActiveBuild = {
      worker_host: instances[0].InstanceId,
      worker_private_ip: workerIp,
      port: allocatedPort || "",
      url: "",
      status: "updating",
      last_touched: Math.floor(Date.now() / 1000),
    };
    await this.cache.set(activeBuildKey, JSON.stringify(newBuild));

    // construct request to send to the build worker
    const formData = this.constructFormData(
      prototypeId,
      zipBuffer,
      allocatedPort
    );

    return {
      workerIp,
      formData,
      existingBuild: newBuild,
    };
  }

  private async handlePreDispatchForExistingBuild(
    activeBuildKey: string,
    existingBuildJson: string,
    dispatchRequest: DispatchRequest
  ): Promise<{
    workerIp: string;
    formData: FormData;
    existingBuild: ActiveBuild;
  }> {
    const { prototypeId, zipBuffer, hotReload } = dispatchRequest;
    let existingBuild: ActiveBuild = JSON.parse(existingBuildJson);
    console.log("Found existing build: ", existingBuild);

    if (existingBuild.status === "updating") {
      throw new Error(
        "Cannot update existing build while it is currently updating"
      );
    }

    if (hotReload && existingBuild.port === "") {
      console.log("Existing build being transitioned to hot reload");
      let allocatedPort: number | undefined;
      const port = await this.acquireFreePort(existingBuild.worker_private_ip);
      if (port === null) {
        throw new Error(
          `No available ports on worker ${existingBuild.worker_private_ip} for hot reload`
        );
      }
      allocatedPort = port;
      existingBuild = {
        ...existingBuild,
        port: allocatedPort,
      };
    }

    existingBuild.status = "updating";
    await this.cache.set(activeBuildKey, JSON.stringify(existingBuild));

    const formData = this.constructFormData(
      prototypeId,
      zipBuffer,
      existingBuild.port ? Number(existingBuild.port) : undefined
    );

    return {
      workerIp: existingBuild.worker_private_ip,
      formData,
      existingBuild,
    };
  }

  // Get active EC2 instances from Auto Scaling Group
  private async getActiveWorkerInstances() {
    try {
      // Get Auto Scaling Group information
      const asgCommand = new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [process.env.AUTO_SCALING_GROUP_NAME!],
      });

      const asgResponse = await this.autoScalingClient.send(asgCommand);
      const asg = asgResponse.AutoScalingGroups?.[0];
      if (!asg || !asg.Instances || asg.Instances.length === 0) {
        throw new Error("No instances found in Auto Scaling Group");
      }

      // Get instance IDs that are InService
      const activeInstanceIds = asg.Instances.filter(
        (instance) => instance.LifecycleState === "InService"
      )
        .map((instance) => instance.InstanceId!)
        .filter(Boolean);

      if (activeInstanceIds.length === 0) {
        throw new Error("No active instances found in Auto Scaling Group");
      }

      // Get detailed instance information
      const ec2Command = new DescribeInstancesCommand({
        InstanceIds: activeInstanceIds,
      });
      const ec2Response = await this.ec2Client.send(ec2Command);

      const instances: any[] = [];
      ec2Response.Reservations?.forEach((reservation) => {
        reservation.Instances?.forEach((instance) => {
          if (instance.State?.Name === "running" && instance.PrivateIpAddress) {
            instances.push({
              InstanceId: instance.InstanceId,
              PrivateIpAddress: instance.PrivateIpAddress,
              PublicIpAddress: instance.PublicIpAddress,
              State: instance.State.Name,
            });
          }
        });
      });

      return instances;
    } catch (error) {
      console.error("Error fetching active worker instances:", error);
      throw new Error(`Failed to fetch worker instances: ${error.message}`);
    }
  }

  // Acquire a free port for hot reload
  private async acquireFreePort(
    workerIp: string,
    opts?: { start?: number; end?: number; hint?: number }
  ): Promise<number | null> {
    if (!this.allocateSha) {
      console.log("Loading allocate SHA");
      this.allocateSha = String(
        await this.cache.customCommand(["SCRIPT", "LOAD", ALLOCATE_LUA])
      );
    }
    const key = `ports:${workerIp}:used`;
    const start = String(
      opts?.start ?? parseInt(process.env.MIN_PORT!) ?? 4000
    );
    const end = String(opts?.end ?? parseInt(process.env.MAX_PORT!) ?? 4099);
    const hint = opts?.hint != null ? String(opts.hint) : "";

    const res = await this.cache.customCommand([
      "EVALSHA",
      this.allocateSha,
      "1",
      key,
      start,
      end,
      hint,
    ]);
    console.log("port result: ", res);
    return res ? Number(res) : null;
  }

  // Release a port
  private async releasePort(workerIp: string, port: number): Promise<void> {
    await this.cache.srem(`ports:${workerIp}:used`, [String(port)]);
  }

  // Send build request to worker
  private async sendWorkerBuildRequest(
    workerIp: string,
    formData: FormData
  ): Promise<any> {
    try {
      const response = await axios.post(
        `http://${workerIp}:3002/build-and-deploy`,
        formData,
        {
          timeout: 300000,
          headers: {
            ...formData.getHeaders(),
          },
        }
      );
      return response.data;
    } catch (error) {
      console.log("Error sending worker build request: ", error);
      // TODO -- update build status to "error"
      throw error;
    }
  }

  // Send live dev server request to worker
  private async sendWorkerLiveDevServerRequest(
    workerIp: string,
    formData: FormData
  ): Promise<any> {
    try {
      const response = await axios.post(
        `http://${workerIp}:3002/dev-server`,
        formData,
        {
          timeout: 300000,
          headers: {
            ...formData.getHeaders(),
          },
        }
      );
      return response.data;
    } catch (error) {
      console.log("Error sending worker live dev server request: ", error);
      // TODO -- update build status to "error"
      throw error;
    }
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

  // TODO: Get least loaded worker instance
  // private async getLeastLoadedWorker() {
  //   try {
  //     const instances = await this.getActiveWorkerInstances();

  //     if (instances.length === 0) {
  //       throw new Error("No active worker instances available");
  //     }

  //     // Get load information for each instance from Cache
  //     const instanceLoads: {
  //       instance: any;
  //       activeBuilds: number;
  //       availablePorts: number;
  //     }[] = [];

  //     for (const instance of instances) {
  //       const ip = instance.PrivateIpAddress;

  //       // Count active builds for this instance
  //       const activeBuildsKey = `active_builds:${ip}`;
  //       const activeBuilds = await this.cache.scard(activeBuildsKey);

  //       // Count available ports for this instance
  //       const portRegistryKey = `port_registry:${ip}`;
  //       const totalPorts =
  //         parseInt(process.env.MAX_PORT!) - parseInt(process.env.MIN_PORT!);
  //       const usedPorts = await this.cache.scard(portRegistryKey);
  //       const availablePorts = totalPorts - usedPorts;

  //       instanceLoads.push({
  //         instance,
  //         activeBuilds,
  //         availablePorts,
  //       });
  //     }

  //     // Sort by load priority:
  //     // 1. Prioritize instances with available ports (for hot reload capability)
  //     // 2. Then by lowest number of active builds
  //     instanceLoads.sort((a, b) => {
  //       // First, prioritize instances with available ports
  //       if (a.availablePorts > 0 && b.availablePorts === 0) return -1;
  //       if (a.availablePorts === 0 && b.availablePorts > 0) return 1;

  //       // Then sort by number of active builds (least loaded first)
  //       return a.activeBuilds - b.activeBuilds;
  //     });

  //     return instanceLoads[0].instance;
  //   } catch (error) {
  //     console.error("Error getting least loaded worker:", error);
  //     throw error;
  //   }
  // }
}

const ALLOCATE_LUA = `
local usedKey = KEYS[1]
local startP = tonumber(ARGV[1]) or 4000
local endP   = tonumber(ARGV[2]) or 4099
local range  = endP - startP + 1
if range <= 0 then return nil end
local hint = tonumber(ARGV[3] or "")
local offset = 0
if hint and hint >= startP and hint <= endP then
  offset = hint - startP
end
for i = 0, range - 1 do
  local p = startP + ((offset + i) % range)
  if redis.call('SADD', usedKey, tostring(p)) == 1 then
    return tostring(p)
  end
end
return nil
`;

interface ActiveBuild {
  worker_host: string;
  worker_private_ip: string;
  port: string | number;
  url: string;
  status: "updating" | "error" | "stable";
  last_touched: number;
}

interface BuildResponse {
  buildUrl?: string;
  tunnelUrl?: string;
  // Add other fields as needed
}

interface DispatchRequest {
  prototypeId: string;
  zipBuffer: Buffer;
  hotReload: boolean;
}
