import { S3Client } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../../../types/PublicAPITypes.js';
import { Database, TablesInsert, TablesUpdate } from '../../../types/supabase.js';
import { checkUserHasPrototypeEditAccess } from '../../../utils/prototypeAuth.js';
import { isEditableDevServer } from '../../../utils/prototypeDevServerStatusUtils.js';
import { DispatcherService } from '../../dispatcher/DispatcherService.js';
import {
  deletePrototypeAssetsFromStorage,
  deletePrototypeChatImagesFromStorage,
  deletePrototypeS3Builds,
  deletePrototypeThumbnailFromSupabaseStorage,
} from '../storageOperations.js';
import { copyAllDefaultsForNewPrototype } from './handleCreatePrototype.js';

export default async function handleResetPrototypeImpl(
  request: FastifyRequest<{ Params: { prototype_id: string } }>,
  reply: FastifyReply,
  s3Client: S3Client,
  dispatcherService: DispatcherService,
): Promise<void> {
  try {
    const { prototype_id } = request.params;
    // 1. Get JWT token and validate access, and instantiate authenticated supabase client
    const token = request.headers.authorization?.split(' ')[1];
    const authResponse = await checkUserHasPrototypeEditAccess(
      prototype_id,
      token,
      request.log2,
    );
    if (
      authResponse === null ||
      authResponse.user === null ||
      !authResponse.canEdit
    ) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Access denied for this prototype',
      });
    }
    request.log2 = request.log2.child({
      userId: authResponse.user.id,
    });
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

    // 2. Delete all prototype files, assets from DB and delete all S3 builds, thumbnails, and assets in storage
    const [s3Deleted, assetsDeleted, thumbnailDeleted] = await Promise.all([
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
    ]);

    if (!s3Deleted || !assetsDeleted || !thumbnailDeleted) {
      request.log2.error(
        new Error('Failed to delete existing prototype artifacts'),
        '[handleResetPrototype] Cleanup failure before reset',
        {
          s3Deleted,
          assetsDeleted,
          thumbnailDeleted,
        },
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'CLEANUP_FAILED',
        message: 'Failed to clean up existing prototype artifacts',
      });
    }

    const { error: deleteError } = await supabase
      .from('prototypes')
      .delete()
      .eq('id', prototype_id); // cascade delete everything relevant
    if (deleteError) {
      request.log2.error(
        deleteError,
        '[handleResetPrototype] Failed to delete prototype before recreation',
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to clean existing prototype data',
      });
    }

    // 3. Re-create the prototype with same metadata and use existing createPrototype logic to apply all defaults to this prototype
    const { error: newPrototypeError } = await supabase
      .from('prototypes')
      .insert({
        ...authResponse.prototype,
        latest_build_key: null,
      } satisfies TablesInsert<'prototypes'>);
    if (newPrototypeError) {
      request.log2.error(
        newPrototypeError,
        '[handleResetPrototype] Failed to re-create prototype',
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to re-create prototype',
      });
    }
    let version: string | undefined;
    try {
      version = await copyAllDefaultsForNewPrototype(
        supabase,
        s3Client,
        prototype_id,
        authResponse.prototype.design_style,
        request.log2,
      );
    } catch (error) {
      request.log2.error(
        error,
        '[handleResetPrototype] Failed to copy defaults to new prototype',
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to copy defaults to new prototype',
      });
    }

    if (!version) {
      request.log2.error(
        new Error('Missing deployment version after copying defaults'),
        '[handleResetPrototype] No version returned after copyAllDefaultsForNewPrototype',
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to finalize prototype reset',
      });
    }

    const { error: updateLatestBuildError } = await supabase
      .from('prototypes')
      .update({ latest_build_key: version } satisfies TablesUpdate<'prototypes'>)
      .eq('id', prototype_id);

    if (updateLatestBuildError) {
      request.log2.error(
        updateLatestBuildError,
        '[handleResetPrototype] Failed to update latest_build_key after reset',
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to finalize prototype reset',
      });
    }

    // 4. Check if dev server is running and send file updates
    const precheckResult = await dispatcherService.dispatchPrecheck(
      { prototype_id },
      token!,
      request.log2,
    );

    if (
      precheckResult.error ||
      !isEditableDevServer(precheckResult.data?.status)
    ) {
      request.log2.warn(
        'Failed to check dev server status, but reset was successful',
        { precheckResult },
      );
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        message:
          'Prototype successfully reset to default app files, dev server does not exist',
      });
    }

    // Check if there's an active dev server to update
    request.log2.consoleLogDevOnly(
      'info',
      '[handleResetPrototype] Sending file updates to active dev server',
    );

    const defaultFilesResult = await supabase
      .from('prototype_files')
      .select('*')
      .eq('prototype_id', prototype_id);
    if (defaultFilesResult.error || !defaultFilesResult.data) {
      request.log2.error(
        defaultFilesResult.error,
        '[handleResetPrototype] Failed to fetch default files',
      );
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        message:
          'Prototype successfully reset to default app files, dev server not updated',
      });
    }
    await dispatcherService.dispatch(
      {
        prototype_id: prototype_id,
        framework: 'expo_react_native',
        files: defaultFilesResult.data,
        assets: [], // Default app doesn't have assets in this context
        file_scope: 'updates',
      },
      token!,
      request.log2,
    );

    // 5. Return success response
    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      message: 'Prototype successfully reset to default app files',
    });
  } catch (error) {
    request.log2.error(error, '[handleResetPrototype] Unexpected error');
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
