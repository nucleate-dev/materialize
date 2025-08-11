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
  buildUrl: string;
  // Add other fields as needed
}

export class DispatcherService {
  private autoScalingClient: AutoScalingClient;
  private ec2Client: EC2Client;
  private cache!: GlideClient; // Valkey GLIDE client

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

  // Get least loaded worker instance
  private async getLeastLoadedWorker() {
    try {
      const instances = await this.getActiveWorkerInstances();

      if (instances.length === 0) {
        throw new Error("No active worker instances available");
      }

      // Get load information for each instance from Cache
      const instanceLoads: {
        instance: any;
        activeBuilds: number;
        availablePorts: number;
      }[] = [];

      for (const instance of instances) {
        const ip = instance.PrivateIpAddress;

        // Count active builds for this instance
        const activeBuildsKey = `active_builds:${ip}`;
        const activeBuilds = await this.cache.scard(activeBuildsKey);

        // Count available ports for this instance
        const portRegistryKey = `port_registry:${ip}`;
        const totalPorts =
          parseInt(process.env.MAX_PORT!) - parseInt(process.env.MIN_PORT!);
        const usedPorts = await this.cache.scard(portRegistryKey);
        const availablePorts = totalPorts - usedPorts;

        instanceLoads.push({
          instance,
          activeBuilds,
          availablePorts,
        });
      }

      // Sort by load priority:
      // 1. Prioritize instances with available ports (for hot reload capability)
      // 2. Then by lowest number of active builds
      instanceLoads.sort((a, b) => {
        // First, prioritize instances with available ports
        if (a.availablePorts > 0 && b.availablePorts === 0) return -1;
        if (a.availablePorts === 0 && b.availablePorts > 0) return 1;

        // Then sort by number of active builds (least loaded first)
        return a.activeBuilds - b.activeBuilds;
      });

      return instanceLoads[0].instance;
    } catch (error) {
      console.error("Error getting least loaded worker:", error);
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
  private async acquireFreePort(workerIp: string): Promise<number | null> {
    // find a free ports in the Elasticache PortRegistry for the workerIp
    // acquire a lock on elasticache
    // then acquire a port (mark it as taken) in the PortRegistry and ActiveBuildRegistry in Elasticache
    // release the lock
    return null; // TODO: Implement
  }

  // Release a port
  private async releasePort(workerIp: string, port: number): Promise<void> {
    // clear the port from the Elasticache port registry and mark it as free
    // remove the port from the ActiveBuildRegistry for this project
  }

  // Send request to worker
  private async sendWorkerRequest(
    workerIp: string,
    hotReload: boolean,
    formData: FormData
  ): Promise<any> {
    if (!hotReload) {
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
        console.log("Error sending worker request: ", error);
        throw error;
      }
    } else {
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
        console.log("Error sending worker request: ", error);
        throw error;
      }
    }
  }

  private constructFormData(
    prototypeId: string,
    zipBuffer: Buffer,
    writeToDisk: boolean
  ) {
    const formData = new FormData();
    formData.append("prototypeId", prototypeId);
    formData.append("write_to_disk", writeToDisk.toString());
    formData.append("files", zipBuffer, {
      filename: "project.zip",
      contentType: "application/zip",
    });
    return formData;
  }

  // Process build request with zipped files
  public async processBuildRequest(
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
        const existingBuild: ActiveBuild = JSON.parse(
          existingBuildJson as string
        );
        console.log("Found existing build: ", existingBuild);

        const buildResponse: BuildResponse = await this.sendWorkerRequest(
          existingBuild.worker_private_ip,
          hotReload,
          this.constructFormData(prototypeId, zipBuffer, writeToDisk)
        ); // TODO optionally send hot reload vs build

        // Update the existing build with new timestamp and URL
        const updatedBuild: ActiveBuild = {
          ...existingBuild,
          url: buildResponse.buildUrl,
          last_touched: Math.floor(Date.now() / 1000),
        };

        await this.cache.set(activeBuildKey, JSON.stringify(updatedBuild));
        return buildResponse;
      }

      // TODO: If build does not exist, create a new build
      //   - get the least loaded worker
      //   - acquire a free port if hot reload
      //   - create a new build info and add to the Elasticache ActiveBuildRegistry
      //   - Optional: increment the worker load in elasticache
      //   - send the build request to the worker (either /build or /hot-reload)
      //   - return the result
      const instances = await this.getActiveWorkerInstances();
      const workerIp = instances[0].PrivateIpAddress;
      console.log("No existing build found, creating a new build:");
      console.log("Instance to push to: ", workerIp);

      const buildResponse: BuildResponse = await this.sendWorkerRequest(
        workerIp,
        hotReload,
        this.constructFormData(prototypeId, zipBuffer, writeToDisk)
      );

      // Create new build entry in cache
      const newBuild: ActiveBuild = {
        worker_host: instances[0].InstanceId,
        worker_private_ip: workerIp,
        port: "",
        url: buildResponse.buildUrl,
        type: "build",
        status: "running",
        last_touched: Math.floor(Date.now() / 1000),
      };

      console.log("New build: ", newBuild);

      await this.cache.set(activeBuildKey, JSON.stringify(newBuild));
      return buildResponse;
    } catch (error) {
      throw error;
    }
  }
}
