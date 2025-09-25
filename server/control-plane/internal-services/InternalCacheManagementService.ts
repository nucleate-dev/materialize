import { GlideClient } from '@valkey/valkey-glide';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';
import {
  CACHE_KEYS,
  CACHE_PATTERNS,
  isActiveBuildType,
  type ActiveBuild,
} from '../types/InternalTypes.js';

export class InternalCacheManagementService {
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
    request.log2 = request.log2.child({
      service: 'internal-services',
    });
    request.log2.info('Fetching cache statistics');

    try {
      // Get all keys to count them by pattern
      const allKeys = await this.scanAllKeys(request.log2);

      // Categorize keys by pattern (using correct patterns from CACHE_KEYS)
      const activeBuildKeys = allKeys.filter((key) =>
        key.startsWith('active_build:'),
      );
      const prototypeBuildKeys = allKeys.filter(
        (key) => key.includes(':builds') && key.startsWith('proto:'),
      );
      const currentBuildKeys = allKeys.filter(
        (key) => key.includes(':current') && key.startsWith('proto:'),
      );
      const idleBuildKeys = allKeys.filter((key) =>
        key.startsWith('idle_builds:') && key !== CACHE_KEYS.idleBuildsListKey,
      );
      const otherKeys = allKeys.filter(
        (key) =>
          !key.startsWith('active_build:') &&
          !(key.includes(':builds') && key.startsWith('proto:')) &&
          !(key.includes(':current') && key.startsWith('proto:')) &&
          !key.startsWith('idle_builds:'),
      );

      const stats = {
        totalKeys: allKeys.length,
        activeBuilds: activeBuildKeys.length,
        prototypeBuilds: prototypeBuildKeys.length,
        currentBuilds: currentBuildKeys.length,
        idleBuilds: idleBuildKeys.length,
        keyBreakdown: {
          'active_build:*': activeBuildKeys.length,
          'proto:*:builds': prototypeBuildKeys.length,
          'proto:*:current': currentBuildKeys.length,
          'idle_builds:*': idleBuildKeys.length,
          other: otherKeys.length,
        },
        sampleKeys: {
          activeBuild: activeBuildKeys.slice(0, 5),
          prototypeBuild: prototypeBuildKeys.slice(0, 5),
          currentBuild: currentBuildKeys.slice(0, 5),
          idleBuild: idleBuildKeys.slice(0, 5),
          other: otherKeys.slice(0, 5),
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
    request.log2.info('Fetching prototype build data', { prototypeId });

    try {
      // Get current build ID
      const currentBuildId = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(prototypeId),
      );

      // Get ALL active builds for this prototype by scanning for build IDs that contain the prototype ID
      const allActiveBuilds: Array<{
        buildId: string;
        activeBuild: ActiveBuild;
        isCurrent: boolean;
      }> = [];

      // Scan all active_build:* keys to find ones for this prototype
      const allActiveBuildKeys = await this.scanAllKeys(request.log2);
      const prototypeActiveBuildKeys = allActiveBuildKeys.filter((key) =>
        key.startsWith('active_build:') && key.includes(`build_${prototypeId}_`)
      );

      request.log2.consoleLogDevOnly('info', 'Found active build keys for prototype', {
        prototypeId,
        foundKeys: prototypeActiveBuildKeys.length,
        keys: prototypeActiveBuildKeys,
      });

      // Get the data for each active build
      for (const buildKey of prototypeActiveBuildKeys) {
        try {
          const activeBuild = await this.hgetallAsActiveBuild(buildKey);
          if (activeBuild) {
            if (isActiveBuildType(activeBuild)) {
              const buildId = buildKey.replace('active_build:', '');
              allActiveBuilds.push({
                buildId,
                activeBuild,
                isCurrent: buildId === currentBuildId,
              });
            } else {
              request.log2.warn('Invalid active build data found in cache', {
                prototypeId,
                buildKey,
              });
            }
          }
        } catch (error) {
          request.log2.warn('Failed to parse active build data', {
            prototypeId,
            buildKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Get all builds for this prototype from the ZSET
      const allBuilds: { buildId: string; timestamp: number }[] = [];
      try {
        const allBuildsResult = await this.cache.customCommand([
          'ZRANGE',
          CACHE_KEYS.protoBuilds(prototypeId),
          '0',
          '-1',
          'WITHSCORES',
        ]);

        if (Array.isArray(allBuildsResult)) {
          // ZRANGE WITHSCORES returns [member1, score1, member2, score2, ...]
          for (let i = 0; i < allBuildsResult.length; i += 2) {
            if (i + 1 < allBuildsResult.length) {
              const buildIdRaw = allBuildsResult[i];
              const timestampRaw = allBuildsResult[i + 1];

              // Handle both simple string/number responses and complex object responses
              const buildId = typeof buildIdRaw === 'object' && buildIdRaw !== null && 'key' in buildIdRaw
                ? String((buildIdRaw as { key: string }).key)
                : String(buildIdRaw);

              const timestampValue = typeof timestampRaw === 'object' && timestampRaw !== null && 'value' in timestampRaw
                ? (timestampRaw as { value: number }).value
                : timestampRaw;

              const timestamp = parseFloat(String(timestampValue));

              if (!isNaN(timestamp)) {
                allBuilds.push({
                  buildId,
                  timestamp,
                });
              } else {
                request.log2.warn('Invalid timestamp found in builds ZSET', {
                  prototypeId,
                  buildId,
                  timestampRaw,
                  parsedTimestamp: timestamp,
                });
              }
            }
          }
        }
      } catch (error) {
        request.log2.warn('Failed to fetch builds ZSET, continuing without build history', {
          prototypeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Sort by timestamp descending (newest first)
      allBuilds.sort((a, b) => b.timestamp - a.timestamp);

      // Sort active builds by last_touched descending (most recent first)
      allActiveBuilds.sort((a, b) => b.activeBuild.last_touched - a.activeBuild.last_touched);

      // If no current build and no builds in history and no active builds, return 404-like response but with 200 status
      if (!currentBuildId && allBuilds.length === 0 && allActiveBuilds.length === 0) {
        request.log2.info('No build data found for prototype', {
          prototypeId,
        });

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

      request.log2.info('Successfully retrieved prototype build data', {
        prototypeId,
        currentBuildId,
        totalActiveBuilds: allActiveBuilds.length,
        totalBuildsInHistory: allBuilds.length,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        prototypeId,
        currentBuildId: currentBuildId || null,
        activeBuilds: allActiveBuilds,
        buildHistory: allBuilds,
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

  private async hgetallAsActiveBuild(key: string): Promise<ActiveBuild | null> {
    const raw = await this.cache.hgetall(key);

    if (!raw || raw.length === 0) return null;

    const obj = Object.fromEntries(
      raw.map(
        (e: {
          field: { toString(): string };
          value: { toString(): string };
        }) => [e.field.toString(), e.value.toString()],
      ),
    ) as Record<string, string>;

    return {
      fargate_task_arn: obj.fargate_task_arn,
      fargate_private_ip: obj.fargate_private_ip,
      url: obj.url,
      status: obj.status as ActiveBuild['status'],
      last_touched: parseInt(obj.last_touched, 10),
    };
  }
}
