import axios from "axios";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
} from "@aws-sdk/client-auto-scaling";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import Redis from "ioredis";
import dotenv from "dotenv";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Sha256 } from "@aws-crypto/sha256-js";
import { formatUrl } from "@aws-sdk/util-format-url";
import { HttpRequest } from "@aws-sdk/protocol-http";

dotenv.config();

async function buildIamAuthToken({
  username,
  cacheName, // serverless cache name (not the hostname)
  region,
  isServerless = true,
}: {
  username: string;
  cacheName: string;
  region: string;
  isServerless?: boolean;
}) {
  const signer = new SignatureV4({
    service: "elasticache",
    region,
    credentials: defaultProvider(),
    sha256: Sha256,
  });

  const query: Record<string, string> = { Action: "connect", User: username };
  if (isServerless) query.ResourceType = "ServerlessCache";

  const unsigned = new HttpRequest({
    protocol: "http:",
    hostname: cacheName, // e.g. the *cache name* for serverless
    method: "GET",
    path: "/", // important
    query, // plain Record<string,string>
    headers: {},
  });

  const signed = await signer.presign(unsigned /*, { expiresIn: 900 }*/);
  const presignedUrl = formatUrl(signed); // e.g. "https://cache-01/?Action=connect&User=app-user&..."
  const token = presignedUrl.replace(/^https?:\/\//, ""); // token is URL without the scheme
  return token;
}

export class DispatcherService {
  private autoScalingClient: AutoScalingClient;
  private ec2Client: EC2Client;
  private redis: Redis;

  constructor() {
    this.autoScalingClient = new AutoScalingClient({
      region: process.env.AWS_REGION!,
    });

    this.ec2Client = new EC2Client({
      region: process.env.AWS_REGION!,
    });

    const region = process.env.AWS_REGION!;
    const host = process.env.REDIS_HOST!; // Primary endpoint host (no scheme)
    const port = parseInt(process.env.REDIS_PORT!);
    const username = process.env.REDIS_USERNAME!; // ElastiCache user (IAM auth; username==userId)
    const cacheName = process.env.REDIS_CACHE_NAME!;

    this.redis = new Redis({
      host,
      port,
      username,
      password: undefined,
      lazyConnect: true,
      tls: {},
      maxRetriesPerRequest: 3,
      enableAutoPipelining: true,
    });

    const getPassword = async () =>
      buildIamAuthToken({ username, cacheName, region, isServerless: true });

    (async () => {
      const token = await getPassword();
      // ioredis reads password option only at connect time; set dynamically:
      // @ts-ignore
      this.redis.options.password = token;
      await this.redis.connect();
    })();

    // On reconnects, refresh the token (token ~15 min; connection max 12h)
    this.redis.on("reconnecting", async () => {
      try {
        const token = await getPassword();
        // @ts-ignore
        this.redis.options.password = token;
      } catch (e) {
        console.error("Failed to refresh IAM auth token for Redis:", e);
      }
    });
  }

  // Get least loaded worker instance
  private async getLeastLoadedWorker() {
    try {
      const instances = await this.getActiveWorkerInstances();

      if (instances.length === 0) {
        throw new Error("No active worker instances available");
      }

      // Get load information for each instance from Redis
      const instanceLoads: {
        instance: any;
        activeBuilds: number;
        availablePorts: number;
      }[] = [];

      for (const instance of instances) {
        const ip = instance.PrivateIpAddress;

        // Count active builds for this instance
        const activeBuildsKey = `active_builds:${ip}`;
        const activeBuilds = await this.redis.scard(activeBuildsKey);

        // Count available ports for this instance
        const portRegistryKey = `port_registry:${ip}`;
        const totalPorts =
          parseInt(process.env.MAX_PORT!) - parseInt(process.env.MIN_PORT!);
        const usedPorts = await this.redis.scard(portRegistryKey);
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
  private async acquireFreePort(workerIp) {
    // find a free ports in the Elasticache PortRegistry for the workerIp
    // acquire a lock on elasticache
    // then acquire a port (mark it as taken) in the PortRegistry and ActiveBuildRegistry in Elasticache
    // release the lock
  }

  // Release a port
  private async releasePort(workerIp, port) {
    // clear the port from the Elasticache port registry and mark it as free
    // remove the port from the ActiveBuildRegistry for this project
  }

  // Send request to worker
  private async sendWorkerRequest(workerIp, payload) {
    try {
      const response = await axios.post(
        `http://${workerIp}:3000/build`,
        payload,
        {
          timeout: 30000,
          headers: { "Content-Type": "application/json" },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Process build request
  public async processBuildRequest(prototypeId, files, isHotReload = false) {
    try {
      // Check if build already exists
      // If build already exists, send update to the existing worker
      //   - load the build info from the Elasticache ActiveBuildRegistry
      //   - send the update to the worker (if hot reload vs regular build send to appropriate endpoint)
      //   - update the timestamp in the Elasticache ActiveBuildRegistry
      //   - return the result
      // If build does not exist, create a new build
      //   - get the least loaded worker
      //   - acquire a free port if hot reload
      //   - create a new build info and add to the Elasticache ActiveBuildRegistry
      //   - Optional: increment the worker load in elasticache
      //   - send the build request to the worker (either /build or /hot-reload)
      //   - return the result

      // Create new build
      const worker = await this.getLeastLoadedWorker();
      const workerIp = worker.PrivateIpAddress;
      let port: number | null = null;

      // Send request to worker
      const payload = {
        prototypeId,
        files,
        isHotReload,
        isUpdate: false,
        port,
      };

      const result = await this.sendWorkerRequest(workerIp, payload);
      return result;
    } catch (error) {
      throw error;
    }
  }
}
