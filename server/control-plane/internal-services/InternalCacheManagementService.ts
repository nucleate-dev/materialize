import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';
import {
  clearAllCacheData,
  getCacheStats,
  getCurrentBuildId,
  getActiveBuildsForPrototype,
  getBuildHistory,
  deleteAllDevBuilds,
  deleteDevBuild,
} from '../utils/cacheInteractionUtils.js';

export class InternalCacheManagementService {
  constructor() {}

  // Register routes with Fastify
  public registerRoutes(app: FastifyInstance): void {
    // POST /internal/cache/clear - Clear all cache
    app.post(
      '/internal/cache/clear',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Clear all cache data (requires internal tools authentication)',
          tags: ['internal-tools'],
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
          description:
            'Get cache statistics and information (requires internal tools authentication)',
          tags: ['internal-tools'],
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
                    idleBuilds: { type: 'number' },
                    developmentKeys: { type: 'number' },
                    keyBreakdown: {
                      type: 'object',
                      additionalProperties: { type: 'number' },
                    },
                    sampleKeys: {
                      type: 'object',
                      properties: {
                        activeBuild: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        prototypeBuild: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        currentBuild: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        other: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        idleBuild: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        development: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
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

    // GET /internal/cache/prototype/:prototypeId - Get prototype build data
    app.get(
      '/internal/cache/prototype/:prototypeId',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Get current active build data for a specific prototype (requires internal tools authentication)',
          tags: ['internal-tools'],
          params: {
            type: 'object',
            properties: {
              prototypeId: { type: 'string' },
            },
            required: ['prototypeId'],
          },
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
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                prototypeId: { type: 'string' },
                currentBuildId: { type: ['string', 'null'] },
                activeBuilds: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      buildId: { type: 'string' },
                      isCurrent: { type: 'boolean' },
                      activeBuild: {
                        type: 'object',
                        properties: {
                          fargate_task_arn: { type: 'string' },
                          fargate_private_ip: { type: 'string' },
                          url: { type: 'string' },
                          status: { type: 'string' },
                          last_touched: { type: 'number' },
                          terminal_tunnel_id: { type: 'string' },
                          terminal_tunnel_hostname: { type: 'string' },
                          orchestration_token: { type: 'string' },
                          clean_attempts: { type: 'number' },
                        },
                      },
                    },
                  },
                },
                buildHistory: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      buildId: { type: 'string' },
                      timestamp: { type: 'number' },
                    },
                  },
                },
                timestamp: { type: 'string' },
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
            404: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                prototypeId: { type: 'string' },
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
      this.handleGetPrototypeBuildData.bind(this),
    );

    // DELETE /internal/cache/development - Clear all development cache keys
    app.delete(
      '/internal/cache/development',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Clear all development:* cache keys (requires internal tools authentication)',
          tags: ['internal-tools'],
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
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                deletedCount: { type: 'number' },
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
      this.handleClearDevelopmentCache.bind(this),
    );

    // DELETE /internal/cache/development/:prototypeId - Clear development cache for specific prototype
    app.delete(
      '/internal/cache/development/:prototypeId',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Clear development cache for a specific prototype (requires internal tools authentication)',
          tags: ['internal-tools'],
          params: {
            type: 'object',
            properties: {
              prototypeId: { type: 'string' },
            },
            required: ['prototypeId'],
          },
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
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                prototypeId: { type: 'string' },
                deleted: { type: 'boolean' },
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
      this.handleClearPrototypeDevelopmentCache.bind(this),
    );
  }

  // Route handler for clearing cache
  private async handleClearCache(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const startTime = Date.now();
    request.log2 = request.log2.child({
      service: 'internal-services',
    });
    request.log2.consoleLogDevOnly('info', 'Starting cache clear operation');

    try {
      await clearAllCacheData();

      const duration = Date.now() - startTime;
      request.log2.consoleLogDevOnly('info', 'Cache cleared successfully', {
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
    request.log2 = request.log2.child({
      service: 'internal-services',
    });
    request.log2.consoleLogDevOnly('info', 'Fetching cache statistics');

    try {
      const rawStats = await getCacheStats();

      const stats = {
        totalKeys:
          rawStats.activeBuilds +
          rawStats.idleContainers +
          rawStats.devBuilds,
        activeBuilds: rawStats.activeBuilds,
        prototypeBuilds: 0,
        currentBuilds: 0,
        idleBuilds: rawStats.idleContainers,
        developmentKeys: rawStats.devBuilds,
        keyBreakdown: {
          'active_build:*': rawStats.activeBuilds,
          'proto:*:builds': 0,
          'proto:*:current': 0,
          'idle_builds:*': rawStats.idleContainers,
          'development:*': rawStats.devBuilds,
          other: 0,
        },
        sampleKeys: {
          activeBuild: [] as string[],
          prototypeBuild: [] as string[],
          currentBuild: [] as string[],
          idleBuild: [] as string[],
          development: [] as string[],
          other: [] as string[],
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

  // Route handler for getting prototype build data
  private async handleGetPrototypeBuildData(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { prototypeId } = request.params as { prototypeId: string };
    request.log2 = request.log2.child({
      service: 'internal-services',
    });
    request.log2.consoleLogDevOnly('info', 'Fetching prototype build data', {
      prototypeId,
    });

    try {
      // Get current build ID
      const currentBuildId = await getCurrentBuildId(prototypeId);

      // Get ALL active builds for this prototype
      const activeBuildsRaw = await getActiveBuildsForPrototype(prototypeId);

      request.log2.consoleLogDevOnly(
        'info',
        'Found active builds for prototype',
        {
          prototypeId,
          foundBuilds: activeBuildsRaw.length,
        },
      );

      // Map to the existing response format
      const allActiveBuilds = activeBuildsRaw.map((entry) => ({
        buildId: entry.buildId,
        activeBuild: entry.build,
        isCurrent: entry.isCurrent,
      }));

      // Get build history
      const buildHistory = await getBuildHistory(prototypeId);

      // If no current build and no builds in history and no active builds, return 404-like response but with 200 status
      if (
        !currentBuildId &&
        buildHistory.length === 0 &&
        allActiveBuilds.length === 0
      ) {
        request.log2.consoleLogDevOnly(
          'info',
          'No build data found for prototype',
          {
            prototypeId,
          },
        );

        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          prototypeId,
          currentBuildId: null,
          activeBuilds: [],
          buildHistory: [],
          timestamp: new Date().toISOString(),
          message: 'No build data found for this prototype',
        });
      }

      request.log2.consoleLogDevOnly(
        'info',
        'Successfully retrieved prototype build data',
        {
          prototypeId,
          currentBuildId,
          totalActiveBuilds: allActiveBuilds.length,
          totalBuildsInHistory: buildHistory.length,
        },
      );

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        prototypeId,
        currentBuildId: currentBuildId || null,
        activeBuilds: allActiveBuilds,
        buildHistory,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to get prototype build data', {
        prototypeId,
      });

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to get prototype build data: ${e.message}`,
      });
    }
  }

  // Route handler for clearing development cache keys
  private async handleClearDevelopmentCache(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const startTime = Date.now();
    request.log2 = request.log2.child({
      service: 'internal-services',
    });
    request.log2.consoleLogDevOnly(
      'info',
      'Starting development cache clear operation',
    );

    try {
      const deletedCount = await deleteAllDevBuilds();

      request.log2.consoleLogDevOnly(
        'info',
        'Found development keys to delete',
        {
          count: deletedCount,
        },
      );

      const duration = Date.now() - startTime;
      request.log2.consoleLogDevOnly(
        'info',
        'Development cache cleared successfully',
        {
          deletedCount,
          durationMs: duration,
        },
      );

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        message: `Cleared ${deletedCount} development cache key${deletedCount !== 1 ? 's' : ''}`,
        deletedCount,
        timestamp: new Date().toISOString(),
        durationMs: duration,
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to clear development cache');

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to clear development cache: ${e.message}`,
      });
    }
  }

  // Route handler for clearing development cache for a specific prototype
  private async handleClearPrototypeDevelopmentCache(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const startTime = Date.now();
    const { prototypeId } = request.params as { prototypeId: string };
    request.log2 = request.log2.child({
      service: 'internal-services',
    });
    request.log2.consoleLogDevOnly(
      'info',
      'Clearing development cache for specific prototype',
      { prototypeId },
    );

    try {
      const deleted = await deleteDevBuild(prototypeId);

      const duration = Date.now() - startTime;
      request.log2.consoleLogDevOnly(
        'info',
        'Development cache cleared for prototype',
        {
          prototypeId,
          deleted,
          durationMs: duration,
        },
      );

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        message: deleted
          ? `Development cache cleared for prototype ${prototypeId}`
          : `No development cache found for prototype ${prototypeId}`,
        prototypeId,
        deleted,
        timestamp: new Date().toISOString(),
        durationMs: duration,
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      request.log2.error(error, 'Failed to clear prototype development cache', {
        prototypeId,
      });

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'Internal Server Error',
        message: `Failed to clear development cache for prototype: ${e.message}`,
      });
    }
  }
}
