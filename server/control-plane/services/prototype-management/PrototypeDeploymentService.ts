import { S3Client } from '@aws-sdk/client-s3';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  type CheckSlugSuccessResponse,
  type DeployRequestBody,
  type DeploySuccessResponse,
  type APIResponse,
  HTTP_STATUS,
  StandardErrorResponse,
} from '../../types/PublicAPITypes.js';
import {
  checkUserHasPrototypeEditAccess,
  validateJWTToken,
} from '../../utils/prototypeAuth.js';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase.js';
import { posthog } from '../../server.js';
import {
  copyPrototypeBuildToDeploymentFolder,
  deletePrototypeDeploymentPrefixes,
  listPrototypeDeploymentPrefixes,
} from './storageOperations.js';

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
  private s3Client: S3Client;

  constructor(s3Client: S3Client) {
    this.s3Client = s3Client;
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
  ): Promise<APIResponse<CheckSlugSuccessResponse, StandardErrorResponse>> {
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
      request.log2.warn('Unauthorized user');
      reply.status(HTTP_STATUS.UNAUTHORIZED);
      return {
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'Invalid token',
        },
      };
    }

    const { slug: rawSlug, exclude_prototype_id } = request.query;
    const slug = this.normalizeSlug(rawSlug);

    if (!this.isValidSlug(slug)) {
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        data: null,
        error: {
          error: 'Invalid slug',
          message: `Slug must be ${SLUG_RULES.min}-${SLUG_RULES.max} characters using lowercase letters, numbers, or hyphens.`,
        },
      };
    }

    try {
      let query = supabase.from('prototypes').select('id').eq('slug', slug);
      if (exclude_prototype_id) {
        query = query.neq('id', exclude_prototype_id);
      }
      const { data, error } = await query.limit(1);

      if (error) {
        request.log2.error(error, 'Failed to check slug availability');
        reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return {
          data: null,
          error: {
            error: 'Internal server error',
            message: 'Unable to check slug availability',
          },
        };
      }

      reply.status(HTTP_STATUS.OK);
      return {
        data: {
          available: data.length === 0,
          slug,
        },
        error: null,
      };
    } catch (error) {
      request.log2.error(error, 'Error checking slug availability');
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Internal server error',
          message: 'Unable to check slug availability',
        },
      };
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
  ): Promise<APIResponse<DeploySuccessResponse, StandardErrorResponse>> {
    const { prototype_id, slug: rawSlug } = request.body;

    // 1. Authenticate user
    const token = request.headers.authorization?.split(' ')[1];
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      token,
      request.log2,
    );
    if (
      authResult === null ||
      !authResult.canEdit ||
      authResult.user === null
    ) {
      reply.status(HTTP_STATUS.UNAUTHORIZED);
      return {
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'Authorization failed or access denied for this prototype',
        },
      };
    }

    request.log2 = request.log2.child({
      userId: authResult.user.id,
      prototypeId: prototype_id,
    });

    // 2. Check user has access to the deploy feature
    const isDeployFeatureEnabled = await posthog.isFeatureEnabled(
      'deploy-app-for-public-viewing',
      authResult.user.id,
    );
    if (!isDeployFeatureEnabled) {
      request.log2.warn('Deployment feature not enabled for user', {
        user_id: authResult.user.id,
      });
      reply.status(HTTP_STATUS.FORBIDDEN);
      return {
        data: null,
        error: {
          error: 'Feature not available',
          message: 'Deployment feature is not enabled for your account',
        },
      };
    }

    // 3. Validate the slug formatting
    const normalizedSlug = this.normalizeSlug(rawSlug);
    if (!this.isValidSlug(normalizedSlug)) {
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return {
        data: null,
        error: {
          error: 'Invalid slug',
          message: `Slug must be ${SLUG_RULES.min}-${SLUG_RULES.max} characters using lowercase letters, numbers, or hyphens.`,
        },
      };
    }

    // 4. Check the slug uniqueness
    const { data: slugMatches, error: slugCheckError } = await supabase
      .from('prototypes')
      .select('id')
      .eq('slug', normalizedSlug)
      .neq('id', authResult.prototype.id)
      .limit(1);
    if (slugCheckError) {
      request.log2.error(slugCheckError, 'Failed to validate slug uniqueness');
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Validation failed',
          message: 'Unable to validate slug uniqueness',
        },
      };
    }
    if ((slugMatches?.length ?? 0) > 0) {
      reply.status(HTTP_STATUS.CONFLICT);
      return {
        data: null,
        error: {
          error: 'Conflict',
          message: 'Slug already in use',
        },
      };
    }

    const existingDeploymentPrefixes = await listPrototypeDeploymentPrefixes(
      this.s3Client,
      authResult.prototype.id,
      request.log2,
    );

    // 5. Copy the build output into a unique deployment folder
    const deploymentKey = `d${Date.now()}`;
    const copyResult = await copyPrototypeBuildToDeploymentFolder(
      this.s3Client,
      authResult.prototype.id,
      authResult.prototype.latest_build_key,
      deploymentKey,
      request.log2,
    );
    if (!copyResult.success) {
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Deployment failed',
          message: 'Unable to copy build artifacts for deployment',
        },
      };
    }

    // 6. Clean up old deployment folders to preserve S3 storage space
    const prefixesToDelete = existingDeploymentPrefixes.filter(
      (prefix) => !prefix.endsWith(`/${deploymentKey}/`),
    );
    if (prefixesToDelete.length > 0) {
      const deleteResult = await deletePrototypeDeploymentPrefixes(
        this.s3Client,
        prefixesToDelete,
        request.log2,
      );
      if (!deleteResult) {
        request.log2.warn('Failed to delete some old deployment folders', {
          prefixesToDelete,
        });
      }
    }

    // 7. Record deployment key against the latest build history entry
    const { data: latestBuildHistory, error: buildHistoryError } = await supabase
      .from('prototype_build_history')
      .select('id')
      .eq('prototype_id', authResult.prototype.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (buildHistoryError) {
      request.log2.error(buildHistoryError, 'Failed to fetch build history entry');
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Deployment failed',
          message: 'Unable to record deployment history',
        },
      };
    }

    if (latestBuildHistory?.id) {
      const { error: updateHistoryError } = await supabase
        .from('prototype_build_history')
        .update({ deploy_key: deploymentKey })
        .eq('id', latestBuildHistory.id);

      if (updateHistoryError) {
        request.log2.error(
          updateHistoryError,
          'Failed to update build history deploy key',
          {
            build_history_id: latestBuildHistory.id,
            deploymentKey,
          },
        );
      }
    }

    // 8. Update prototype with deployment details
    const { data: updatedPrototype, error: updateError } = await supabase
      .from('prototypes')
      .update({
        slug: normalizedSlug,
      })
      .eq('id', authResult.prototype.id)
      .select('id, slug')
      .single();

    if (updateError || !updatedPrototype) {
      request.log2.error(updateError, 'Failed to deploy prototype');
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: 'Deployment failed',
          message: 'Unable to deploy prototype',
        },
      };
    }

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        url: `${updatedPrototype.slug}.app.nucleate.dev`,
      },
      error: null,
    };
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
