import { S3Client } from '@aws-sdk/client-s3';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
    if (!token || !request.headers.authorization?.startsWith('Bearer')) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'No authentication token provided',
      });
    }

    // 2. Check if user has edit access for the prototype
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

    // 3. Create Supabase client for database operations
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

    // 4. Delete S3 builds for the prototype
    try {
      await cleanupPrototypeS3Objects(s3Client, prototype_id, request.log2);
    } catch (s3Error) {
      request.log2.error(s3Error, 'Failed to delete S3 builds for prototype');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'S3_ERROR',
        message: 'Failed to delete S3 builds for prototype',
      });
    }

    // 5. Delete prototype assets from storage
    try {
      await deletePrototypeAssetsFromStorage(prototype_id, request.log2);
    } catch (assetError) {
      request.log2.error(
        assetError,
        'Failed to delete prototype assets from storage',
      );
    }

    // 5.5. Delete the prototype thumbnail from Supabase Storage
    try {
      const { error: thumbnailDeleteError } = await supabase.storage
        .from('prototype-thumbnails')
        .remove([`${prototype_id}.png`]);

      if (thumbnailDeleteError) {
        request.log2.warn(
          'Failed to delete prototype thumbnail from storage (non-critical)',
          { error: thumbnailDeleteError },
        );
      } else {
        request.log2.info(
          'Successfully deleted prototype thumbnail from storage',
        );
      }
    } catch (thumbnailError) {
      request.log2.warn(
        'Failed to delete prototype thumbnail from storage (non-critical)',
        { error: thumbnailError },
      );
    }

    // 6. Delete the prototype from prototypes table (will cascade delete all associated prototype_files, prototype_assets, chat sessions, and messages)
    const { error: prototypeDeleteError } = await supabase
      .from('prototypes')
      .delete()
      .eq('id', prototype_id);

    if (prototypeDeleteError) {
      request.log2.error(
        prototypeDeleteError,
        'Failed to delete prototype from database',
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to delete prototype from database',
      });
    }

    // 7. Return success response
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
