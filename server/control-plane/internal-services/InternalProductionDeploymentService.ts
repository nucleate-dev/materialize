import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
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
import { IdleContainerAllocationSystemService } from '../services/idle-container-allocation-system/IdleContainerAllocationSystemService.js';

export class InternalProductionDeploymentService {
  private ec2Client: EC2Client;
  private autoScalingClient: AutoScalingClient;
  private fastifyApp: FastifyInstance;
  private idleContainerService: IdleContainerAllocationSystemService;

  constructor(
    ec2Client: EC2Client,
    autoScalingClient: AutoScalingClient,
    fastifyApp: FastifyInstance,
    idleContainerService: IdleContainerAllocationSystemService,
  ) {
    this.ec2Client = ec2Client;
    this.autoScalingClient = autoScalingClient;
    this.fastifyApp = fastifyApp;
    this.idleContainerService = idleContainerService;
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

    // POST /internal/prod-deployment/validate-and-deploy
    app.post(
      '/internal/prod-deployment/validate-and-deploy',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Validate deployment safety and deploy to production if validation passes (requires internal tools authentication)',
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
                validationResult: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    instanceId: { type: 'string' },
                    publicIp: { type: 'string' },
                  },
                },
                deploymentResult: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    instanceRefreshId: { type: 'string' },
                    message: { type: 'string' },
                  },
                },
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
      this.handleValidateAndDeploy.bind(this),
    );

    // POST /internal/prod-deployment/refresh-idle-containers
    app.post(
      '/internal/prod-deployment/refresh-idle-containers',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Refresh all idle containers by terminating existing ones and launching new ones (requires internal tools authentication)',
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
                terminated: { type: 'number' },
                launched: { type: 'number' },
                errors: {
                  type: 'array',
                  items: { type: 'string' },
                },
                message: { type: 'string' },
                timestamp: { type: 'string' },
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
      this.handleRefreshIdleContainers.bind(this),
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

    let testInstanceId: string | undefined;

    try {
      // Create test instance with production user data
      const testResult = await this.createProductionTestInstance(request.log2);
      testInstanceId = testResult.instanceId;

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

      // Terminate the test instance after validation is complete (regardless of result)
      if (testResult.instanceId) {
        await this.terminateTestInstance(testResult.instanceId, request.log2);
      }

      if (healthCheckResult.success) {
        request.log2.info('Deployment validation passed', {
          instanceId: testResult.instanceId,
          publicIp: testResult.publicIp,
        });

        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          message:
            'Deployment validation passed. Server started successfully and health check passed. Test instance terminated.',
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
          message: `Deployment validation failed. Health check failed: ${healthCheckResult.error}. Test instance terminated.`,
          instanceId: testResult.instanceId,
          publicIp: testResult.publicIp,
          healthCheckResult,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to validate deployment safety');

      // Attempt to terminate the instance if it was created
      if (testInstanceId) {
        await this.terminateTestInstance(testInstanceId, request.log2);
      }

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

  private async handleValidateAndDeploy(
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
    request.log2.info('Starting validate and deploy process', {
      MinHealthyPercentage: body.MinHealthyPercentage,
      InstanceWarmup: body.InstanceWarmup,
    });

    let validationResult: {
      success: boolean;
      message: string;
      instanceId?: string;
      publicIp?: string;
    } | null = null;
    let deploymentResult: {
      success: boolean;
      instanceRefreshId?: string;
      message: string;
    } | null = null;

    try {
      // Step 1: Validate deployment safety directly
      request.log2.info('Step 1: Validating deployment safety');

      let testInstanceId: string | undefined;

      try {
        // Create test instance with production user data
        const testResult = await this.createProductionTestInstance(
          request.log2,
        );
        testInstanceId = testResult.instanceId;

        if (!testResult.instanceId || !testResult.publicIp) {
          validationResult = {
            success: false,
            message:
              'Failed to create test instance or retrieve connection details',
          };
        } else {
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

          // Terminate the test instance after validation is complete (regardless of result)
          if (testResult.instanceId) {
            await this.terminateTestInstance(
              testResult.instanceId,
              request.log2,
            );
          }

          if (healthCheckResult.success) {
            request.log2.info('Deployment validation passed', {
              instanceId: testResult.instanceId,
              publicIp: testResult.publicIp,
            });

            validationResult = {
              success: true,
              message:
                'Deployment validation passed successfully. Control plane server started and health check passed.',
              instanceId: testResult.instanceId,
              publicIp: testResult.publicIp,
            };
          } else {
            request.log2.warn('Deployment validation failed', {
              instanceId: testResult.instanceId,
              publicIp: testResult.publicIp,
              error: healthCheckResult.error,
            });

            validationResult = {
              success: false,
              message: `Deployment validation failed: ${
                healthCheckResult.error || 'Health check did not pass'
              }`,
              instanceId: testResult.instanceId,
              publicIp: testResult.publicIp,
            };
          }
        }
      } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        request.log2.error(error, 'Deployment validation failed with error');

        // Make sure to terminate the test instance if it was created
        if (testInstanceId) {
          try {
            await this.terminateTestInstance(testInstanceId, request.log2);
          } catch (cleanupError) {
            request.log2.error(
              cleanupError,
              'Failed to clean up test instance',
            );
          }
        }

        validationResult = {
          success: false,
          message: `Deployment validation failed: ${e.message}`,
        };
      }

      if (!validationResult.success) {
        request.log2.info('Validation did not pass, skipping deployment', {
          validationResult,
        });

        return reply.status(HTTP_STATUS.OK).send({
          success: false,
          validationResult,
          deploymentResult: null,
          message: 'Validation failed, deployment not attempted',
          timestamp: new Date().toISOString(),
        });
      }

      // Step 2: Deploy to production if validation passed
      request.log2.info('Step 2: Validation passed, deploying to production');

      try {
        const result = await this.startInstanceRefresh(
          body.MinHealthyPercentage ?? 100,
          body.InstanceWarmup ?? 180,
          request.log2,
        );

        request.log2.info('Production deployment initiated successfully', {
          instanceRefreshId: result.instanceRefreshId,
          MinHealthyPercentage: body.MinHealthyPercentage ?? 100,
          InstanceWarmup: body.InstanceWarmup ?? 180,
        });

        deploymentResult = {
          success: true,
          instanceRefreshId: result.instanceRefreshId,
          message: `Production deployment initiated with instance refresh ID: ${result.instanceRefreshId}`,
        };
      } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        request.log2.error(error, 'Production deployment failed');

        deploymentResult = {
          success: false,
          message: `Production deployment failed: ${e.message}`,
        };
      }

      // Both validation and deployment completed successfully
      request.log2.info('Validate and deploy process completed successfully', {
        validationResult,
        deploymentResult,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        validationResult,
        deploymentResult,
        message: 'Validation passed and deployment initiated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to validate and deploy');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to validate and deploy: ${e.message}`,
      });
    }
  }

  private async handleRefreshIdleContainers(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    request.log2 = request.log2.child({
      service: 'internal-prod-deployment',
    });
    request.log2.info('Starting idle container refresh');

    try {
      const result =
        await this.idleContainerService.refreshAllIdleContainers();

      request.log2.info('Idle container refresh completed', {
        terminated: result.terminated,
        launched: result.launched,
        errorCount: result.errors.length,
      });

      const success = result.errors.length === 0;
      const message = success
        ? `Successfully refreshed ${result.terminated} idle containers. Terminated: ${result.terminated}, Launched: ${result.launched}`
        : `Refreshed idle containers with some errors. Terminated: ${result.terminated}, Launched: ${result.launched}, Errors: ${result.errors.length}`;

      return reply.status(HTTP_STATUS.OK).send({
        success,
        terminated: result.terminated,
        launched: result.launched,
        errors: result.errors,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to refresh idle containers');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to refresh idle containers: ${e.message}`,
      });
    }
  }

  // Load user data script from file
  private loadProductionUserDataScript(): string {
    try {
      const scriptPath = path.resolve(
        process.cwd(),
        process.env.NODE_ENV === 'development'
          ? 'infra/ec2/prod-user-data-setup-script.sh'
          : 'dist/infra/ec2/prod-user-data-setup-script.sh',
      );
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
    log2.consoleLogDevOnly('info', 'Waiting for instance to be running...', {
      instanceId,
    });

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

    log2.consoleLogDevOnly(
      'info',
      'Instance is running, waiting for status checks...',
      {
        instanceId,
      },
    );

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

    log2.consoleLogDevOnly(
      'info',
      'Instance is fully ready - status checks passed',
      { instanceId },
    );
  }

  private async terminateTestInstance(
    instanceId: string,
    log2: SystemLogger,
  ): Promise<void> {
    try {
      log2.consoleLogDevOnly('info', 'Terminating test instance', {
        instanceId,
      });

      const terminateCmd = new TerminateInstancesCommand({
        InstanceIds: [instanceId],
      });

      await this.ec2Client.send(terminateCmd);

      log2.consoleLogDevOnly('info', 'Test instance termination initiated', {
        instanceId,
      });
    } catch (error) {
      // Log the error but don't throw - we don't want termination failure to affect validation result
      log2.error(error, 'Failed to terminate test instance', { instanceId });
    }
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
