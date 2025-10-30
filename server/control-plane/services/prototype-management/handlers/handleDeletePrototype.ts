import { ECSClient, StopTaskCommand } from '@aws-sdk/client-ecs';
import { S3Client } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { GlideClient } from '@valkey/valkey-glide';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { CACHE_KEYS } from '../../../types/InternalTypes.js';
import {
  APIResponse,
  DeletePrototypeErrorResponse,
  DeletePrototypeSuccessResponse,
  HTTP_STATUS,
} from '../../../types/PublicAPITypes.js';
import { Database } from '../../../types/supabase.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import {
  deletePrototypeAssetsFromStorage,
  deletePrototypeChatImagesFromStorage,
  deletePrototypeS3Builds,
  deletePrototypeThumbnailFromSupabaseStorage,
} from '../storageOperations.js';

export default async function handleDeletePrototypeImpl(
  request: FastifyRequest<{ Params: { prototype_id: string } }>,
  reply: FastifyReply,
  s3Client: S3Client,
  cache: GlideClient,
): Promise<
  APIResponse<DeletePrototypeSuccessResponse, DeletePrototypeErrorResponse>
> {
  try {
    const { prototype_id } = request.params;
    // 1. Get JWT token and validate authentication
    const token = request.headers.authorization?.split(' ')[1];
    const authResponse = await checkUserHasPrototypeEditAccess(
      prototype_id,
      token,
      request.log2,
    );
    if (authResponse === null || !authResponse.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Access denied for this prototype',
        },
      });
    }
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    );

    // 2. Delete everything for this prototype concurrently
    const [s3CleanupResult, assetsCleanupResult, thumbnailCleanupResult] =
      await Promise.all([
        deletePrototypeS3Builds(s3Client, prototype_id, request.log2),
        deletePrototypeAssetsFromStorage(supabase, prototype_id, request.log2),
        deletePrototypeThumbnailFromSupabaseStorage(
          supabase,
          prototype_id,
          request.log2,
        ),
        deletePrototypeChatImagesFromStorage(
          supabase,
          prototype_id,
          request.log2,
        ),
        killActiveFargateInstanceIfItExists(prototype_id, cache, request.log2),
      ]);
    const prototypeCleanupResult = await supabase
      .from('prototypes')
      .delete()
      .eq('id', prototype_id); // cascade delete everything relevant

    request.log2.info('Deleted all associated data for prototype', {
      prototype_id,
      s3CleanupResult,
      assetsCleanupResult,
      thumbnailCleanupResult,
      prototypeCleanupResult,
    });

    if (
      !s3CleanupResult ||
      !assetsCleanupResult ||
      !thumbnailCleanupResult ||
      prototypeCleanupResult.error
    ) {
      request.log2.error(
        new Error(prototypeCleanupResult.error?.message || 'Unknown error'),
        'Failed to delete all associated data for prototype',
        {
          s3CleanupResult,
          assetsCleanupResult,
          thumbnailCleanupResult,
          prototypeCleanupResult,
        },
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          success: false,
          error: 'DATABASE_ERROR',
          message: 'Failed to delete all associated data for prototype',
        },
      });
    }
    return reply.status(HTTP_STATUS.OK).send({
      data: {
        success: true,
        message: 'Prototype and all associated data deleted successfully',
      },
      error: null,
    });
  } catch (error) {
    request.log2.error(error, 'Prototype deletion error');
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      data: null,
      error: {
        success: false,
        error: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

async function killActiveFargateInstanceIfItExists(
  prototypeId: string,
  cache: GlideClient,
  log2: SystemLogger,
): Promise<void> {
  try {
    // 1. Check if there is a current active build for this prototype in the cache
    const currentBuildIdRaw = await cache.get(
      CACHE_KEYS.protoCurrentBuild(prototypeId),
    );
    if (!currentBuildIdRaw) {
      return; // No active build
    }
    const currentBuildId = currentBuildIdRaw.toString();
    const activeBuildKey = CACHE_KEYS.activeBuild(currentBuildId);
    const buildJsonRaw = await cache.get(activeBuildKey);
    if (!buildJsonRaw) {
      return; // Build data not found
    }
    const activeBuild = JSON.parse(buildJsonRaw.toString());

    // 2. If the fargate task ARN is not empty, then terminate the fargate task
    if (activeBuild.fargate_task_arn) {
      const ecsClient = new ECSClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });
      const stopCommand = new StopTaskCommand({
        cluster: process.env.ECS_CLUSTER_NAME!,
        task: activeBuild.fargate_task_arn,
        reason: 'Prototype deletion - terminating active build',
      });
      await ecsClient.send(stopCommand);
    }

    // 3. Clear all the cache entries for this prototype after the fargate task is successfully killed
    try {
      await cache.del([activeBuildKey]);
      await cache.customCommand([
        'ZREM',
        CACHE_KEYS.protoBuilds(prototypeId),
        currentBuildId,
      ]);
      await cache.del([CACHE_KEYS.protoCurrentBuild(prototypeId)]);
    } catch (error) {
      log2.error(error, 'Error clearing cache entries for prototype:');
    }
  } catch (error) {
    // Log error but don't throw - prototype deletion should continue even if cleanup fails
    log2.error(error, 'Error killing active Fargate instance:');
  }
}
