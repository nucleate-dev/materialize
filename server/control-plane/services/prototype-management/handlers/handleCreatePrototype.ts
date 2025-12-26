import { S3Client } from '@aws-sdk/client-s3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import {
  DesignStyle,
  PrototypeAssetInsert,
  PrototypeFileInsert,
} from '../../../types/InternalTypes.js';
import {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
  HTTP_STATUS,
} from '../../../types/PublicAPITypes.js';
import { Database, TablesInsert } from '../../../types/supabase.js';
import {
  checkUserHasPrototypeViewingAccess,
  validateJWTToken,
} from '../../../utils/prototypeAuth.js';
import { hasExceededPrototypeCreationLimit } from '../../../utils/subscriptionChecks.js';
import {
  copyAllAssetsInSupabaseStorage,
  copyDefaultAppToVersionedPrototype,
  copyDefaultPrototypeThumbnail,
  copyPrototypeThumbnailInSupabaseStorage,
  copyS3BucketContentsVersioned,
  deletePrototypeAssetsFromStorage,
  deletePrototypeS3Builds,
  deletePrototypeThumbnailFromSupabaseStorage,
  getDefaultAppFilesFromS3,
  getVersion,
  getPrototypeViewingUrl,
  uploadDefaultAssetsToSupabaseStorage,
} from '../storageOperations.js';

