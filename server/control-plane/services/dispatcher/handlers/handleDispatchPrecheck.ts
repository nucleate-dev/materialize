import {
  APIResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckSuccessResponse,
  StandardErrorResponse,
} from '../../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import {
  CACHE_KEYS,
  isActiveBuildType,
  S3_URL_TEMPLATE,
} from '../../../types/InternalTypes.js';
import { GlideClient } from '@valkey/valkey-glide';
import { hgetallAsActiveBuild } from '../../../utils/cacheInteractionUtils.js';
import { isEditableDevServer } from '../../../utils/prototypeDevServerStatusUtils.js';
import { SystemLogger } from '../../../loggers/SystemLogger.js';

export async function handleDispatchPrecheckImpl(
  body: DispatchPrecheckRequestBody,
  jwt: string,
  cache: GlideClient,
  log2: SystemLogger,
): Promise<
  APIResponse<DispatchPrecheckSuccessResponse, StandardErrorResponse>
> {
  // 1. Extract validated body
  const { prototype_id } = body;

  // 2. Authentication and authorization validation
  const authResult = await checkUserHasPrototypeEditAccess(
    prototype_id,
    jwt,
    log2,
  );
  if (!authResult || !authResult.canEdit) {
    return {
      data: null,
      error: {
        error: 'Unauthorized',
        message:
          'Invalid JWT, user not authenticated, or user does not have permissions to edit this prototype',
      },
    };
  }
  // update logger context
  log2 = log2.child({
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
          return {
            data: null,
            error: {
              error: 'Internal Server Error',
              message: 'Invalid build data in storage',
            },
          };
        }

        return {
          data: {
            status: existingBuild.status,
            viewing_url: normalizeUrl(
              isEditableDevServer(existingBuild.status)
                ? existingBuild.url
                : getS3Url(prototype_id),
            ),
          },
          error: null,
        };
      }
    }

    // No active build, return S3 URL
    return {
      data: {
        status: null,
        viewing_url: normalizeUrl(getS3Url(prototype_id)),
      },
      error: null,
    };
  } catch (error) {
    log2.error(error, '[handleDispatchPrecheck] Precheck failed');
    const e = error instanceof Error ? error : new Error(String(error));
    return {
      data: null,
      error: {
        error: 'Internal Server Error',
        message: e.message,
      },
    };
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
