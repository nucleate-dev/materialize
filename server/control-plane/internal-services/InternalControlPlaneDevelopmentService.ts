import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
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
  }

  // Route handler for acquiring EC2 dev server
  private async handleAcquireEC2(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { serverName } = request.body as { serverName: string };
    request.log2 = request.log2.child({
      service: 'internal-services',
    });
    request.log2.info('Acquiring dev EC2 instance', { serverName });

    try {
      // Validate server name
      if (!serverName || serverName.trim().length === 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: 'Server name is required',
        });
      }

      // Acquire the EC2 instance
      const result = await this.allocateDevServer(
        serverName.trim(),
        request.log2,
      );

      request.log2.info('EC2 dev server acquired successfully', {
        serverName,
        instanceId: result.instanceId,
        state: result.state,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        instanceId: result.instanceId,
        state: result.state,
        publicDns: result.publicDns,
        publicIpv4: result.publicIpv4,
        sshCommand: result.sshCommand,
        message: `Dev server '${serverName}' acquired successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to acquire EC2 dev server', {
        serverName,
      });

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to acquire dev server: ${e.message}`,
      });
    }
  }

  // Load user data script from file
  private loadUserDataScript(): string {
    try {
      const scriptPath = path.resolve(
        process.cwd(),
        process.env.NODE_ENV === 'development'
          ? 'infra/ec2/dev-ec2-user-data-script.sh'
          : 'dist/infra/ec2/dev-ec2-user-data-script.sh',
      );
      return fs.readFileSync(scriptPath, 'utf-8');
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

  // Allocate a dev EC2 server
  private async allocateDevServer(
    serverName: string,
    log2: SystemLogger,
  ): Promise<{
    instanceId: string | undefined;
    state: string | undefined;
    publicDns: string | undefined;
    publicIpv4: string | undefined;
    sshCommand: string;
  }> {
    const userDataScript = this.loadUserDataScript();

    const cmd = new RunInstancesCommand({
      ImageId: 'ami-00dcc61084e6a2f20', // Amazon Linux 2023
      InstanceType: 't3.micro',
      MinCount: 1,
      MaxCount: 1,
      KeyName: process.env.INTERNAL_TOOLS_EC2_SSH_KEY_NAME!, // Replace with your key pair name
      SecurityGroupIds:
        process.env.INTERNAL_TOOLS_EC2_SECURITY_GROUPS?.split(',') || [], // Replace with your security group
      IamInstanceProfile: {
        Name: process.env.INTERNAL_TOOLS_EC2_IAM_INSTANCE_PROFILE_NAME!,
      }, // Replace with your instance role
      InstanceInitiatedShutdownBehavior: 'terminate',
      UserData: Buffer.from(userDataScript).toString('base64'), // Must be base64 encoded
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: `dev-server-${serverName}` },
            { Key: 'Purpose', Value: 'dev-server' },
            { Key: 'Environment', Value: 'development' },
            { Key: 'AutoTerminate', Value: '3-hours' },
          ],
        },
      ],
    });

    const runResp = await this.ec2Client.send(cmd);
    const instance = runResp.Instances?.[0];

    if (!instance?.InstanceId) {
      return {
        instanceId: undefined,
        state: undefined,
        publicDns: undefined,
        publicIpv4: undefined,
        sshCommand: 'Unable to generate SSH command - no instance ID',
      };
    }

    // Wait for instance to be fully ready (user data script completed)
    await this.waitForInstanceReady(instance.InstanceId, log2);

    // Fetch updated instance details to get public DNS and IP
    try {
      const describeCmd = new DescribeInstancesCommand({
        InstanceIds: [instance.InstanceId],
      });

      const describeResp = await this.ec2Client.send(describeCmd);
      const detailedInstance = describeResp.Reservations?.[0]?.Instances?.[0];

      const publicDns = detailedInstance?.PublicDnsName;
      const publicIpv4 = detailedInstance?.PublicIpAddress;
      const state = detailedInstance?.State?.Name || instance?.State?.Name;

      // Generate SSH command
      const keyName =
        process.env.INTERNAL_TOOLS_EC2_SSH_KEY_NAME || 'unknown-key';
      const sshCommand = publicDns
        ? `ssh -i "${keyName}.pem" ec2-user@${publicDns}`
        : publicIpv4
        ? `ssh -i "${keyName}.pem" ec2-user@${publicIpv4}`
        : `ssh -i "${keyName}.pem" ec2-user@<pending-public-address>`;

      return {
        instanceId: instance.InstanceId,
        state,
        publicDns: publicDns || 'pending',
        publicIpv4: publicIpv4 || 'pending',
        sshCommand,
      };
    } catch {
      // If describe fails, return what we have from the initial run
      const keyName =
        process.env.INTERNAL_TOOLS_EC2_SSH_KEY_NAME || 'unknown-key';

      return {
        instanceId: instance.InstanceId,
        state: instance?.State?.Name,
        publicDns: 'pending',
        publicIpv4: 'pending',
        sshCommand: `ssh -i "${keyName}.pem" ec2-user@<pending-public-address>`,
      };
    }
  }
}