const VALID_DESIGN_STYLES: DesignStyle[] = [
  'tamagui',
  'stylesheets',
  'nativewind',
];
type PrototypeFramework = Database['public']['Enums']['prototype_framework'];
const VALID_FRAMEWORKS: PrototypeFramework[] = [
  'mobile_expo_react_native',
  'web_nextjs_react',
];
const DEFAULT_FRAMEWORK: PrototypeFramework = 'mobile_expo_react_native';

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
    const { user } = await validateJWTToken(token, request.log2);
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
    // 2. Extract validated body (validation handled by Fastify schema)
    const {
      name,
      creation_source,
      description,
      team_id,
      folder_id,
      prototype_id: forkPrototypeId, // If provided, this is a fork
      design_style,
      custom_design_system,
      framework,
    } = request.body;
    let { visibility } = request.body;

    // update logger context
    request.log2 = request.log2.child({
      userId: user.id,
      creationSource: creation_source,
    });
    request.log2.consoleLogDevOnly(
      'info',
      '[handleCreatePrototype] Authenticated user for prototype creation',
      {
        userId: user.id,
        creationSource: creation_source,
      },
    );

    // 3. Check prototype limits for free users (5 max)
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
    request.log2.consoleLogDevOnly(
      'info',
      '[handleCreatePrototype] Prototype limit verification complete',
      {
        plan: limitCheck.plan,
        exceeded: limitCheck.exceeded,
        creationSource: creation_source,
      },
    );
    if (!visibility) {
      visibility = 'PUBLIC';
    }
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

    // Resolve design system configuration for the new prototype
    let resolvedDesignStyle: DesignStyle | null = design_style ?? null;
    let resolvedCustomDesignSystem: string | null =
      custom_design_system ?? null;

    const requestedFramework = framework;
    let resolvedFramework: PrototypeFramework = DEFAULT_FRAMEWORK;

    if (forkPrototypeId) {
      const { data: sourcePrototype, error: sourcePrototypeError } =
        await supabase
          .from('prototypes')
          .select('design_style, framework')
          .eq('id', forkPrototypeId)
          .single();

      if (sourcePrototypeError) {
        request.log2.error(
          sourcePrototypeError,
          '[handleCreatePrototype] Failed to fetch source prototype design system',
        );
      } else if (sourcePrototype) {
        if (!resolvedDesignStyle) {
          resolvedDesignStyle = sourcePrototype.design_style;
        }
        if (sourcePrototype.framework) {
          resolvedFramework = sourcePrototype.framework;
        }
      }
    }

    if (
      !forkPrototypeId &&
      requestedFramework &&
      VALID_FRAMEWORKS.includes(requestedFramework)
    ) {
      resolvedFramework = requestedFramework;
    }

    if (!resolvedDesignStyle && folder_id) {
      const { data: folderData, error: projectError } = await supabase
        .from('folders')
        .select('default_design_style, custom_design_system')
        .eq('id', folder_id)
        .single();

      if (projectError) {
        request.log2.error(
          projectError,
          '[handleCreatePrototype] Failed to fetch project for default design system',
        );
      } else if (folderData) {
        // 1. Use the folder's default_design_style if it's valid
        const folderStyle = folderData.default_design_style;
        if (VALID_DESIGN_STYLES.includes(folderStyle as DesignStyle)) {
          resolvedDesignStyle = folderStyle;
        }

        // 2. Inherit the folder's custom_design_system UUID if we don't already have one
        if (!resolvedCustomDesignSystem && folderData.custom_design_system) {
          resolvedCustomDesignSystem = folderData.custom_design_system;
        }
      }
    }

    if (!resolvedDesignStyle) {
      resolvedDesignStyle = 'stylesheets';
    }
    request.log2.consoleLogDevOnly(
      'info',
      '[handleCreatePrototype] Resolved design + framework configuration',
      {
        resolvedDesignStyle,
        resolvedFramework,
        resolvedCustomDesignSystem,
        forkPrototypeId,
        folderId: folder_id,
      },
    );

    const version = getVersion();
    const { data: newPrototype, error: prototypeInsertError } = await supabase
      .from('prototypes')
      .insert({
        name,
        description,
        owner_id: user.id,
        folder_id,
        visibility:
          visibility || (limitCheck.plan === 'plus' ? 'SELF' : 'PUBLIC'),
        design_style: resolvedDesignStyle,
        custom_design_system: forkPrototypeId
          ? null
          : resolvedCustomDesignSystem,
        framework: resolvedFramework,
        latest_build_key: version,
        team_id: team_id,
      } satisfies TablesInsert<'prototypes'>)
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
    request.log2.consoleLogDevOnly(
      'info',
      '[handleCreatePrototype] Inserted prototype row',
      {
        prototypeId: newPrototypeId,
        resolvedFramework,
        resolvedDesignStyle,
      },
    );
    try {
      // 5. Handle prototype files and S3 operations
      if (forkPrototypeId) {
        request.log2.consoleLogDevOnly(
          'info',
          '[handleCreatePrototype] Forking prototype files/assets',
          {
            sourcePrototypeId: forkPrototypeId,
            newPrototypeId,
          },
        );
        await forkPrototype(
          supabase,
          s3Client,
          forkPrototypeId,
          newPrototypeId,
          token,
          version,
          request.log2,
        );
      } else {
        request.log2.consoleLogDevOnly(
          'info',
          '[handleCreatePrototype] Copying default starter files/assets',
          {
            newPrototypeId,
            designStyle: resolvedDesignStyle,
            framework: resolvedFramework,
          },
        );
        await copyAllDefaultsForNewPrototype(
          supabase,
          s3Client,
          newPrototypeId,
          resolvedDesignStyle,
          resolvedFramework,
          version,
          request.log2,
        );
      }

      const { error: buildHistoryError } = await supabase
        .from('prototype_build_history')
        .insert({
          prototype_id: newPrototypeId,
          build_key: version,
          deploy_key: '',
        } satisfies TablesInsert<'prototype_build_history'>);
      if (buildHistoryError) {
        request.log2.error(
          buildHistoryError,
          '[handleCreatePrototype] Failed to insert prototype_build_history entry',
          {
            newPrototypeId,
            version,
          },
        );
      }

      // 6. Get viewing URL and return success
      const viewingUrl = getPrototypeViewingUrl(newPrototypeId);
      request.log2.consoleLogDevOnly(
        'info',
        '[handleCreatePrototype] Returning success response',
        {
          newPrototypeId,
          viewingUrl,
        },
      );
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
  jwtToken: string | undefined,
  targetVersion: string,
  log2: SystemLogger,
): Promise<void> {
  const accessResult = await checkUserHasPrototypeViewingAccess(
    sourcePrototypeId,
    jwtToken,
    log2,
  );
  if (!accessResult?.prototype) {
    log2.warn(
      '[forkPrototype] User attempted to fork prototype without access',
      {
        sourcePrototypeId,
        newPrototypeId,
      },
    );
    throw new Error('Access denied for source prototype');
  }
  const sourceBuildKey = accessResult.prototype.latest_build_key;

  // 1. Fetch files and assets from source prototype and copy assets + s3 builds + thumbnail to new prototype
  const isSourceOwner =
    accessResult.prototype.owner_id === accessResult.user?.id ||
    accessResult.isServiceRole;

  const [
    filesResult,
    assetsResult,
    s3CopyResult,
    thumbnailCopyResult,
    envVarResult,
  ] = await Promise.all([
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
      sourceBuildKey ?? 'latest',
      newPrototypeId,
      targetVersion,
      log2,
    ),
    copyPrototypeThumbnailInSupabaseStorage(
      supabase,
      sourcePrototypeId,
      newPrototypeId,
    ),
    supabase
      .from('prototype_env_vars')
      .select('name,is_public,prototype_env_var_secrets(secret_value)')
      .eq('prototype_id', sourcePrototypeId),
  ]);
  if (
    filesResult.error ||
    assetsResult.error ||
    !s3CopyResult.success ||
    !thumbnailCopyResult.success ||
    envVarResult.error
  ) {
    log2.error(
      filesResult.error,
      '[forkPrototype] Failed to copy prototype storage items or fetch prototype files/assets/env vars',
    );
    throw new Error(
      filesResult.error?.message ||
        assetsResult.error?.message ||
        thumbnailCopyResult.error ||
        s3CopyResult.error ||
        envVarResult.error?.message ||
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
            }) as PrototypeFileInsert,
        ),
      ),
      supabase.from('prototype_assets').insert(
        assetsResult.data.map(
          (asset) =>
            ({
              prototype_id: newPrototypeId,
              name: asset.name,
            }) as PrototypeAssetInsert,
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

  if (envVarResult.data && envVarResult.data.length > 0) {
    const sourceEnvVars = envVarResult.data.filter((envVar) => envVar.name);
    const envVarPayload = sourceEnvVars.map(
      (envVar) =>
        ({
          prototype_id: newPrototypeId,
          name: envVar.name!,
          is_public: envVar.is_public ?? false,
        }) satisfies TablesInsert<'prototype_env_vars'>,
    );

    if (envVarPayload.length > 0) {
      const { data: insertedEnvVars, error: envInsertError } = await supabase
        .from('prototype_env_vars')
        .insert(envVarPayload)
        .select('id,name');
      if (envInsertError) {
        log2.error(
          envInsertError,
          '[forkPrototype] Failed to copy prototype env vars',
        );
        throw new Error(
          envInsertError.message ||
            'Failed to copy prototype environment variables',
        );
      }

      if (isSourceOwner && insertedEnvVars) {
        const secretByName = new Map(
          sourceEnvVars
            .map((envVar) => ({
              name: envVar.name!,
              secret: envVar.prototype_env_var_secrets?.secret_value ?? null,
            }))
            .filter((entry) => entry.secret && entry.secret.length > 0)
            .map((entry) => [entry.name, entry.secret as string]),
        );

        const secretPayload: TablesInsert<'prototype_env_var_secrets'>[] = [];
        insertedEnvVars.forEach((envVar) => {
          const secretValue = secretByName.get(envVar.name);
          if (!secretValue) {
            return;
          }
          secretPayload.push({
            env_var_id: envVar.id,
            secret_value: secretValue,
          });
        });

        if (secretPayload.length > 0) {
          const { error: envSecretInsertError } = await supabase
            .from('prototype_env_var_secrets')
            .upsert(secretPayload);
          if (envSecretInsertError) {
            log2.error(
              envSecretInsertError,
              '[forkPrototype] Failed to copy prototype env var secrets',
            );
            throw new Error(
              envSecretInsertError.message ||
                'Failed to copy prototype environment variable secrets',
            );
          }
        }
      }
    }
  }
  return;
}

/**
 * Helper function to create a new prototype with default files
 */
export async function copyAllDefaultsForNewPrototype(
  supabase: SupabaseClient<Database>,
  s3Client: S3Client,
  newPrototypeId: string,
  newPrototypeDesignStyle: DesignStyle,
  framework: PrototypeFramework,
  version: string,
  log2: SystemLogger,
): Promise<void> {
  log2.consoleLogDevOnly(
    'info',
    '[copyAllDefaultsForNewPrototype] Starting default asset copy',
    {
      newPrototypeId,
      designStyle: newPrototypeDesignStyle,
      framework,
    },
  );
  // Get default app files from S3 raw files
  const [defaultFilesResult, s3CopyResult, thumbnailCopyResult] =
    await Promise.all([
      getDefaultAppFilesFromS3(
        s3Client,
        newPrototypeId,
        newPrototypeDesignStyle,
        framework,
        log2,
      ),
      copyDefaultAppToVersionedPrototype(
        s3Client,
        newPrototypeId,
        newPrototypeDesignStyle,
        framework,
        version,
        log2,
      ),
      copyDefaultPrototypeThumbnail(supabase, newPrototypeId),
    ]);
  log2.consoleLogDevOnly(
    'info',
    '[copyAllDefaultsForNewPrototype] Default asset copy results',
    {
      newPrototypeId,
      defaultFilesSuccess: defaultFilesResult.success,
      s3CopySuccess: s3CopyResult.success,
      thumbnailCopySuccess: thumbnailCopyResult.success,
      defaultFileError: defaultFilesResult.error,
      s3CopyError: s3CopyResult.error,
      thumbnailError: thumbnailCopyResult.error,
    },
  );
  if (
    !defaultFilesResult.success ||
    !s3CopyResult.success ||
    !thumbnailCopyResult.success
  ) {
    log2.error(
      defaultFilesResult.error ||
        s3CopyResult.error ||
        thumbnailCopyResult.error,
      '[createNewPrototype] Failed to get default files from S3 or copy thumbnail',
    );
    throw new Error(
      `Failed to get default files from S3 or copy thumbnail: ${
        defaultFilesResult.error ||
        s3CopyResult.error ||
        thumbnailCopyResult.error
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
      (defaultFilesResult.assets ?? []).map(
        (asset): PrototypeAssetInsert => ({
          prototype_id: asset.prototype_id,
          name: asset.name,
        }),
      ),
    ),
    uploadDefaultAssetsToSupabaseStorage(
      supabase,
      defaultFilesResult.assets ?? [],
      log2,
    ),
  ]);
  log2.consoleLogDevOnly(
    'info',
    '[copyAllDefaultsForNewPrototype] Database insert results',
    {
      newPrototypeId,
      filesError: filesInsertResult.error?.message,
      assetsError: assetsInsertResult.error?.message,
      supabaseStorageSuccess: supabaseStorageAssetUploadResult.success,
    },
  );
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
  log2.consoleLogDevOnly(
    'info',
    '[copyAllDefaultsForNewPrototype] Completed default setup',
    {
      newPrototypeId,
      version,
      fileCount: defaultFilesResult.files?.length ?? 0,
      assetCount: defaultFilesResult.assets?.length ?? 0,
    },
  );
  return;
}
