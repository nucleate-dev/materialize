import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  type CheckSlugSuccessResponse,
  type CheckSlugErrorResponse,
  type DeployRequestBody,
  type DeploySuccessResponse,
  type DeployErrorResponse,
  type APIResponse,
  HTTP_STATUS,
} from '../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../utils/prototypeAuth.js';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import { posthog } from '../server.js';

type PrototypeVisibility = Database['public']['Enums']['visibility_level'];

const normalizePrototypeVisibility = (
  visibility?: string | null,
): PrototypeVisibility => {
  const lower = visibility?.toString().toLowerCase();
  if (lower === 'private' || lower === 'self') {
    return 'SELF';
  }
  if (lower === 'team_subset' || lower === 'unlisted') {
    return 'TEAM_SUBSET';
  }
  if (lower === 'team') {
    return 'TEAM';
  }
  return 'PUBLIC';
};

const isValidVisibility = (
  visibility?: string,
): visibility is PrototypeVisibility =>
  visibility === 'PUBLIC' ||
  visibility === 'SELF' ||
  visibility === 'TEAM_SUBSET' ||
  visibility === 'TEAM';

const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 64;
const SLUG_RULES = {
  min: MIN_SLUG_LENGTH,
  max: MAX_SLUG_LENGTH,
};

// Initialize Supabase client with service role key for admin access
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export class PrototypeDeploymentService {
  private appsBaseUrl: string;

  constructor() {
    this.appsBaseUrl = (
      process.env.APPS_BASE_URL ??
      process.env.APPS_HOST ??
      'https://apps.nucleate.dev'
    ).replace(/\/$/, '');
  }

  /**
   * Register routes with Fastify
   */
  public registerRoutes(app: FastifyInstance): void {
    // GET /deployments/check-slug
    app.get<{ Querystring: { slug: string; exclude_prototype_id?: string } }>(
      '/deployments/check-slug',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['slug'],
            properties: {
              slug: { type: 'string' },
              exclude_prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleCheckSlug.bind(this),
    );

    // POST /deployments/deploy
    app.post<{ Body: DeployRequestBody }>(
      '/deployments/deploy',
      {
        schema: {
          body: {
            type: 'object',
            required: ['prototype_id', 'slug'],
            properties: {
              prototype_id: { type: 'string' },
              slug: { type: 'string' },
              visibility: {
                type: 'string',
                enum: ['PUBLIC', 'SELF', 'TEAM_SUBSET', 'TEAM'],
              },
            },
          },
        },
      },
      this.handleDeploy.bind(this),
    );
  }

  /**
   * API Route Handler for checking slug availability.
   *
   * This function handles HTTP GET requests to check if a slug is available
   * for use in deployments. It validates the slug format and checks for
   * uniqueness in the database.
   *
   * @param {FastifyRequest} request - The incoming request with slug query parameter
   * @param {FastifyReply} reply - The outgoing response object
   *
   * @returns APIResponse with slug availability information
   */
  private async handleCheckSlug(
    request: FastifyRequest<{
      Querystring: { slug: string; exclude_prototype_id?: string };
    }>,
    reply: FastifyReply,
  ): Promise<APIResponse<CheckSlugSuccessResponse, CheckSlugErrorResponse>> {
    const { slug: rawSlug, exclude_prototype_id } = request.query;
    const slug = this.normalizeSlug(rawSlug);

    if (!slug) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          available: false,
          message: 'Slug is required',
        },
      });
    }

    if (!this.isValidSlug(slug)) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          available: false,
          message: `Slug must be ${SLUG_RULES.min}-${SLUG_RULES.max} characters using lowercase letters, numbers, or hyphens.`,
        },
      });
    }

    try {
      let query = supabase.from('prototypes').select('id').eq('slug', slug);

      if (exclude_prototype_id) {
        query = query.neq('id', exclude_prototype_id);
      }

      const { data, error } = await query.limit(1);

      if (error) {
        request.log2.error(error, 'Failed to check slug availability');
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            available: false,
            message: 'Unable to check slug availability',
          },
        });
      }

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          available: data.length === 0,
          slug,
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, 'Error checking slug availability');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          available: false,
          message: 'Unable to check slug availability',
        },
      });
    }
  }

  /**
   * API Route Handler for deploying a prototype.
   *
   * This function handles HTTP POST requests to deploy a prototype with
   * a custom slug and visibility setting. It validates ownership, slug
   * uniqueness, and updates the prototype deployment status.
   *
   * @param {FastifyRequest} request - The incoming request with deployment details
   * @param {FastifyReply} reply - The outgoing response object
   *
   * @returns APIResponse with deployment information including URL
   */
  private async handleDeploy(
    request: FastifyRequest<{ Body: DeployRequestBody }>,
    reply: FastifyReply,
  ): Promise<APIResponse<DeploySuccessResponse, DeployErrorResponse>> {
    const {
      prototype_id,
      slug: rawSlug,
      visibility: rawVisibility,
    } = request.body;

    if (!prototype_id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          error: 'Missing parameter',
          message: 'prototype_id is required',
        },
      });
    }

    const token = request.headers.authorization?.split(' ')[1];
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      token,
      request.log2,
    );

    if (authResult === null || !authResult.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'Access denied for this prototype',
        },
      });
    }

    const { user, prototype, isServiceRole } = authResult;

    if (!user) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'Invalid token',
        },
      });
    }

    const userId = user.id;

    request.log2 = request.log2.child({
      userId: userId ?? (isServiceRole ? 'service-role' : 'unknown'),
    });

    if (!isServiceRole) {
      // Check feature flag for deployment
      const isDeployFeatureEnabled = await posthog.isFeatureEnabled(
        'deploy-app-for-public-viewing',
        userId,
      );

      if (!isDeployFeatureEnabled) {
        request.log2.warn('Deployment feature not enabled for user', {
          user_id: userId,
        });
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          data: null,
          error: {
            error: 'Feature not available',
            message: 'Deployment feature is not enabled for your account',
          },
        });
      }
    }

    const normalizedSlug = this.normalizeSlug(rawSlug);

    if (!normalizedSlug) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          error: 'Missing parameter',
          message: 'Slug is required',
        },
      });
    }

    if (!this.isValidSlug(normalizedSlug)) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          error: 'Invalid slug',
          message: `Slug must be ${SLUG_RULES.min}-${SLUG_RULES.max} characters using lowercase letters, numbers, or hyphens.`,
        },
      });
    }

    const requestedVisibility = rawVisibility
      ? normalizePrototypeVisibility(rawVisibility)
      : ('PUBLIC' as PrototypeVisibility);
    const visibility = isValidVisibility(requestedVisibility)
      ? requestedVisibility
      : ('PUBLIC' as PrototypeVisibility);

    try {
      // Check slug uniqueness
      const { data: slugMatches, error: slugCheckError } = await supabase
        .from('prototypes')
        .select('id')
        .eq('slug', normalizedSlug)
        .neq('id', prototype.id)
        .limit(1);

      if (slugCheckError) {
        request.log2.error(
          slugCheckError,
          'Failed to validate slug uniqueness',
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'Validation failed',
            message: 'Unable to validate slug uniqueness',
          },
        });
      }

      if ((slugMatches?.length ?? 0) > 0) {
        return reply.status(HTTP_STATUS.CONFLICT).send({
          data: null,
          error: {
            error: 'Conflict',
            message: 'Slug already in use',
          },
        });
      }

      // Update prototype with deployment details
      const { data: updatedPrototype, error: updateError } = await supabase
        .from('prototypes')
        .update({
          slug: normalizedSlug,
          visibility,
          is_deployed: true,
        })
        .eq('id', prototype.id)
        .select('id, slug, visibility')
        .single();

      if (updateError || !updatedPrototype) {
        request.log2.error(updateError, 'Failed to deploy prototype');
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: 'Deployment failed',
            message: 'Unable to deploy prototype',
          },
        });
      }

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          prototype_id: updatedPrototype.id,
          slug: updatedPrototype.slug ?? '',
          visibility: updatedPrototype.visibility ?? 'PUBLIC',
          url: `${this.appsBaseUrl}/${updatedPrototype.slug}`,
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, 'Error deploying prototype');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal server error',
          message:
            error instanceof Error
              ? error.message
              : 'Unable to deploy prototype',
        },
      });
    }
  }

  private normalizeSlug(slug: string): string {
    return slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private isValidSlug(slug: string): boolean {
    return (
      slug.length >= MIN_SLUG_LENGTH &&
      slug.length <= MAX_SLUG_LENGTH &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    );
  }
}
