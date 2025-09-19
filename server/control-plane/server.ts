import 'dotenv/config';
import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { DispatcherService } from './services/DispatcherService.js';
import { CleanupService } from './services/CleanupService.js';
import { StripeManagementService } from './services/StripeManagementService.js';
import { PrototypeManagementService } from './services/PrototypeManagementService.js';
import { DevelopmentServerService } from './services/DevelopmentServerService.js';
import { ChatService } from './services/ChatService.js';
import { InternalCacheManagementService } from './internal-services/InternalCacheManagementService.js';
import { InternalDevServerManagementService } from './internal-services/InternalDevServerManagementService.js';
import { InternalProductionDeploymentService } from './internal-services/InternalProductionDeploymentService.js';
import { InternalCleanupServiceManagement } from './internal-services/InternalCleanupServiceManagement.js';
import { SystemLogger, genRequestIds } from './loggers/SystemLogger.js';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EC2Client } from '@aws-sdk/client-ec2';
import { AutoScalingClient } from '@aws-sdk/client-auto-scaling';
import { GlideClient } from '@valkey/valkey-glide';
import { S3Client } from '@aws-sdk/client-s3';

// Extend FastifyRequest to include our custom logger
declare module 'fastify' {
  interface FastifyRequest {
    log2: SystemLogger;
  }
}

export const baseLogger = new SystemLogger({
  service: 'control-plane',
  env: process.env.NODE_ENV || 'development',
  metricNamespace: 'Materialize/Service',
  redactKeys: ['authorization', 'cookie', 'x-api-key'],
});

// Initialize clients
const initializeClients = async (): Promise<{
  cache: GlideClient;
  ecsClient: ECSClient;
  ec2Client: EC2Client;
  autoScalingClient: AutoScalingClient;
  s3Client: S3Client;
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

  const cache = await GlideClient.createClient({
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

  return { cache, ecsClient, ec2Client, autoScalingClient, s3Client };
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
});

let dispatcherService: DispatcherService;
let cleanupService: CleanupService;
let stripeManagementService: StripeManagementService;
let prototypeManagementService: PrototypeManagementService;
let developmentServerService: DevelopmentServerService;
let chatService: ChatService;
let internalToolsService: InternalCacheManagementService;
let internalDevServerManagementService: InternalDevServerManagementService;
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
      cache: cacheClient,
      ecsClient,
      ec2Client,
      autoScalingClient,
      s3Client,
    } = await initializeClients();

    // Assign to global variables
    cache = cacheClient;

    // Create dispatcher service with initialized clients and register routes
    dispatcherService = new DispatcherService(cache, ecsClient, fastify);
    dispatcherService.registerRoutes(fastify);

    // Create cleanup service with cache and ECS client
    cleanupService = new CleanupService(cache, ecsClient);

    // Create stripe management service and register routes
    stripeManagementService = new StripeManagementService();
    stripeManagementService.registerRoutes(fastify);

    // Create prototype management service and register routes
    prototypeManagementService = new PrototypeManagementService(
      fastify,
      s3Client,
    );
    prototypeManagementService.registerRoutes(fastify);

    // Create development server service and register routes
    developmentServerService = new DevelopmentServerService(fastify);
    developmentServerService.registerRoutes(fastify);

    // Create chat service and register routes
    chatService = new ChatService(fastify);
    chatService.registerRoutes(fastify);

    // Create internal tools service and register routes
    internalToolsService = new InternalCacheManagementService(cache, fastify);
    internalToolsService.registerRoutes(fastify);

    // Create internal dev server management service and register routes
    internalDevServerManagementService = new InternalDevServerManagementService(ec2Client, ecsClient, fastify);
    internalDevServerManagementService.registerRoutes(fastify);

    // Create internal production deployment service and register routes
    internalProductionDeploymentService = new InternalProductionDeploymentService(ec2Client, autoScalingClient, fastify);
    internalProductionDeploymentService.registerRoutes(fastify);

    // Create internal cleanup service management and register routes
    internalCleanupServiceManagement = new InternalCleanupServiceManagement(cleanupService, fastify);
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
    await fastify.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

start();
