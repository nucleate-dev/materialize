import axios from "axios";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
} from "@aws-sdk/client-auto-scaling";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import * as dotenv from "dotenv";
import { GlideClient } from "@valkey/valkey-glide";
import FormData from "form-data";

dotenv.config();

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
  type: "build" | "hot_reload";
  status: "starting" | "running" | "error" | "stopped";
  last_touched: number;
}

interface BuildResponse {
  buildUrl?: string;
  tunnelUrl?: string;
  // Add other fields as needed
}

export class DispatcherService {
  private autoScalingClient: AutoScalingClient;
  private ec2Client: EC2Client;
  private cache!: GlideClient; // Valkey GLIDE client
  private allocateSha: string | null = null;

  constructor() {
    this.autoScalingClient = new AutoScalingClient({
      region: process.env.AWS_REGION!,
    });

    this.ec2Client = new EC2Client({
      region: process.env.AWS_REGION!,
    });

    const endpointHost = process.env.CACHE_HOST!;
    const port = parseInt(process.env.CACHE_PORT!);
    const username = process.env.CACHE_USERNAME!;
    const password = process.env.CACHE_PASSWORD!;

    const initCache = async (): Promise<void> => {
      try {
        this.cache = await GlideClient.createClient({
          addresses: [{ host: endpointHost, port }],
          useTLS: true,
          credentials: {
            username,
            password,
          },
          clientName: "control-plane",
          requestTimeout: 2000,
        });
        console.log("Valkey cache initialized successfully");
      } catch (error) {
        console.error("Failed to initialize Valkey cache:", error);
        throw error;
      }
    };

    void initCache();
  }

  // Process build request with zipped files
  public async processDispatchRequest(
    prototypeId: string,
    zipBuffer: Buffer,
    writeToDisk: boolean = false,
    hotReload: boolean = false
  ): Promise<any> {
    try {
      // Check if build already exists
      const activeBuildKey = `active_build:${prototypeId}`;
      const existingBuildJson = await this.cache.get(activeBuildKey);

      if (existingBuildJson) {
        let existingBuild: ActiveBuild = JSON.parse(
          existingBuildJson as string
        );
        console.log("Found existing build: ", existingBuild);

        if (hotReload && existingBuild.port === "") {
          console.log("Existing build being transitioned to hot reload");
          let allocatedPort: number | undefined;
          const port = await this.acquireFreePort(
            existingBuild.worker_private_ip
          );
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
          await this.cache.set(activeBuildKey, JSON.stringify(existingBuild));
        }

        const formData = this.constructFormData(
          prototypeId,
          zipBuffer,
          existingBuild.port ? Number(existingBuild.port) : undefined
        );

        const buildResponse: BuildResponse = hotReload
          ? await this.sendWorkerLiveDevServerRequest(
              existingBuild.worker_private_ip,
              formData
            )
          : await this.sendWorkerBuildRequest(
              existingBuild.worker_private_ip,
              formData
            );

        // Update the existing build with new timestamp and URL
        const updatedBuild: ActiveBuild = {
          ...existingBuild,
          url: buildResponse.buildUrl,
          type: hotReload ? "hot_reload" : "build",
          last_touched: Math.floor(Date.now() / 1000),
        };

        await this.cache.set(activeBuildKey, JSON.stringify(updatedBuild));
        return buildResponse;
      }

      // If build does not exist, create a new build
      const instances = await this.getActiveWorkerInstances();
      const workerIp = instances[0].PrivateIpAddress;
      console.log("No existing build found, creating a new build:");
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

      // Create new build entry in cache PRIOR to sending reques to build worker, in case build worker request fails
      const newBuild: ActiveBuild = {
        worker_host: instances[0].InstanceId,
        worker_private_ip: workerIp,
        port: allocatedPort || "",
        url: "",
        type: hotReload ? "hot_reload" : "build",
        status: "running",
        last_touched: Math.floor(Date.now() / 1000),
      };
      await this.cache.set(activeBuildKey, JSON.stringify(newBuild));

      // construct and send request to appropriate build worker
      const formData = this.constructFormData(
        prototypeId,
        zipBuffer,
        allocatedPort
      );
      let buildResponse: BuildResponse | null = null;
      if (hotReload) {
        buildResponse = await this.sendWorkerLiveDevServerRequest(
          workerIp,
          formData
        );
      } else {
        buildResponse = await this.sendWorkerBuildRequest(workerIp, formData);
      }

      // Create new build entry in cache
      const updatedBuild: ActiveBuild = {
        worker_host: instances[0].InstanceId,
        worker_private_ip: workerIp,
        port: allocatedPort || "",
        url: hotReload ? buildResponse.tunnelUrl : buildResponse.buildUrl,
        type: hotReload ? "hot_reload" : "build",
        status: "running",
        last_touched: Math.floor(Date.now() / 1000),
      };
      await this.cache.set(activeBuildKey, JSON.stringify(newBuild));
      console.log("New build: ", newBuild);

      return buildResponse;
    } catch (error) {
      throw error;
    }
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

  // Get least loaded worker instance
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
