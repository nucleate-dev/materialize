import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { DispatcherService } from './services/DispatcherService.js';
import { CleanupService } from './services/CleanupService.js';
import { StripeManagementService } from './services/StripeManagementService.js';
import { ECSClient } from '@aws-sdk/client-ecs';
import { GlideClient } from '@valkey/valkey-glide';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize clients
const initializeClients = async (): Promise<{
  cache: GlideClient;
  ecsClient: ECSClient;
}> => {
  const ecsClient = new ECSClient({
    region: process.env.AWS_REGION!,
  });

  // Initialize Valkey client
  const endpointHost = process.env.CACHE_HOST!;
  const port = parseInt(process.env.CACHE_PORT!);
  const username = process.env.CACHE_USERNAME!;
  const password = process.env.CACHE_PASSWORD!;

  const cache = await GlideClient.createClient({
    addresses: [{ host: endpointHost, port }],
    useTLS: true,
    credentials: {
      username,
      password,
    },
    clientName: 'control-plane',
    requestTimeout: 2000,
  });

  console.log('Valkey cache initialized successfully');

  return { cache, ecsClient };
};

const fastify = Fastify({
  logger: true,
  bodyLimit: 20 * 1024 * 1024, // 20MB
});
fastify.register(cors, { origin: true, credentials: true });

let dispatcherService: DispatcherService;
let cleanupService: CleanupService;
let stripeManagementService: StripeManagementService;
let cache: GlideClient;

// Health check
fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const result = await cache.ping();
    if (result === 'PONG') {
      return reply.send({
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

// Clear cache endpoint (for development/testing)
fastify.delete(
  '/cache/clear',
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await cache.flushall();
      fastify.log.info('Cache cleared successfully');
      return reply.send({
        success: true,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      fastify.log.error(e, 'Failed to clear cache:');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: e.message,
      });
    }
  },
);

// Start server
const start = async (): Promise<void> => {
  try {
    // Initialize clients first
    const { cache: cacheClient, ecsClient } = await initializeClients();

    // Assign to global variables
    cache = cacheClient;

    // Create dispatcher service with initialized clients and register routes
    dispatcherService = new DispatcherService(cache, ecsClient);
    dispatcherService.registerRoutes(fastify);

    // Create cleanup service with cache and ECS client
    cleanupService = new CleanupService(cache, ecsClient);

    // Create stripe management service and register routes
    stripeManagementService = new StripeManagementService();
    stripeManagementService.registerRoutes(fastify);

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
