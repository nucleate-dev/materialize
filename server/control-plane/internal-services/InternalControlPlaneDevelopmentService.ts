import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  DescribeInstanceStatusCommand,
  waitUntilInstanceRunning,
  waitUntilInstanceStatusOk,
} from '@aws-sdk/client-ec2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';
import fs from 'fs';
import path from 'path';
import { SystemLogger } from '../loggers/SystemLogger.js';

export class InternalControlPlaneDevelopmentService {
  private ec2Client: EC2Client;

  constructor(ec2Client: EC2Client) {
    this.ec2Client = ec2Client;
  }

  // Register routes with Fastify
  public registerRoutes(app: FastifyInstance): void {
    // POST /internal/dev-server/acquire-ec2 - Acquire a dev EC2 instance
    app.post(
      '/internal/dev-server/acquire-ec2',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Acquire a development EC2 instance (requires internal tools authentication)',
          tags: ['internal-tools', 'dev-server'],
          headers: {
            type: 'object',
            required: ['x-internal-signature', 'x-internal-timestamp'],
            properties: {
              'x-internal-signature': {
                type: 'string',
                description: 'HMAC-SHA256 signature',
              },
              'x-internal-timestamp': {
                type: 'string',
                description: 'Unix timestamp',
              },
            },
          },
          body: {
            type: 'object',
            required: ['serverName'],
            properties: {
              serverName: {
                type: 'string',
                description: 'Name for the dev server',
              },
              instanceType: {
                type: 'string',
                description: 'EC2 instance type (t3.micro, t3.medium, or t3.large)',
                enum: ['t3.micro', 't3.medium', 't3.large'],
              },
              lifespanHours: {
                type: 'number',
                description: 'Instance lifespan in hours (3-6)',
                minimum: 3,
                maximum: 6,
              },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                instanceId: { type: 'string' },
                state: { type: 'string' },
                publicDns: { type: 'string' },
                publicIpv4: { type: 'string' },
                sshCommand: { type: 'string' },
                message: { type: 'string' },
                timestamp: { type: 'string' },
              },
            },
            400: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' },
              },
            },
            401: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' },
                requiredHeaders: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            500: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      this.handleAcquireEC2.bind(this),
    );

    // GET /internal/dev-server/instance-status/:instanceId - Check instance status
    app.get(
      '/internal/dev-server/instance-status/:instanceId',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Check the status of a dev EC2 instance (requires internal tools authentication)',
          tags: ['internal-tools', 'dev-server'],
          headers: {
            type: 'object',
            required: ['x-internal-signature', 'x-internal-timestamp'],
            properties: {
              'x-internal-signature': {
                type: 'string',
                description: 'HMAC-SHA256 signature',
              },
              'x-internal-timestamp': {
                type: 'string',
                description: 'Unix timestamp',
              },
            },
          },
          params: {
            type: 'object',
            required: ['instanceId'],
            properties: {
              instanceId: {
                type: 'string',
                description: 'EC2 instance ID',
              },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                instanceId: { type: 'string' },
                state: { type: 'string' },
                statusChecks: { type: 'string' },
                publicDns: { type: 'string' },
                publicIpv4: { type: 'string' },
              },
            },
            404: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' },
              },
            },
            500: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      this.handleGetInstanceStatus.bind(this),
    );
  }

  // Route handler for acquiring EC2 dev server with streaming
  private async handleAcquireEC2(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const {
      serverName,
      instanceType = 't3.medium',
      lifespanHours = 3
    } = request.body as {
      serverName: string;
      instanceType?: string;
      lifespanHours?: number;
    };
    request.log2 = request.log2.child({
      service: 'internal-services',
    });
    request.log2.info('Acquiring dev EC2 instance', { serverName, instanceType, lifespanHours });

    // Validate server name
    if (!serverName || serverName.trim().length === 0) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        error: 'Bad Request',
        message: 'Server name is required',
      });
    }

    // Set up streaming response - hijack the reply to bypass schema validation
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, x-internal-signature, x-internal-timestamp',
    });

    const sendMessage = (message: Record<string, unknown>) => {
      reply.raw.write(JSON.stringify(message) + '\n');
    };

    try {
      // Step 1: Acquire the instance (without waiting for ready state)
      const instanceId = await this.allocateDevServerInitial(
        serverName.trim(),
        instanceType,
        lifespanHours,
        request.log2,
      );

      // Await for 2 seconds for aws to populate instance metadata
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get initial instance details
      const initialDetails = await this.getInstanceDetails(
        instanceId,
        request.log2,
      );

      sendMessage({
        type: 'instance-created',
        instanceId: initialDetails.instanceId,
        state: initialDetails.state,
        publicDns: initialDetails.publicDns,
        publicIpv4: initialDetails.publicIpv4,
        sshCommand: initialDetails.sshCommand,
        ready: false,
      });

      // Step 2: Wait for instance to be ready
      await this.waitForInstanceReady(instanceId, request.log2);

      // Get updated instance details
      const readyDetails = await this.getInstanceDetails(
        instanceId,
        request.log2,
      );

      sendMessage({
        type: 'instance-ready',
        instanceId: readyDetails.instanceId,
        state: readyDetails.state,
        publicDns: readyDetails.publicDns,
        publicIpv4: readyDetails.publicIpv4,
        sshCommand: readyDetails.sshCommand,
        ready: true,
      });

      request.log2.info('EC2 dev server ready', {
        serverName,
        instanceId,
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to acquire EC2 dev server', {
        serverName,
      });

      sendMessage({
        type: 'error',
        error: e.message || 'Failed to acquire dev server',
      });
    }

    reply.raw.end();
  }

  // Route handler for getting instance status
  private async handleGetInstanceStatus(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { instanceId } = request.params as { instanceId: string };
    request.log2 = request.log2.child({
      service: 'internal-services',
    });

    try {
      // Get basic instance information
      const describeCmd = new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      });

      const describeResp = await this.ec2Client.send(describeCmd);
      const instance = describeResp.Reservations?.[0]?.Instances?.[0];

      if (!instance) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          error: 'Not Found',
          message: `Instance ${instanceId} not found`,
        });
      }

      const state = instance.State?.Name || 'unknown';

      // Get instance status checks separately
      const statusCmd = new DescribeInstanceStatusCommand({
        InstanceIds: [instanceId],
      });

      const statusResp = await this.ec2Client.send(statusCmd);
      const instanceStatus = statusResp.InstanceStatuses?.[0];

      const statusChecksOk =
        instanceStatus?.InstanceStatus?.Status === 'ok' &&
        instanceStatus?.SystemStatus?.Status === 'ok'
          ? 'ok'
          : 'initializing';

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        instanceId,
        state,
        statusChecks: statusChecksOk,
        publicDns: instance.PublicDnsName || 'pending',
        publicIpv4: instance.PublicIpAddress || 'pending',
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to get instance status', {
        instanceId,
      });

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to get instance status: ${e.message}`,
      });
    }
  }

  // Load user data script from file
  private loadUserDataScript(lifespanHours: number): string {
    try {
      const scriptPath = path.resolve(
        process.cwd(),
        process.env.NODE_ENV === 'development'
          ? 'infra/ec2/dev-cp-user-data-script.sh'
          : 'dist/infra/ec2/dev-cp-user-data-script.sh',
      );
      const baseScript = fs.readFileSync(scriptPath, 'utf-8');

      // Calculate minutes from hours
      const shutdownMinutes = lifespanHours * 60;

      // Append shutdown command to the script
      const shutdownCommand = `\n\n# Auto-shutdown after ${lifespanHours} hours\nshutdown -h +${shutdownMinutes}\n`;

      return baseScript + shutdownCommand;
    } catch (error) {
      throw new Error(
        `Failed to load user data script: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  // Wait for instance to be ready (user data script completed)
  private async waitForInstanceReady(
    instanceId: string,
    log2: SystemLogger,
  ): Promise<void> {
    log2.info('Waiting for instance to be running...', { instanceId });

    // First wait for instance to be running
    await waitUntilInstanceRunning(
      {
        client: this.ec2Client,
        maxWaitTime: 300, // 5 minutes
        minDelay: 15, // 15 seconds between checks
        maxDelay: 30, // max 30 seconds between checks
      },
      { InstanceIds: [instanceId] },
    );

    log2.info('Instance is running, waiting for status checks...', {
      instanceId,
    });

    // Then wait for status checks to pass (this ensures user data script has completed)
    await waitUntilInstanceStatusOk(
      {
        client: this.ec2Client,
        maxWaitTime: 300, // 5 minutes
        minDelay: 30, // 30 seconds between checks (status checks take longer)
        maxDelay: 60, // max 60 seconds between checks
      },
      { InstanceIds: [instanceId] },
    );

    log2.info('Instance is fully ready - status checks passed', { instanceId });
  }

  // Allocate a dev EC2 server (initial step - just create the instance)
  private async allocateDevServerInitial(
    serverName: string,
    instanceType: string,
    lifespanHours: number,
    log2: SystemLogger,
  ): Promise<string> {
    const userDataScript = this.loadUserDataScript(lifespanHours);

    const cmd = new RunInstancesCommand({
      ImageId: 'ami-00dcc61084e6a2f20', // Amazon Linux 2023
      InstanceType: instanceType as 't3.micro' | 't3.medium' | 't3.large',
      MinCount: 1,
      MaxCount: 1,
      KeyName: process.env.INTERNAL_TOOLS_EC2_SSH_KEY_NAME!,
      SecurityGroupIds:
        process.env.INTERNAL_TOOLS_EC2_SECURITY_GROUPS?.split(',') || [],
      IamInstanceProfile: {
        Name: process.env.INTERNAL_TOOLS_EC2_IAM_INSTANCE_PROFILE_NAME!,
      },
      InstanceInitiatedShutdownBehavior: 'terminate',
      UserData: Buffer.from(userDataScript).toString('base64'),
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: `dev-server-${serverName}` },
            { Key: 'Purpose', Value: 'dev-server' },
            { Key: 'Environment', Value: 'development' },
            { Key: 'AutoTerminate', Value: `${lifespanHours}-hours` },
            { Key: 'InstanceType', Value: instanceType },
          ],
        },
      ],
    });

    const runResp = await this.ec2Client.send(cmd);
    const instance = runResp.Instances?.[0];

    if (!instance?.InstanceId) {
      throw new Error(
        'Failed to create EC2 instance - no instance ID returned',
      );
    }

    log2.info('EC2 instance created', { instanceId: instance.InstanceId });
    return instance.InstanceId;
  }

  // Get instance details
  private async getInstanceDetails(
    instanceId: string,
    log2: SystemLogger,
  ): Promise<{
    instanceId: string;
    state: string;
    publicDns: string;
    publicIpv4: string;
    sshCommand: string;
  }> {
    try {
      const describeCmd = new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      });

      const describeResp = await this.ec2Client.send(describeCmd);
      const instance = describeResp.Reservations?.[0]?.Instances?.[0];

      const publicDns = instance?.PublicDnsName;
      const publicIpv4 = instance?.PublicIpAddress;
      const state = instance?.State?.Name || 'unknown';

      // Generate SSH command
      const keyName =
        process.env.INTERNAL_TOOLS_EC2_SSH_KEY_NAME || 'unknown-key';
      const sshCommand = publicDns
        ? `ssh -i "${keyName}.pem" ec2-user@${publicDns}`
        : publicIpv4
          ? `ssh -i "${keyName}.pem" ec2-user@${publicIpv4}`
          : `ssh -i "${keyName}.pem" ec2-user@<pending-public-address>`;

      return {
        instanceId,
        state,
        publicDns: publicDns || 'pending',
        publicIpv4: publicIpv4 || 'pending',
        sshCommand,
      };
    } catch (error) {
      log2.error(error, 'Failed to get instance details', { instanceId });
      const keyName =
        process.env.INTERNAL_TOOLS_EC2_SSH_KEY_NAME || 'unknown-key';

      return {
        instanceId,
        state: 'unknown',
        publicDns: 'pending',
        publicIpv4: 'pending',
        sshCommand: `ssh -i "${keyName}.pem" ec2-user@<pending-public-address>`,
      };
    }
  }
}
