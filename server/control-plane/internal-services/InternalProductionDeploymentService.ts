import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  waitUntilInstanceRunning,
  waitUntilInstanceStatusOk,
} from '@aws-sdk/client-ec2';
import {
  AutoScalingClient,
  StartInstanceRefreshCommand,
} from '@aws-sdk/client-auto-scaling';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';
import fs from 'fs';
import path from 'path';
import { SystemLogger } from '../loggers/SystemLogger.js';

export class InternalProductionDeploymentService {
  private ec2Client: EC2Client;
  private autoScalingClient: AutoScalingClient;
  private fastifyApp: FastifyInstance;

  constructor(
    ec2Client: EC2Client,
    autoScalingClient: AutoScalingClient,
    fastifyApp: FastifyInstance,
  ) {
    this.ec2Client = ec2Client;
    this.autoScalingClient = autoScalingClient;
    this.fastifyApp = fastifyApp;
  }

  public registerRoutes(app: FastifyInstance): void {
    this.fastifyApp = app;

    // POST /internal/prod-deployment/validate-deployment-safety
    app.post(
      '/internal/prod-deployment/validate-deployment-safety',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Validate deployment safety by creating a test instance with prod user data (requires internal tools authentication)',
          tags: ['internal-tools', 'prod-deployment'],
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
            properties: {},
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                instanceId: { type: 'string' },
                publicIp: { type: 'string' },
                healthCheckResult: { type: 'object' },
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
      this.handleValidateDeploymentSafety.bind(this),
    );

    // POST /internal/prod-deployment/deploy-to-prod
    app.post(
      '/internal/prod-deployment/deploy-to-prod',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Deploy to production using Auto Scaling Group instance refresh (requires internal tools authentication)',
          tags: ['internal-tools', 'prod-deployment'],
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
            properties: {
              MinHealthyPercentage: {
                type: 'number',
                minimum: 0,
                maximum: 100,
                description:
                  'Minimum healthy percentage during refresh (default: 100)',
              },
              InstanceWarmup: {
                type: 'number',
                minimum: 0,
                description: 'Instance warmup time in seconds (default: 180)',
              },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                instanceRefreshId: { type: 'string' },
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
      this.handleDeployToProd.bind(this),
    );
  }

  private async handleValidateDeploymentSafety(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    request.log2 = request.log2.child({
      service: 'internal-prod-deployment',
    });
    request.log2.info('Validating deployment safety');

    try {
      // Create test instance with production user data
      const testResult = await this.createProductionTestInstance(request.log2);

      if (!testResult.instanceId || !testResult.publicIp) {
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Internal Server Error',
          message:
            'Failed to create test instance or retrieve connection details',
        });
      }

      // Perform health check
      let healthCheckResult = await this.performHealthCheck(
        testResult.publicIp,
        request.log2,
      );
      if (!healthCheckResult.success) {
        request.log2.info(
          'Health check failed, waiting 30 more sec for server to start',
          {
            publicIp: testResult.publicIp,
          },
        );
        await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds
        healthCheckResult = await this.performHealthCheck(
          testResult.publicIp,
          request.log2,
        );
      }

      if (healthCheckResult.success) {
        request.log2.info('Deployment validation passed', {
          instanceId: testResult.instanceId,
          publicIp: testResult.publicIp,
        });

        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          message:
            'Deployment validation passed. Server started successfully and health check passed.',
          instanceId: testResult.instanceId,
          publicIp: testResult.publicIp,
          healthCheckResult,
          timestamp: new Date().toISOString(),
        });
      } else {
        request.log2.error(
          new Error('Deployment validation failed'),
          'Deployment validation failed',
          {
            instanceId: testResult.instanceId,
            publicIp: testResult.publicIp,
            healthCheckResult,
          },
        );

        return reply.status(HTTP_STATUS.OK).send({
          success: false,
          message: `Deployment validation failed. Health check failed: ${healthCheckResult.error}`,
          instanceId: testResult.instanceId,
          publicIp: testResult.publicIp,
          healthCheckResult,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to validate deployment safety');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to validate deployment: ${e.message}`,
      });
    }
  }

  private async handleDeployToProd(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const body = request.body as {
      MinHealthyPercentage?: number;
      InstanceWarmup?: number;
    };

    request.log2 = request.log2.child({
      service: 'internal-prod-deployment',
    });
    request.log2.info('Starting production deployment', {
      MinHealthyPercentage: body.MinHealthyPercentage,
      InstanceWarmup: body.InstanceWarmup,
    });

    try {
      const minHealthyPercentage = body.MinHealthyPercentage ?? 100;
      const instanceWarmup = body.InstanceWarmup ?? 180;

      // Validate inputs
      if (minHealthyPercentage < 0 || minHealthyPercentage > 100) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: 'MinHealthyPercentage must be between 0 and 100',
        });
      }

      if (instanceWarmup < 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: 'InstanceWarmup must be 0 or greater',
        });
      }

      // Start instance refresh
      const result = await this.startInstanceRefresh(
        minHealthyPercentage,
        instanceWarmup,
        request.log2,
      );

      request.log2.info('Production deployment initiated', {
        instanceRefreshId: result.instanceRefreshId,
        MinHealthyPercentage: minHealthyPercentage,
        InstanceWarmup: instanceWarmup,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        instanceRefreshId: result.instanceRefreshId,
        message: `Production deployment initiated successfully. Instance refresh ID: ${result.instanceRefreshId}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to deploy to production');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to deploy to production: ${e.message}`,
      });
    }
  }

  // Load user data script from file
  private loadProductionUserDataScript(): string {
    try {
      const scriptPath = path.resolve(
        process.cwd(),
        'infra/ec2/prod-user-data-setup-script.sh',
      );
      // const shutdownCommand =
      //   '\n\n# Auto-shutdown after 10 minutes for safety validation\nshutdown -h +10\n';
      // return script + shutdownCommand;
      return fs.readFileSync(scriptPath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to load production user data script: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

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
        maxWaitTime: 600, // 10 minutes (longer for prod setup)
        minDelay: 30, // 30 seconds between checks (status checks take longer)
        maxDelay: 60, // max 60 seconds between checks
      },
      { InstanceIds: [instanceId] },
    );

    log2.info('Instance is fully ready - status checks passed', { instanceId });
  }

  private async createProductionTestInstance(log2: SystemLogger): Promise<{
    instanceId: string | undefined;
    publicIp: string | undefined;
  }> {
    const userDataScript = this.loadProductionUserDataScript();

    const cmd = new RunInstancesCommand({
      ImageId: 'ami-00dcc61084e6a2f20', // Amazon Linux 2023
      InstanceType: 't3.micro',
      MinCount: 1,
      MaxCount: 1,
      KeyName: process.env.INTERNAL_TOOLS_EC2_SSH_KEY_NAME!,
      SecurityGroupIds:
        process.env.INTERNAL_TOOLS_EC2_SECURITY_GROUPS?.split(',') || [],
      IamInstanceProfile: {
        Name: process.env.INTERNAL_TOOLS_EC2_IAM_INSTANCE_PROFILE_NAME!,
      },
      InstanceInitiatedShutdownBehavior: 'terminate',
      UserData: Buffer.from(userDataScript).toString('base64'), // Must be base64 encoded
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: 'prod-deployment-validation-test' },
            { Key: 'Purpose', Value: 'prod-deployment-validation' },
            { Key: 'Environment', Value: 'test' },
            { Key: 'AutoTerminate', Value: '10-minutes' },
          ],
        },
      ],
    });

    const runResp = await this.ec2Client.send(cmd);
    const instance = runResp.Instances?.[0];

    if (!instance?.InstanceId) {
      return {
        instanceId: undefined,
        publicIp: undefined,
      };
    }

    // Wait for instance to be fully ready (user data script completed)
    await this.waitForInstanceReady(instance.InstanceId, log2);

    // Fetch updated instance details to get public IP
    try {
      const describeCmd = new DescribeInstancesCommand({
        InstanceIds: [instance.InstanceId],
      });

      const describeResp = await this.ec2Client.send(describeCmd);
      const detailedInstance = describeResp.Reservations?.[0]?.Instances?.[0];

      const publicIp = detailedInstance?.PublicIpAddress;

      return {
        instanceId: instance.InstanceId,
        publicIp: publicIp || undefined,
      };
    } catch {
      // If describe fails, return what we have from the initial run
      return {
        instanceId: instance.InstanceId,
        publicIp: undefined,
      };
    }
  }

  private async performHealthCheck(
    publicIp: string,
    log2: SystemLogger,
  ): Promise<{
    success: boolean;
    error?: string;
    status?: number;
    response?: { status?: string; timestamp?: string; [key: string]: unknown };
  }> {
    try {
      log2.info('Performing health check', { publicIp });

      const healthUrl = `http://${publicIp}:3000/health`;

      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(30000), // 30 seconds
      });

      const responseData = await response.json();

      if (response.ok && responseData.status === 'healthy') {
        log2.info('Health check passed', {
          publicIp,
          status: response.status,
          responseData,
        });
        return {
          success: true,
          status: response.status,
          response: responseData,
        };
      } else {
        log2.warn('Health check failed - unexpected response', {
          publicIp,
          status: response.status,
          responseData,
        });
        return {
          success: false,
          error: `Health check returned status ${response.status}`,
          status: response.status,
          response: responseData,
        };
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      log2.error(error, 'Health check failed with error', { publicIp });

      return {
        success: false,
        error: e.message,
      };
    }
  }

  private async startInstanceRefresh(
    minHealthyPercentage: number,
    instanceWarmup: number,
    log2: SystemLogger,
  ): Promise<{ instanceRefreshId: string }> {
    const autoScalingGroupName =
      process.env.INTERNAL_TOOLS_ASG_CONTROL_PLANE_NAME!;

    log2.info('Starting instance refresh', {
      autoScalingGroupName,
      minHealthyPercentage,
      instanceWarmup,
    });

    const cmd = new StartInstanceRefreshCommand({
      AutoScalingGroupName: autoScalingGroupName,
      Strategy: 'Rolling',
      Preferences: {
        MinHealthyPercentage: minHealthyPercentage,
        InstanceWarmup: instanceWarmup,
        CheckpointPercentages: [50, 100], // Checkpoint at 50% and 100%
        CheckpointDelay: 600, // 10 minutes between checkpoints
      },
    });

    const response = await this.autoScalingClient.send(cmd);

    if (!response.InstanceRefreshId) {
      throw new Error(
        'Failed to start instance refresh - no refresh ID returned',
      );
    }

    log2.info('Instance refresh started successfully', {
      instanceRefreshId: response.InstanceRefreshId,
      autoScalingGroupName,
    });

    return {
      instanceRefreshId: response.InstanceRefreshId,
    };
  }
}
