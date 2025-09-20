import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeResponse,
  HTTP_STATUS,
} from '../../types/PublicAPITypes.js';
import { validateJWTToken } from '../../utils/prototypeAuth.js';
import { hasExceededPrototypeCreationLimit } from '../../utils/subscriptionChecks.js';
import { Database } from '../../types/supabase.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  cleanupPrototypeS3Objects,
  copyAllAssetsInSupabaseStorage,
  copyDefaultAppToVersionedPrototype,
  copyPrototypeThumbnailInSupabaseStorage,
  copyS3BucketContentsVersioned,
  deletePrototypeAssetsFromStorage,
  getDefaultAppFilesFromS3,
  getPrototypeViewingUrl,
} from '../../utils/s3Operations.js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { S3Client } from '@aws-sdk/client-s3';
import {
  PrototypeAssetInsert,
  PrototypeFileInsert,
} from '../../types/InternalTypes.js';

export async function handleCreatePrototypeImpl(
  request: FastifyRequest<{ Body: CreatePrototypeRequestBody }>,
  reply: FastifyReply,
  s3Client: S3Client,
): Promise<CreatePrototypeResponse> {
  try {
    // 1. JWT Token validation and user authentication
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const user = await validateJWTToken(token, request.log2);
    if (!user) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid authentication token',
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
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: 'PROTOTYPE_LIMIT_REACHED',
        message: 'Prototype limit reached',
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
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Free tier users can only make public prototypes',
      };
      reply.status(HTTP_STATUS.BAD_REQUEST);
      return errorResponse;
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
        prototypeInsertError,
        '[handleCreatePrototype] Error creating prototype:',
      );
      const errorResponse: CreatePrototypeErrorResponse = {
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to create prototype in database',
      };
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return errorResponse;
    }

    const newPrototypeId = newPrototype.id;
    try {
      // 5. Handle prototype files and S3 operations
      if (forkPrototypeId) {
        await forkPrototype(
          supabase,
          s3Client,
          forkPrototypeId,
          newPrototypeId,
          request.log2,
        );
      } else {
        await createNewPrototype(
          supabase,
          s3Client,
          newPrototypeId,
          request.log2,
        );
      }

      // 6. Get viewing URL and return success
      const viewingUrl = getPrototypeViewingUrl(newPrototypeId);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: {
          prototype_id: newPrototypeId,
          viewing_url: viewingUrl,
        },
      });
    } catch (error) {
      // If anything fails after prototype creation, clean up
      request.log2.error(error, 'Error during prototype setup:');

      // Clean up S3 objects
      await cleanupPrototypeS3Objects(s3Client, newPrototypeId, request.log2);

      // Clean up Supabase Storage assets
      await deletePrototypeAssetsFromStorage(newPrototypeId, request.log2);

      // Clean up database entry
      await supabase.from('prototypes').delete().eq('id', newPrototypeId);

      const errorResponse: CreatePrototypeErrorResponse = {
        success: false,
        error: 'S3_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to set up prototype files and S3 storage',
      };

      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return errorResponse;
    }
  } catch (error) {
    request.log2.error(error, '[handleCreatePrototype] Unexpected error:');
    const errorResponse: CreatePrototypeErrorResponse = {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'An unexpected error occurred',
    };

    reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return errorResponse;
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
  ): Promise<void> {
    // 1. Fetch files and assets from source prototype and copy assets + s3 builds + thumbnail to new prototype
    const [
      filesResult,
      assetsResult,
      assetsStorageCopyResult,
      thumbnailCopyResult,
      s3CopyResult,
    ] = await Promise.all([
      supabase
        .from('prototype_files')
        .select('*')
        .eq('prototype_id', sourcePrototypeId),
      supabase
        .from('prototype_assets')
        .select('*')
        .eq('prototype_id', sourcePrototypeId),
      copyAllAssetsInSupabaseStorage(
        supabase,
        sourcePrototypeId,
        newPrototypeId,
        log2,
      ),
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
      !assetsStorageCopyResult.success ||
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
          assetsStorageCopyResult.error ||
          thumbnailCopyResult.error ||
          s3CopyResult.error ||
          'Failed copy operations or fetching protototype files+assets',
      );
    }

    const [filesInsertResult, assetsInsertResult] = await Promise.all([
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
    ]);
    if (filesInsertResult.error || assetsInsertResult.error) {
      log2.error(
        filesInsertResult.error || assetsInsertResult.error,
        '[forkPrototype] Failed to insert files or assets',
      );
      throw new Error(
        `Failed to copy prototype files or assets: ${
          filesInsertResult.error?.message || assetsInsertResult.error?.message
        }`,
      );
    }
  }

  /**
   * Helper function to create a new prototype with default files
   */
  async function createNewPrototype(
    supabase: SupabaseClient<Database>,
    s3Client: S3Client,
    newPrototypeId: string,
    log2: SystemLogger,
  ): Promise<void> {
    // Get default app files from S3 raw files
    const defaultFilesResult = await getDefaultAppFilesFromS3(
      s3Client,
      newPrototypeId,
      log2,
    );
    if (!defaultFilesResult.success) {
      log2.error(
        defaultFilesResult,
        '[createNewPrototype] Failed to get default files from S3',
      );
      throw new Error(
        `Failed to get default files from S3: ${defaultFilesResult.error}`,
      );
    }

    // Insert default prototype files into Supabase
    const { error: filesError } = await supabase
      .from('prototype_files')
      .insert(defaultFilesResult.files ?? []);
    if (filesError) {
      log2.error(
        filesError,
        '[createNewPrototype] Failed to insert default files',
      );
      throw new Error(`Failed to insert default files: ${filesError.message}`);
    }

    // Insert default prototype assets into Supabase
    const assetsToInsert: PrototypeAssetInsert[] = (
      defaultFilesResult.assets ?? []
    ).map((asset) => ({
      prototype_id: asset.prototype_id,
      name: asset.name,
      storage_url: '',
    }));
    const { error: assetsError } = await supabase
      .from('prototype_assets')
      .insert(assetsToInsert);

    if (assetsError) {
      log2.error(
        assetsError,
        '[createNewPrototype] Failed to insert default assets',
      );
      throw new Error(
        `Failed to insert default assets: ${assetsError.message}`,
      );
    }

    // Copy default app files to S3 for new prototype with versioned deployment
    const s3CopyResult = await copyDefaultAppToVersionedPrototype(
      s3Client,
      newPrototypeId,
      log2,
    );
    if (!s3CopyResult.success) {
      log2.error(
        s3CopyResult,
        '[createNewPrototype] Failed to copy default app to S3',
      );
      throw new Error(
        `Failed to copy default app to S3: ${s3CopyResult.error}`,
      );
    }
  }
}
