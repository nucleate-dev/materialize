import { FastifyReply, FastifyRequest } from 'fastify';
import {
  APIResponse,
  DispatchPrecheckErrorResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckSuccessResponse,
  HTTP_STATUS,
} from '../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import {
  CACHE_KEYS,
  isActiveBuildType,
  S3_URL_TEMPLATE,
} from '../../types/InternalTypes.js';
import { GlideClient } from '@valkey/valkey-glide';
import { hgetallAsActiveBuild } from '../../utils/cacheInteractionUtils.js';
import { isEditableDevServer } from '../../utils/prototypeDevServerStatusUtils.js';

export async function handleDispatchPrecheckImpl(
  request: FastifyRequest<{ Body: DispatchPrecheckRequestBody }>,
  reply: FastifyReply,
  cache: GlideClient,
): Promise<
  APIResponse<DispatchPrecheckSuccessResponse, DispatchPrecheckErrorResponse>
> {
  // 1. Extract validated body (validation handled by Fastify schema)
  const { prototype_id } = request.body;

  // 2. Extract JWT from Authorization header
  const jwt = request.headers.authorization?.split(' ')[1];
  if (!jwt || !request.headers.authorization?.startsWith('Bearer ')) {
    return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
      data: null,
      error: {
        error: 'Unauthorized',
        message: 'No JWT token provided in Authorization header',
      } as DispatchPrecheckErrorResponse,
    });
  }

  // 3. Authentication and authorization validation
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    request.log2,
  );
  if (!authResult || !authResult.canEdit) {
    return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      } as DispatchPrecheckErrorResponse,
    });
  }
  // update logger context
  request.log2 = request.log2.child({
    userId: authResult.user.id,
    prototypeId: prototype_id,
  });

  try {
    // Check current build pointer
    const currentBuildId = await cache.get(
      CACHE_KEYS.protoCurrentBuild(prototype_id),
    );

    if (currentBuildId) {
      const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId as string);
      const existingBuild = await hgetallAsActiveBuild(cache, activeBuildKey);

      if (existingBuild) {
        if (!isActiveBuildType(existingBuild)) {
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: 'Internal Server Error',
              message: 'Invalid build data in storage',
            } as DispatchPrecheckErrorResponse,
          });
        }

        return reply.status(HTTP_STATUS.OK).send({
          data: {
            status: existingBuild.status,
            viewing_url: normalizeUrl(
              isEditableDevServer(existingBuild.status)
                ? existingBuild.url
                : getS3Url(prototype_id),
            ),
          } as DispatchPrecheckSuccessResponse,
          error: null,
        });
      }
    }

    // No active build, return S3 URL
    return reply.status(HTTP_STATUS.OK).send({
      data: {
        status: null,
        viewing_url: normalizeUrl(getS3Url(prototype_id)),
      } as DispatchPrecheckSuccessResponse,
      error: null,
    });
  } catch (error) {
    request.log2.error(error, '[handleDispatchPrecheck] Precheck failed');
    const e = error instanceof Error ? error : new Error(String(error));
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      } as DispatchPrecheckErrorResponse,
    });
  }
}

function getS3Url(prototypeId: string): string {
  // Construct S3/CloudFront URL for the prototype
  return S3_URL_TEMPLATE(prototypeId);
}

function normalizeUrl(url: string): string {
  // Ensure URL has protocol (https://) for iframe loading
  return url && !url.startsWith('http') ? `https://${url}` : url;
}
