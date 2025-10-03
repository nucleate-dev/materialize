import { FastifyReply, FastifyRequest } from 'fastify';
import {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
  HTTP_STATUS,
} from '../../../types/PublicAPITypes.js';
import { validateJWTToken } from '../../../utils/prototypeAuth.js';
import { hasExceededPrototypeCreationLimit } from '../../../utils/subscriptionChecks.js';
import { Database } from '../../../types/supabase.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  deletePrototypeS3Builds,
  copyAllAssetsInSupabaseStorage,
  copyDefaultAppToVersionedPrototype,
  copyPrototypeThumbnailInSupabaseStorage,
  copyS3BucketContentsVersioned,
  deletePrototypeAssetsFromStorage,
  deletePrototypeThumbnailFromSupabaseStorage,
  getDefaultAppFilesFromS3,
  getPrototypeViewingUrl,
  uploadDefaultAssetsToSupabaseStorage,
} from '../storageOperations.js';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { S3Client } from '@aws-sdk/client-s3';
import {
  PrototypeAssetInsert,
  PrototypeFileInsert,
} from '../../../types/InternalTypes.js';

export async function handleCreatePrototypeImpl(
  request: FastifyRequest<{ Body: CreatePrototypeRequestBody }>,
  reply: FastifyReply,
  s3Client: S3Client,
): Promise<
  APIResponse<CreatePrototypeSuccessResponse, CreatePrototypeErrorResponse>
> {
  try {
    // 1. JWT Token validation and user authentication
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const user = await validateJWTToken(token, request.log2);
    if (!user) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Invalid authentication token',
        },
      });
    }
    // update logger context
    request.log2 = request.log2.child({
      userId: user.id,
    });

    // 2. Check prototype limits for free users (5 max)
    const limitCheck = await hasExceededPrototypeCreationLimit(
      token,
      user.id,
      request.log2,
    );
    if (limitCheck.exceeded) {
      return reply.status(HTTP_STATUS.PAYMENT_REQUIRED).send({
        data: null,
        error: {
          success: false,
          error: 'PROTOTYPE_LIMIT_REACHED',
          message: 'Prototype limit reached',
        },
      });
    }

    // 3. Extract validated body (validation handled by Fastify schema)
    const {
      name,
      description,
      project_id,
      prototype_id: forkPrototypeId, // If provided, this is a fork
      visibility,
    } = request.body;

    if (visibility !== 'PUBLIC' && limitCheck.plan === 'free') {
      const errorResponse: CreatePrototypeErrorResponse = {
        error: 'INVALID_REQUEST',
        message: 'Free tier users can only make public prototypes',
      };
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: errorResponse,
      });
    }

    // 4. Create prototype in database
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
    const { data: newPrototype, error: prototypeInsertError } = await supabase
      .from('prototypes')
      .insert({
        name,
        description,
        owner_id: user.id,
        project_id,
        visibility:
          visibility || (limitCheck.plan === 'pro' ? 'SELF' : 'PUBLIC'),
      })
      .select()
      .single();

    if (prototypeInsertError) {
      request.log2.error(
        new Error(prototypeInsertError.message),
        '[handleCreatePrototype] Error creating prototype:' +
          prototypeInsertError.message,
      );
      const errorResponse: CreatePrototypeErrorResponse = {
        error: 'DATABASE_ERROR',
        message: 'Failed to create prototype in database',
      };
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: errorResponse,
      });
    }

    const newPrototypeId = newPrototype.id;
    try {
      // 5. Handle prototype files and S3 operations
      let version: string | undefined;
      if (forkPrototypeId) {
        version = await forkPrototype(
          supabase,
          s3Client,
          forkPrototypeId,
          newPrototypeId,
          request.log2,
        );
      } else {
        version = await copyAllDefaultsForNewPrototype(
          supabase,
          s3Client,
          newPrototypeId,
          request.log2,
        );
      }

      // 5.5. Update prototype with latest_build_key if version was created
      if (version) {
        try {
          const { error: updateError } = await supabase
            .from('prototypes')
            .update({ latest_build_key: `v${version}` })
            .eq('id', newPrototypeId);

          if (updateError) {
            request.log2.error(
              updateError,
              '[handleCreatePrototype] Failed to update latest_build_key, but continuing with prototype creation',
            );
          }
        } catch (updateError) {
          request.log2.error(
            updateError,
            '[handleCreatePrototype] Failed to update latest_build_key, but continuing with prototype creation',
          );
        }
      }

      // 6. Get viewing URL and return success
      const viewingUrl = getPrototypeViewingUrl(newPrototypeId);
      return reply.status(HTTP_STATUS.OK).send({
        data: {
          prototype_id: newPrototypeId,
          viewing_url: viewingUrl,
        } as CreatePrototypeSuccessResponse,
        error: null,
      });
    } catch (error) {
      request.log2.error(error, 'Error during prototype setup:');
      await Promise.allSettled([
        deletePrototypeS3Builds(s3Client, newPrototypeId, request.log2),
        deletePrototypeAssetsFromStorage(
          supabase,
          newPrototypeId,
          request.log2,
        ),
        deletePrototypeThumbnailFromSupabaseStorage(
          supabase,
          newPrototypeId,
          request.log2,
        ),
      ]);
      await supabase.from('prototypes').delete().eq('id', newPrototypeId);
      const errorResponse: CreatePrototypeErrorResponse = {
        error: 'S3_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to set up prototype files and S3 storage',
      };
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: errorResponse,
      });
    }
  } catch (error) {
    request.log2.error(error, '[handleCreatePrototype] Unexpected error:');
    const errorResponse: CreatePrototypeErrorResponse = {
      error: 'DATABASE_ERROR',
      message: 'An unexpected error occurred',
    };
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      data: null,
      error: errorResponse,
    });
  }
}

