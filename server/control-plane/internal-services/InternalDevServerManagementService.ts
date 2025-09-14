import { EC2Client, RunInstancesCommand } from '@aws-sdk/client-ec2';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';

export class InternalDevServerManagementService {
  private ec2Client: EC2Client;
  private ecsClient: ECSClient;
  private fastifyApp: FastifyInstance;

  constructor(
    ec2Client: EC2Client,
    ecsClient: ECSClient,
    fastifyApp: FastifyInstance,
  ) {
    this.ec2Client = ec2Client;
    this.ecsClient = ecsClient;
    this.fastifyApp = fastifyApp;
  }

  // Register routes with Fastify
  public registerRoutes(app: FastifyInstance): void {
    this.fastifyApp = app;

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

    // POST /internal/dev-server/acquire-fargate - Acquire a dev Fargate task
    app.post(
      '/internal/dev-server/acquire-fargate',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Acquire a development Fargate task (requires internal tools authentication)',
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
            required: ['taskName'],
            properties: {
              taskName: {
                type: 'string',
                description: 'Name for the dev task',
              },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                taskArn: { type: 'string' },
                state: { type: 'string' },
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
      this.handleAcquireFargate.bind(this),
    );
  }

  // Route handler for acquiring EC2 dev server
  private async handleAcquireEC2(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { serverName } = request.body as { serverName: string };
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
      const result = await this.allocateDevServer(serverName.trim());

      request.log2.info('EC2 dev server acquired successfully', {
        serverName,
        instanceId: result.instanceId,
        state: result.state,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        instanceId: result.instanceId,
        state: result.state,
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

  // Route handler for acquiring Fargate dev task
  private async handleAcquireFargate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { taskName } = request.body as { taskName: string };
    request.log2.info('Acquiring dev Fargate task', { taskName });

    try {
      // Validate task name
      if (!taskName || taskName.trim().length === 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: 'Task name is required',
        });
      }

      // Acquire the Fargate task
      const result = await this.allocateDevFargateTask(taskName.trim());

      request.log2.info('Fargate dev task acquired successfully', {
        taskName,
        taskArn: result.taskArn,
        state: result.state,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        taskArn: result.taskArn,
        state: result.state,
        message: `Dev Fargate task '${taskName}' acquired successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to acquire Fargate dev task', {
        taskName,
      });

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to acquire dev Fargate task: ${e.message}`,
      });
    }
  }

  // Allocate a dev EC2 server
  private async allocateDevServer(serverName: string): Promise<{
    instanceId: string | undefined;
    state: string | undefined;
  }> {
    const userDataScript = `#!/bin/bash
# Schedule termination in 3 hours
shutdown -h +180

# Update system
yum update -y
`;

    const cmd = new RunInstancesCommand({
      ImageId: 'ami-0abcdef1234567890', // Replace with your AMI - Amazon Linux 2
      InstanceType: 't3.micro',
      MinCount: 1,
      MaxCount: 1,
      KeyName: 'mat-ec2-key-1', // Replace with your key pair name
      SecurityGroupIds: ['sg-0123456789abcdef0'], // Replace with your security group
      IamInstanceProfile: { Name: 'ec2-control-plane-role' }, // Replace with your instance role
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

    return {
      instanceId: instance?.InstanceId,
      state: instance?.State?.Name,
    };
  }

  // Allocate a dev Fargate task
  private async allocateDevFargateTask(taskName: string): Promise<{
    taskArn: string | undefined;
    state: string | undefined;
  }> {
    const runTaskCommand = new RunTaskCommand({
      cluster: process.env.ECS_CLUSTER_NAME!, // Replace with your dev cluster name
      taskDefinition: 'fastify-build-worker', // Replace with your dev task definition
      launchType: 'FARGATE' as const,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: process.env.ECS_SUBNETS?.split(',') || [], // Replace with your subnet IDs
          securityGroups: process.env.ECS_SECURITY_GROUPS?.split(',') || [], // Replace with your security group
          assignPublicIp: 'ENABLED',
        },
      },
      tags: [
        { key: 'Name', value: `dev-fargate-${taskName}` },
        { key: 'Purpose', value: 'dev-build-worker' },
        { key: 'Environment', value: 'development' },
      ],
    });

    const response = await this.ecsClient.send(runTaskCommand);
    const task = response.tasks?.[0];

    return {
      taskArn: task?.taskArn,
      state: task?.lastStatus,
    };
  }
}
