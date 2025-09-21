import { S3Client } from '@aws-sdk/client-s3';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  DeletePrototypeResponse,
  HTTP_STATUS,
} from '../../types/PublicAPITypes.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../types/supabase.js';
import {
  cleanupPrototypeS3Objects,
  deletePrototypeAssetsFromStorage,
  deletePrototypeThumbnailFromSupabaseStorage,
} from '../../utils/s3Operations.js';

export default async function handleDeletePrototypeImpl(
  request: FastifyRequest<{ Params: { prototype_id: string } }>,
  reply: FastifyReply,
  s3Client: S3Client,
): Promise<DeletePrototypeResponse> {
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
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Access denied for this prototype',
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
    const [
      s3CleanupResult,
      assetsCleanupResult,
      thumbnailCleanupResult,
      prototypeCleanupResult,
    ] = await Promise.all([
      cleanupPrototypeS3Objects(s3Client, prototype_id, request.log2),
      deletePrototypeAssetsFromStorage(prototype_id, request.log2),
      deletePrototypeThumbnailFromSupabaseStorage(
        supabase,
        prototype_id,
        request.log2,
      ),
      supabase.from('prototypes').delete().eq('id', prototype_id), // cascade delete everything relevant
    ]);

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
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to delete all associated data for prototype',
      });
    }
    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      message: 'Prototype and all associated data deleted successfully',
    });
  } catch (error) {
    request.log2.error(error, 'Prototype deletion error');
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      success: false,
      error: 'DATABASE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
