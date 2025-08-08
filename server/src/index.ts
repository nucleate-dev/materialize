import Fastify from 'fastify';
import { FastifyInstance } from 'fastify';
import autoLoad from '@fastify/autoload';
import { join } from 'path';

// Import configuration
import config from './config/environment';

const fastify: FastifyInstance = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    }),
  },
});

const start = async (): Promise<void> => {
  try {
    // Register environment plugin first
    await fastify.register(require('@fastify/env'), {
      confKey: 'config',
      schema: {
        type: 'object',
        required: ['PORT', 'NODE_ENV'],
        properties: {
          PORT: {
            type: 'string',
            default: '3001'
          },
          NODE_ENV: {
            type: 'string',
            default: 'development'
          },
          SUPABASE_URL: {
            type: 'string'
          },
          SUPABASE_ANON_KEY: {
            type: 'string'
          },
          SUPABASE_SERVICE_ROLE_KEY: {
            type: 'string'
          }
        }
      }
    });

    // Register plugins
    await fastify.register(autoLoad, {
      dir: join(__dirname, 'plugins'),
    });

    // Register routes
    await fastify.register(autoLoad, {
      dir: join(__dirname, 'routes'),
    });

    // Health check route
    fastify.get('/health', async (request, reply) => {
      return { 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV
      };
    });

    // Start server
    await fastify.listen({
      port: config.PORT,
      host: config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
    });

    console.log(`🚀 Server ready at http://${config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'}:${config.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  await fastify.close();
  process.exit(0);
});

start();