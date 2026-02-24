import { S3Client } from '@aws-sdk/client-s3';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import {
  APIResponse,
  DeletePrototypeErrorResponse,
  DeletePrototypeSuccessResponse,
  HTTP_STATUS,
} from '../../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import { getCurrentBuildForPrototype } from '../../../utils/cacheInteractionUtils.js';
import {
  deletePrototypeAssetsFromStorage,
  deletePrototypeChatImagesFromStorage,
  deletePrototypeS3Builds,
  deletePrototypeThumbnailFromSupabaseStorage,
} from '../storageOperations.js';
import { CleanupService } from '../../cleanup/CleanupService.js';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../../types/supabase.js';

export default async function handleDeletePrototypeImpl(
  request: FastifyRequest<{ Params: { prototype_id: string } }>,
  reply: FastifyReply,
  s3Client: S3Client,
  cleanupService: CleanupService,
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
        killActiveFargateInstanceIfItExists(
          prototype_id,
          request.log2,
          cleanupService,
        ),
      ]);
    const prototypeCleanupResult = await supabase
      .from('prototypes')
      .delete()
      .eq('id', prototype_id); // cascade delete everything relevant

    request.log2.consoleLogDevOnly(
      'info',
      'Deleted all associated data for prototype',
      {
        prototype_id,
        s3CleanupResult,
        assetsCleanupResult,
        thumbnailCleanupResult,
        prototypeCleanupResult,
      },
    );

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
  log2: SystemLogger,
  cleanupService: CleanupService,
): Promise<void> {
  try {
    // 1. Check if there is a current active build for this prototype
    const currentBuildResult = await getCurrentBuildForPrototype(prototypeId);
    if (!currentBuildResult) {
      log2.consoleLogDevOnly(
        'info',
        'No active build found for prototype during deletion',
        { prototypeId },
      );
      return; // No active build
    }

    const { build: activeBuild, buildId: currentBuildId } = currentBuildResult;
    const activeBuildKey = `active_build:${currentBuildId}`;

    log2.consoleLogDevOnly(
      'info',
      'Found active build during prototype deletion, using CleanupService to clean it up',
      {
        prototypeId,
        buildId: currentBuildId,
        fargateTaskArn: activeBuild.fargate_task_arn,
        terminalTunnelId: activeBuild.terminal_tunnel_id,
      },
    );

    // 2. Use CleanupService to handle all cleanup logic (Fargate task, tunnel, cache)
    // Pass shouldWaitForSuccessfulBuild=false since we're deleting the prototype anyway
    const cleanupResult = await cleanupService.cleanupSingleBuild(
      activeBuild,
      currentBuildId,
      activeBuildKey,
      false, // shouldWaitForSuccessfulBuild = false
    );

    if (cleanupResult.success) {
      log2.consoleLogDevOnly(
        'info',
        'Successfully cleaned up active build during prototype deletion',
        { prototypeId, buildId: currentBuildId },
      );
    } else {
      log2.warn(
        'Failed to clean up active build during prototype deletion, but continuing with deletion',
        {
          prototypeId,
          buildId: currentBuildId,
          error: cleanupResult.error,
          buildInProgress: cleanupResult.buildInProgress,
        },
      );
    }
  } catch (error) {
    // Log error but don't throw - prototype deletion should continue even if cleanup fails
    log2.error(error, 'Error killing active Fargate instance:', {
      prototypeId,
    });
  }
}
