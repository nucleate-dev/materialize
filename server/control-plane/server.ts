import { AutoScalingClient } from '@aws-sdk/client-auto-scaling';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ECSClient } from '@aws-sdk/client-ecs';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import cors from '@fastify/cors';
import { GlideClient } from '@valkey/valkey-glide';
import 'dotenv/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import { InternalCacheManagementService } from './internal-services/InternalCacheManagementService.js';
import { InternalCleanupServiceManagement } from './internal-services/InternalCleanupServiceManagement.js';
import { InternalControlPlaneDevelopmentService } from './internal-services/InternalControlPlaneDevelopmentService.js';
import { InternalProductionDeploymentService } from './internal-services/InternalProductionDeploymentService.js';
import { SystemLogger, genRequestIds } from './loggers/SystemLogger.js';
import { CleanupService } from './services/cleanup/CleanupService.js';
import { DevelopmentServerService } from './services/DevelopmentServerService.js';
import { StripeManagementService } from './services/StripeManagementService.js';
import { PrototypeDeploymentService } from './services/PrototypeDeploymentService.js';
import { DispatcherService } from './services/dispatcher/DispatcherService.js';
import { IdleContainerAllocationSystemService } from './services/idle-container-allocation-system/IdleContainerAllocationSystemService.js';
import { OrchestrationService } from './services/orchestration/OrchestrationService.js';
import { PrototypeManagementService } from './services/prototype-management/PrototypeManagementService.js';
import { PostHogLogger } from './loggers/PostHogLogger.js';
import { PostHog } from 'posthog-node';

// Extend FastifyRequest to include our custom loggers
declare module 'fastify' {
  interface FastifyRequest {
    log2: SystemLogger;
    posthogLogger: PostHogLogger;
  }
}

export const posthog = new PostHog(process.env.POSTHOG_KEY!, {
  host: process.env.POSTHOG_HOST!,
});

export const baseLogger = new SystemLogger({
  service: 'control-plane',
  env: process.env.NODE_ENV || 'development',
  metricNamespace: 'Materialize/Service',
  redactKeys: ['authorization', 'cookie', 'x-api-key'],
  posthog,
});

export const posthogLogger = new PostHogLogger({
  posthog,
  context: {
    server: 'control-plane',
    env: process.env.NODE_ENV || 'development',
  },
});

// Initialize clients
const initializeClients = async (): Promise<{
  cacheClient: GlideClient;
  ecsClient: ECSClient;
  ec2Client: EC2Client;
  autoScalingClient: AutoScalingClient;
  s3Client: S3Client;
  stsClient: STSClient;
}> => {
  const ecsClient = new ECSClient({
    region: process.env.AWS_REGION!,
  });

  const ec2Client = new EC2Client({
    region: process.env.AWS_REGION!,
  });

  const autoScalingClient = new AutoScalingClient({
    region: process.env.AWS_REGION!,
  });

  const cacheClient = await GlideClient.createClient({
    addresses: [
      {
        host: process.env.CACHE_HOST!,
        port: parseInt(process.env.CACHE_PORT!),
      },
    ],
    useTLS: true,
    credentials: {
      username: process.env.CACHE_USERNAME!,
      password: process.env.CACHE_PASSWORD!,
    },
    clientName: 'control-plane',
    requestTimeout: 2000,
  });
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
  });
  const stsClient = new STSClient({ region: process.env.AWS_REGION });

  return {
    cacheClient,
    ecsClient,
    ec2Client,
    autoScalingClient,
    s3Client,
    stsClient,
  };
};

const fastify = Fastify({
  logger: true,
  disableRequestLogging: true,
  bodyLimit: 20 * 1024 * 1024, // 20MB
});
fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-internal-signature',
    'x-internal-timestamp',
    'x-orchestration-token',
  ],
});

fastify.addHook('onRequest', async (req) => {
  const { requestId, traceId } = genRequestIds(
    req.headers as Record<string, string | string[] | undefined>,
  );
  req.log2 = baseLogger.child({
    requestId,
    traceId,
    route: req.routeOptions?.url,
    method: req.method,
  });
  req.posthogLogger = posthogLogger.child({
    requestId,
    traceId,
    route: req.routeOptions?.url,
    method: req.method,
  });
});