/**
 * Helper function to fork an existing prototype
 */
async function forkPrototype(
  supabase: SupabaseClient<Database>,
  s3Client: S3Client,
  sourcePrototypeId: string,
  newPrototypeId: string,
  log2: SystemLogger,
): Promise<string | undefined> {
  // 1. Fetch files and assets from source prototype and copy assets + s3 builds + thumbnail to new prototype
  const [filesResult, assetsResult, s3CopyResult, thumbnailCopyResult] =
    await Promise.all([
      supabase
        .from('prototype_files')
        .select('*')
        .eq('prototype_id', sourcePrototypeId),
      supabase
        .from('prototype_assets')
        .select('*')
        .eq('prototype_id', sourcePrototypeId),
      copyS3BucketContentsVersioned(
        s3Client,
        sourcePrototypeId,
        newPrototypeId,
        log2,
      ),
      copyPrototypeThumbnailInSupabaseStorage(
        supabase,
        sourcePrototypeId,
        newPrototypeId,
      ),
    ]);
  if (
    filesResult.error ||
    assetsResult.error ||
    !s3CopyResult.success ||
    !thumbnailCopyResult.success
  ) {
    log2.error(
      filesResult.error,
      '[forkPrototype] Failed to copy prototype storage items or fetch prototype files+assets',
    );
    throw new Error(
      filesResult.error?.message ||
        assetsResult.error?.message ||
        thumbnailCopyResult.error ||
        s3CopyResult.error ||
        'Failed copy operations or fetching protototype files+assets',
    );
  }

  const [filesInsertResult, assetsInsertResult, assetsStorageCopyResult] =
    await Promise.all([
      supabase.from('prototype_files').insert(
        filesResult.data.map(
          (file) =>
            ({
              prototype_id: newPrototypeId,
              name: file.name,
              contents: file.contents,
            } as PrototypeFileInsert),
        ),
      ),
      supabase.from('prototype_assets').insert(
        assetsResult.data.map(
          (asset) =>
            ({
              prototype_id: newPrototypeId,
              name: asset.name,
              storage_url: '', // TODO @sourish: remove this altogether, storage_url is not necessary given that we have filename and need to create a signedUrl for access anyways given RLS
            } as PrototypeAssetInsert),
        ),
      ),
      copyAllAssetsInSupabaseStorage(
        supabase,
        assetsResult.data,
        sourcePrototypeId,
        newPrototypeId,
      ),
    ]);
  if (
    filesInsertResult.error ||
    assetsInsertResult.error ||
    !assetsStorageCopyResult.success
  ) {
    log2.error(
      filesInsertResult.error ||
        assetsInsertResult.error ||
        assetsStorageCopyResult.error,
      '[forkPrototype] Failed to insert files or assets',
    );
    throw new Error(
      `Failed to copy prototype files or assets: ${
        filesInsertResult.error?.message || assetsInsertResult.error?.message
      }`,
    );
  }
  return s3CopyResult.version;
}

/**
 * Helper function to create a new prototype with default files
 */
export async function copyAllDefaultsForNewPrototype(
  supabase: SupabaseClient<Database>,
  s3Client: S3Client,
  newPrototypeId: string,
  log2: SystemLogger,
): Promise<string | undefined> {
  // Get default app files from S3 raw files
  const [defaultFilesResult, s3CopyResult] = await Promise.all([
    getDefaultAppFilesFromS3(s3Client, newPrototypeId, log2),
    copyDefaultAppToVersionedPrototype(s3Client, newPrototypeId, log2),
    // TODO @sourish: create a default app thumbnail to copy to new prototype
  ]);
  if (!defaultFilesResult.success || !s3CopyResult.success) {
    log2.error(
      defaultFilesResult.error || s3CopyResult.error,
      '[createNewPrototype] Failed to get default files from S3',
    );
    throw new Error(
      `Failed to get default files from S3: ${
        defaultFilesResult.error || s3CopyResult.error
      }`,
    );
  }

  const [
    filesInsertResult,
    assetsInsertResult,
    supabaseStorageAssetUploadResult,
  ] = await Promise.all([
    supabase.from('prototype_files').insert(defaultFilesResult.files ?? []),
    supabase.from('prototype_assets').insert(
      (defaultFilesResult.assets ?? []).map((asset) => ({
        prototype_id: asset.prototype_id,
        name: asset.name,
        storage_url: '',
      })),
    ),
    uploadDefaultAssetsToSupabaseStorage(
      supabase,
      defaultFilesResult.assets ?? [],
      log2,
    ),
  ]);
  if (
    filesInsertResult.error ||
    assetsInsertResult.error ||
    !supabaseStorageAssetUploadResult.success
  ) {
    log2.error(
      filesInsertResult.error ||
        assetsInsertResult.error ||
        supabaseStorageAssetUploadResult.error,
      '[createNewPrototype] Failed to insert default files or assets',
    );
    throw new Error(
      `Failed to insert default files or assets: ${
        filesInsertResult.error?.message ||
        assetsInsertResult.error?.message ||
        supabaseStorageAssetUploadResult.error
      }`,
    );
  }
  return s3CopyResult.version;
}
