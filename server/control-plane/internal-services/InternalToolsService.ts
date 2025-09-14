import { GlideClient } from '@valkey/valkey-glide';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';

export class InternalToolsService {
  private cache: GlideClient;
  private fastifyApp: FastifyInstance;

  constructor(cache: GlideClient, fastifyApp: FastifyInstance) {
    this.cache = cache;
    this.fastifyApp = fastifyApp;
  }

  // Register routes with Fastify
  public registerRoutes(app: FastifyInstance): void {
    this.fastifyApp = app;

    // POST /internal/cache/clear - Clear all cache
    app.post(
      '/internal/cache/clear',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description: 'Clear all cache data (requires internal tools authentication)',
          tags: ['internal-tools'],
          headers: {
            type: 'object',
            required: ['x-internal-signature', 'x-internal-timestamp'],
            properties: {
              'x-internal-signature': { type: 'string', description: 'HMAC-SHA256 signature' },
              'x-internal-timestamp': { type: 'string', description: 'Unix timestamp' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                timestamp: { type: 'string' },
                durationMs: { type: 'number' },
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
      this.handleClearCache.bind(this),
    );

    // GET /internal/cache/stats - Get cache statistics
    app.get(
      '/internal/cache/stats',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description: 'Get cache statistics and information (requires internal tools authentication)',
          tags: ['internal-tools'],
          headers: {
            type: 'object',
            required: ['x-internal-signature', 'x-internal-timestamp'],
            properties: {
              'x-internal-signature': { type: 'string', description: 'HMAC-SHA256 signature' },
              'x-internal-timestamp': { type: 'string', description: 'Unix timestamp' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                stats: {
                  type: 'object',
                  properties: {
                    totalKeys: { type: 'number' },
                    activeBuilds: { type: 'number' },
                    prototypeBuilds: { type: 'number' },
                    currentBuilds: { type: 'number' },
                    keyBreakdown: {
                      type: 'object',
                      additionalProperties: { type: 'number' },
                    },
                  },
                },
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
      this.handleGetCacheStats.bind(this),
    );
  }

  // Route handler for clearing cache
  private async handleClearCache(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const startTime = Date.now();
    request.log2.info('Starting cache clear operation');

    try {
      // Clear all cache data using FLUSHALL command
      await this.cache.flushall();

      const duration = Date.now() - startTime;
      request.log2.info('Cache cleared successfully', {
        durationMs: duration,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        message: 'All cache data cleared successfully',
        timestamp: new Date().toISOString(),
        durationMs: duration,
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to clear cache');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to clear cache: ${e.message}`,
      });
    }
  }

  // Route handler for getting cache statistics
  private async handleGetCacheStats(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    request.log2.info('Fetching cache statistics');

    try {
      // Get all keys to count them by pattern
      const allKeys = await this.scanAllKeys(request.log2);

      // Count different types of keys
      const activeBuilds = allKeys.filter((key) =>
        key.startsWith('active_build:'),
      ).length;
      const prototypeBuilds = allKeys.filter((key) =>
        key.startsWith('proto_builds:'),
      ).length;
      const currentBuilds = allKeys.filter((key) =>
        key.startsWith('proto_current_build:'),
      ).length;

      const stats = {
        totalKeys: allKeys.length,
        activeBuilds,
        prototypeBuilds,
        currentBuilds,
        keyBreakdown: {
          'active_build:*': activeBuilds,
          'proto_builds:*': prototypeBuilds,
          'proto_current_build:*': currentBuilds,
          other:
            allKeys.length - activeBuilds - prototypeBuilds - currentBuilds,
        },
      };

      request.log2.consoleLogDevOnly('info', 'Cache statistics retrieved', {
        stats,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to get cache statistics');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to get cache statistics: ${e.message}`,
      });
    }
  }

  // Helper method to scan all keys in the cache
  private async scanAllKeys(log2: SystemLogger): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      try {
        const result = (await this.cache.customCommand([
          'SCAN',
          cursor,
          'COUNT',
          '1000',
        ])) as [string, string[]];

        cursor = result[0];
        keys.push(...result[1]);
      } catch (error) {
        log2.error(error, 'Error scanning keys');
        break;
      }
    } while (cursor !== '0');

    return keys;
  }
}