let dispatcherService: DispatcherService;
let cleanupService: CleanupService;
let idleContainerAllocationSystemService: IdleContainerAllocationSystemService;
let stripeManagementService: StripeManagementService;
let deploymentService: PrototypeDeploymentService;
let prototypeManagementService: PrototypeManagementService;
let developmentServerService: DevelopmentServerService;
let orchestrationService: OrchestrationService;
let internalToolsService: InternalCacheManagementService;
let internalDevServerManagementService: InternalControlPlaneDevelopmentService;
let internalProductionDeploymentService: InternalProductionDeploymentService;
let internalCleanupServiceManagement: InternalCleanupServiceManagement;
let cache: GlideClient;

// Health check
fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const result = await cache.ping();
    if (result === 'PONG') {
      return reply.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
      });
    } else {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: `Cache ping returned: ${result}`,
      });
    }
  } catch (error) {
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start server
const start = async (): Promise<void> => {
  try {
    // Initialize clients first
    const {
      cacheClient,
      ecsClient,
      ec2Client,
      autoScalingClient,
      s3Client,
      stsClient,
    } = await initializeClients();

    cache = cacheClient;

    // Create cleanup service with cache and ECS client
    cleanupService = new CleanupService(cacheClient, ecsClient);

    // Create idle container allocation system service
    idleContainerAllocationSystemService =
      new IdleContainerAllocationSystemService({
        cacheClient: cacheClient,
        ecsClient: ecsClient,
        stsClient: stsClient,
        log2: baseLogger,
      });

    // Create dispatcher service with initialized clients
    dispatcherService = new DispatcherService(
      cacheClient,
      idleContainerAllocationSystemService,
      baseLogger,
    );

    // Create stripe management service and register routes
    stripeManagementService = new StripeManagementService();
    stripeManagementService.registerRoutes(fastify);

    // Create deployment service and register routes
    deploymentService = new PrototypeDeploymentService();
    deploymentService.registerRoutes(fastify);

    // Create prototype management service and register routes
    prototypeManagementService = new PrototypeManagementService(
      fastify,
      s3Client,
      cacheClient,
      dispatcherService,
      cleanupService,
    );
    prototypeManagementService.registerRoutes(fastify);

    // Create development server service and register routes
    developmentServerService = new DevelopmentServerService(dispatcherService);
    developmentServerService.registerRoutes(fastify);

    // Create orchestration service and register routes
    orchestrationService = new OrchestrationService(
      fastify,
      cacheClient,
      baseLogger,
    );
    orchestrationService.registerRoutes(fastify);

    // Create internal tools service and register routes
    internalToolsService = new InternalCacheManagementService(
      cacheClient,
      fastify,
    );
    internalToolsService.registerRoutes(fastify);

    // Create internal dev server management service and register routes
    internalDevServerManagementService =
      new InternalControlPlaneDevelopmentService(ec2Client);
    internalDevServerManagementService.registerRoutes(fastify);

    // Create internal production deployment service and register routes
    internalProductionDeploymentService =
      new InternalProductionDeploymentService(
        ec2Client,
        autoScalingClient,
        fastify,
        idleContainerAllocationSystemService,
      );
    internalProductionDeploymentService.registerRoutes(fastify);

    // Create internal cleanup service management and register routes
    internalCleanupServiceManagement = new InternalCleanupServiceManagement(
      fastify,
      cacheClient,
      cleanupService,
    );
    internalCleanupServiceManagement.registerRoutes(fastify);

    await fastify.listen({
      port: 3000,
      host: '0.0.0.0',
    });
    fastify.log.info('Control plane server started successfully');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

const close = async (): Promise<void> => {
  fastify.log.info('Shutting down...');
  try {
    // Stop cleanup services
    if (cleanupService) {
      cleanupService.stopCleanupServices();
    }
    // Stop idle container allocation system service
    if (idleContainerAllocationSystemService) {
      idleContainerAllocationSystemService.shutdown();
    }
    await fastify.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

start();
