import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';
import { takeScreenshotsOfKilledBuilds } from '../services/cleanup/screenshotUtils.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase.js';
import { GlideClient } from '@valkey/valkey-glide';
import { CleanupService } from '../services/cleanup/CleanupService.js';
import { CACHE_KEYS } from '../types/InternalTypes.js';
import { hgetallAsActiveBuild } from '../utils/cacheInteractionUtils.js';

interface TakeScreenshotRequestBody {
  prototype_id: string;
}

interface ForceCleanBuildRequestBody {
  prototype_id: string;
}

export class InternalCleanupServiceManagement {
  private fastifyApp: FastifyInstance;
  private supabaseServiceRole: SupabaseClient<Database>;
  private cache: GlideClient;
  private cleanupService: CleanupService;

  constructor(
    fastifyApp: FastifyInstance,
    cache: GlideClient,
    cleanupService: CleanupService,
  ) {
    this.fastifyApp = fastifyApp;
    this.cache = cache;
    this.cleanupService = cleanupService;
    this.supabaseServiceRole = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  // Register routes with Fastify
  public registerRoutes(app: FastifyInstance): void {
    // POST /internal/cleanup/take-prototype-screenshot - Take screenshot of a specific prototype
    app.post(
      '/internal/cleanup/take-prototype-screenshot',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Take a screenshot of a specific prototype build (requires internal tools authentication)',
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
          body: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: {
                type: 'string',
                description: 'The prototype ID to take a screenshot of',
              },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                prototype_id: { type: 'string' },
              },
            },
            400: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: { type: 'string' },
              },
            },
            500: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: { type: 'string' },
              },
            },
          },
        },
      },
      this.takePrototypeScreenshot.bind(this),
    );

    // POST /internal/cleanup/force-clean-no-build - Force clean a build without waiting for successful build
    app.post(
      '/internal/cleanup/force-clean-no-build',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Force clean a build for a specific prototype without checking idle timeout or waiting for successful build (requires internal tools authentication)',
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
          body: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: {
                type: 'string',
                description: 'The prototype ID to force clean',
              },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                prototype_id: { type: 'string' },
                build_id: { type: 'string' },
              },
            },
            400: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: { type: 'string' },
              },
            },
            404: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: { type: 'string' },
              },
            },
            500: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: { type: 'string' },
              },
            },
          },
        },
      },
      this.forceCleanNoBuild.bind(this),
    );
  }

  // Take screenshot of a specific prototype
  private async takePrototypeScreenshot(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const log = request.log2;

    try {
      const { prototype_id } = request.body as TakeScreenshotRequestBody;

      if (!prototype_id) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: 'prototype_id is required',
        });
      }

      if (
        typeof prototype_id !== 'string' ||
        prototype_id.trim().length === 0
      ) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: 'prototype_id must be a non-empty string',
        });
      }

      log.info('Taking screenshot for prototype via internal tools', {
        prototype_id,
      });

      // Call the public method from CleanupService to take screenshots
      await takeScreenshotsOfKilledBuilds(
        [prototype_id.trim()],
        request.log2,
        this.supabaseServiceRole,
      );

      log.info('Screenshot taken successfully for prototype', {
        prototype_id,
      });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        message: `Screenshot taken successfully for prototype ${prototype_id}`,
        prototype_id: prototype_id.trim(),
      });
    } catch (error) {
      log.error(error, 'Failed to take prototype screenshot', {
        prototype_id: (request.body as TakeScreenshotRequestBody)?.prototype_id,
      });

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to take prototype screenshot',
      });
    }
  }

  // Force clean a build without checking idle timeout or waiting for successful build
  private async forceCleanNoBuild(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const log = request.log2;

    try {
      const { prototype_id } = request.body as ForceCleanBuildRequestBody;

      if (!prototype_id) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: 'prototype_id is required',
        });
      }

      if (
        typeof prototype_id !== 'string' ||
        prototype_id.trim().length === 0
      ) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: 'prototype_id must be a non-empty string',
        });
      }

      const trimmedPrototypeId = prototype_id.trim();

      log.info('Force cleaning build for prototype via internal tools', {
        prototype_id: trimmedPrototypeId,
      });

      // Get the current build ID for this prototype
      const currentBuildIdRaw = await this.cache.get(
        CACHE_KEYS.protoCurrentBuild(trimmedPrototypeId),
      );

      if (!currentBuildIdRaw) {
        log.warn('No active build found for prototype', {
          prototype_id: trimmedPrototypeId,
        });
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: `No active build found for prototype ${trimmedPrototypeId}`,
        });
      }

      const currentBuildId = currentBuildIdRaw.toString();

      log.info('Found active build for prototype', {
        prototype_id: trimmedPrototypeId,
        build_id: currentBuildId,
      });

      // Get the build data from cache
      const buildKey = CACHE_KEYS.activeBuild(currentBuildId);
      const build = await hgetallAsActiveBuild(this.cache, buildKey);

      if (!build) {
        log.error(
          new Error('Build data not found in cache'),
          'Build ID exists in current pointer but data not found in cache',
          {
            prototype_id: trimmedPrototypeId,
            build_id: currentBuildId,
            build_key: buildKey,
          },
        );
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: `Build data not found for build ${currentBuildId}`,
        });
      }

      // Force clean the build without waiting for successful build
      log.info('Calling cleanupSingleBuild with shouldWaitForSuccessfulBuild=false', {
        prototype_id: trimmedPrototypeId,
        build_id: currentBuildId,
      });

      const cleanupResult = await this.cleanupService.cleanupSingleBuild(
        build,
        currentBuildId,
        buildKey,
        false, // shouldWaitForSuccessfulBuild = false
      );

      if (cleanupResult.success) {
        log.info('Successfully force cleaned build for prototype', {
          prototype_id: trimmedPrototypeId,
          build_id: currentBuildId,
        });

        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          message: `Successfully force cleaned build ${currentBuildId} for prototype ${trimmedPrototypeId}`,
          prototype_id: trimmedPrototypeId,
          build_id: currentBuildId,
        });
      } else {
        log.error(
          new Error(cleanupResult.error || 'Unknown cleanup error'),
          'Failed to force clean build',
          {
            prototype_id: trimmedPrototypeId,
            build_id: currentBuildId,
            build_in_progress: cleanupResult.buildInProgress,
          },
        );

        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error:
            cleanupResult.error ||
            `Failed to force clean build ${currentBuildId}`,
        });
      }
    } catch (error) {
      log.error(error, 'Failed to force clean build', {
        prototype_id: (request.body as ForceCleanBuildRequestBody)?.prototype_id,
      });

      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to force clean build',
      });
    }
  }
}
