import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';
import { takeScreenshotsOfKilledBuilds } from '../services/cleanup/screenshotUtils.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase.js';

interface TakeScreenshotRequestBody {
  prototype_id: string;
}

export class InternalCleanupServiceManagement {
  private fastifyApp: FastifyInstance;
  private supabaseServiceRole: SupabaseClient<Database>;

  constructor(fastifyApp: FastifyInstance) {
    this.fastifyApp = fastifyApp;
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
}
