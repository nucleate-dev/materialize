import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import { SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import type {
  DefaultFilesResult,
  DesignStyle,
  PrototypeAssetRow,
  PrototypeFileInsert,
  S3CopyResult,
} from '../../types/InternalTypes.js';
import { Database } from '../../types/supabase.js';

const S3_PROTOTYPE_BUCKET = 'materialize-sites';
const SUPABASE_PROTOTYPE_ASSETS_BUCKET = 'prototype-assets';
const SUPABASE_CHAT_IMAGES_BUCKET = 'chat_images';

/**
 * Get content type for file based on extension
 */
function getContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'js':
    case 'jsx':
      return 'application/javascript';
    case 'ts':
    case 'tsx':
      return 'application/typescript';
    case 'json':
      return 'application/json';
    case 'css':
      return 'text/css';
    case 'html':
      return 'text/html';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'text/plain';
  }
}

export async function copyAllAssetsInSupabaseStorage(
  supabase: SupabaseClient<Database>,
  assets: PrototypeAssetRow[],
  sourcePrototypeId: string,
  targetPrototypeId: string,
): Promise<S3CopyResult> {
  const copyResults = await Promise.all(
    assets.map((asset) =>
      supabase.storage
        .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
        .copy(
          `${sourcePrototypeId}/${asset.name}`,
          `${targetPrototypeId}/${asset.name}`,
        ),
    ),
  );
  const firstError = copyResults.find((r) => r.error);
  return {
    success: firstError ? false : true,
    error: firstError
      ? firstError.error?.message || 'Unknown error during copy'
      : undefined,
    copiedObjects: copyResults.length,
  };
}

export async function copyPrototypeThumbnailInSupabaseStorage(
  supabase: SupabaseClient<Database>,
  sourcePrototypeId: string,
  targetPrototypeId: string,
): Promise<S3CopyResult> {
  const { error } = await supabase.storage
    .from('prototype-thumbnails')
    .copy(`${sourcePrototypeId}.png`, `${targetPrototypeId}.png`);
  return {
    success: error ? false : true,
    error: error ? error.message : undefined,
    copiedObjects: 1,
  };
}

export async function copyDefaultPrototypeThumbnail(
  supabase: SupabaseClient<Database>,
  targetPrototypeId: string,
): Promise<S3CopyResult> {
  const { error } = await supabase.storage
    .from('prototype-thumbnails')
    .copy('default-prototype-thumbnail.png', `${targetPrototypeId}.png`);
  return {
    success: error ? false : true,
    error: error ? error.message : undefined,
    copiedObjects: 1,
  };
}

function getVersion(): string {
  return 'v' + Date.now().toString();
}

/**
 * Copy S3 bucket contents with versioned deployment for forking
 */
export async function copyS3BucketContentsVersioned(
  s3Client: S3Client,
  sourcePrototypeId: string,
  targetPrototypeId: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const version = getVersion();
  const [versionedResult, latestResult] = await Promise.all([
    copyS3BucketContents(
      s3Client,
      `${sourcePrototypeId}/latest/`,
      `${targetPrototypeId}/${version}/`,
      log2,
    ),
    copyS3BucketContents(
      s3Client,
      `${sourcePrototypeId}/latest/`,
      `${targetPrototypeId}/latest/`,
      log2,
    ),
  ]);
  return {
    success: versionedResult.success && latestResult.success,
    error: versionedResult.error || latestResult.error || undefined,
    copiedObjects: versionedResult.copiedObjects + latestResult.copiedObjects,
    version,
  };
}

/**
 * Copy S3 bucket contents from one prefix to another
 */
async function copyS3BucketContents(
  s3Client: S3Client,
  sourcePrefix: string,
  destinationPrefix: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  let continuationToken: string | undefined = undefined;
  let successfulCopies = 0;
  let failedCopies = 0;

  do {
    const listResult: ListObjectsV2CommandOutput = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_PROTOTYPE_BUCKET,
        Prefix: sourcePrefix,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = listResult.NextContinuationToken;
    if (!listResult.Contents) continue;

    const copyResults = await Promise.all(
      listResult.Contents.map(async (object) => {
        if (!object.Key) return { success: false };
        const sourceKey = object.Key;
        const destinationKey = object.Key.replace(
          sourcePrefix,
          destinationPrefix,
        );

        try {
          await s3Client.send(
            new CopyObjectCommand({
              Bucket: S3_PROTOTYPE_BUCKET,
              CopySource: `${S3_PROTOTYPE_BUCKET}/${encodeURIComponent(
                sourceKey,
              )}`,
              Key: destinationKey,
            }),
          );
          return { success: true };
        } catch (err) {
          log2.error(
            err,
            `[copyS3BucketContents] Failed: ${sourceKey} → ${destinationKey}`,
          );
          return { success: false };
        }
      }),
    );

    copyResults.forEach((r) =>
      r.success ? successfulCopies++ : failedCopies++,
    );
  } while (continuationToken);

  return {
    success: failedCopies === 0,
    copiedObjects: successfulCopies,
    error: failedCopies ? `${failedCopies} copy operations failed` : undefined,
  };
}

/**
 * Copy default app to a new prototype with versioned deployment
 */
export async function copyDefaultAppToVersionedPrototype(
  s3Client: S3Client,
  prototypeId: string,
  designStyle: DesignStyle,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const { distFilesPrefix: sourcePrefix } =
    getDefaultAppFilesSourcePrefixes(designStyle);
  const version = getVersion();
  const [versionedResult, latestResult] = await Promise.all([
    copyS3BucketContents(
      s3Client,
      sourcePrefix,
      `${prototypeId}/${version}/`,
      log2,
    ),
    copyS3BucketContents(
      s3Client,
      sourcePrefix,
      `${prototypeId}/latest/`,
      log2,
    ),
  ]);
  return {
    success: versionedResult.success && latestResult.success,
    error: versionedResult.error || latestResult.error || undefined,
    copiedObjects: versionedResult.copiedObjects + latestResult.copiedObjects,
    version,
  };
}

export async function uploadDefaultAssetsToSupabaseStorage(
  supabase: SupabaseClient<Database>,
  assets: { name: string; contents: Buffer; prototype_id: string }[],
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const uploadResults = await Promise.all(
    assets.map(async (asset) => {
      const filePath = `${asset.prototype_id}/${asset.name}`;
      const { error } = await supabase.storage
        .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
        .upload(filePath, asset.contents, {
          contentType: getContentType(asset.name),
          upsert: true,
        });
      if (error) {
        log2.error(error, 'Error uploading to Supabase Storage:', {
          functionName: 'uploadAssetToSupabaseStorage',
        });
        return { success: false, error: error.message };
      }

      return {
        success: true,
      };
    }),
  );
  return {
    success: uploadResults.every((r) => r.success),
    error: uploadResults.find((r) => !r.success)?.error || undefined,
    copiedObjects: uploadResults.length,
  };
}

/**
 * Get the viewing URL for a prototype
 */
export function getPrototypeViewingUrl(prototypeId: string): string {
  return `https://${prototypeId}.render.materializeui.com/`;
}

export function getDefaultAppFilesSourcePrefixes(
  designStyle: DesignStyle,
): Record<string, string> {
  // Use development prefixes when NODE_ENV is development
  const envPrefix =
    process.env.NODE_ENV === 'development' ? 'development-' : '';

  let rawFilesPrefix = '';
  let distFilesPrefix = '';
  switch (designStyle) {
    case 'tamagui':
      rawFilesPrefix = `${envPrefix}starter-app-tamagui-raw-files/`;
      distFilesPrefix = `${envPrefix}starter-app-tamagui/`;
      break;
    case 'stylesheets':
      rawFilesPrefix = `${envPrefix}starter-app-stylesheets-raw-files/`;
      distFilesPrefix = `${envPrefix}starter-app-stylesheets/`;
      break;
    case 'nativewind':
      rawFilesPrefix = `${envPrefix}starter-app-nativewind-raw-files/`;
      distFilesPrefix = `${envPrefix}starter-app-nativewind/`;
      break;
  }
  return { rawFilesPrefix, distFilesPrefix };
}
/**
 * Get default app files from S3 raw files and format for Supabase insertion
 */
export async function getDefaultAppFilesFromS3(
  s3Client: S3Client,
  prototypeId: string,
  designStyle: DesignStyle,
  log2: SystemLogger,
): Promise<DefaultFilesResult> {
  const { rawFilesPrefix: sourcePrefix } =
    getDefaultAppFilesSourcePrefixes(designStyle);
  try {
    const listResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_PROTOTYPE_BUCKET,
        Prefix: sourcePrefix,
      }),
    );

    const keys = (listResult.Contents ?? [])
      .map((obj) => obj.Key?.replace(sourcePrefix, ''))
      .filter((key): key is string => Boolean(key));
    if (keys.length === 0) {
      log2.error(
        null,
        '[getDefaultAppFilesFromS3] No default app files found in S3!',
      );
      return { success: false, error: 'No default app files found in S3' };
    }

    // Process all files concurrently — fail fast if any error
    const results = await Promise.all(
      keys.map(async (fileName) => {
        const getCommand = new GetObjectCommand({
          Bucket: S3_PROTOTYPE_BUCKET,
          Key: `${sourcePrefix}${fileName}`,
        });
        const obj = await s3Client.send(getCommand);
        if (!obj.Body) throw new Error(`No body returned for ${fileName}`);

        const isAsset =
          /\.(png|jpg|jpeg|gif|ico|svg|ttf|woff|woff2|eot)$/i.test(fileName);

        if (isAsset) {
          const buffer = Buffer.from(await obj.Body.transformToByteArray());
          return { type: 'asset' as const, name: fileName, contents: buffer };
        } else {
          const contents = await obj.Body.transformToString();
          return { type: 'file' as const, name: fileName, contents };
        }
      }),
    );
    const files: PrototypeFileInsert[] = results
      .filter((r) => r.type === 'file')
      .map(
        (r) =>
          ({
            prototype_id: prototypeId,
            name: r.name,
            contents: r.contents,
          }) as PrototypeFileInsert,
      );
    const assets: { name: string; contents: Buffer; prototype_id: string }[] =
      results
        .filter((r) => r.type === 'asset')
        .map((r) => ({ prototype_id: prototypeId, ...r }));

    return { success: true, files, assets };
  } catch (error) {
    log2.error(error, '[getDefaultAppFilesFromS3] Critical error');
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get default app files',
    };
  }
}

/**
 * Delete S3 objects for a prototype
 */
export async function deletePrototypeS3Builds(
  s3Client: S3Client,
  prototypeId: string,
  log2: SystemLogger,
): Promise<boolean> {
  try {
    const prefix = prototypeId; // matches prototypeId/latest/, prototypeId/v123/, etc.
    let continuationToken: string | undefined = undefined;

    do {
      const listResponse: ListObjectsV2CommandOutput = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: S3_PROTOTYPE_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = listResponse.Contents ?? [];

      if (objects.length > 0) {
        const deleteParams = {
          Bucket: S3_PROTOTYPE_BUCKET,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key! })),
          },
        };
        await s3Client.send(new DeleteObjectsCommand(deleteParams));
      }

      continuationToken = listResponse.IsTruncated
        ? listResponse.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return true;
  } catch (error) {
    log2.error(error, '[cleanupPrototypeS3Objects] Error');
    return false;
  }
}

export async function deletePrototypeThumbnailFromSupabaseStorage(
  supabase: SupabaseClient<Database>,
  prototypeId: string,
  log2: SystemLogger,
): Promise<boolean> {
  const removeResult = await supabase.storage
    .from('prototype-thumbnails')
    .remove([`${prototypeId}.png`]);
  if (removeResult.error) {
    log2.error(
      removeResult.error,
      '[deletePrototypeThumbnailFromSupabaseStorage] Supabase error',
    );
    return false;
  }
  return true;
}

/**
 * Delete prototype assets from Supabase Storage
 */
export async function deletePrototypeAssetsFromStorage(
  supabase: SupabaseClient<Database>,
  prototypeId: string,
  log2: SystemLogger,
): Promise<boolean> {
  try {
    // Recursively list all files with the prototypeId prefix
    const allFiles: string[] = [];
    const listFilesRecursively = async (path: string = ''): Promise<void> => {
      const { data: items, error: listError } = await supabase.storage
        .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
        .list(path);
      if (listError) {
        throw listError;
      }
      if (!items || items.length === 0) {
        return;
      }
      for (const item of items) {
        const fullPath = path ? `${path}/${item.name}` : item.name;
        if (item.metadata) {
          // If it's a file (not a folder), add it to our list
          allFiles.push(fullPath);
        } else {
          // If it's a folder, recurse into it
          await listFilesRecursively(fullPath);
        }
      }
    };
    await listFilesRecursively(prototypeId);

    if (allFiles.length === 0) {
      log2.consoleLogDevOnly(
        'info',
        '[deletePrototypeAssetsFromStorage] No files found',
      );
      return true;
    }

    log2.consoleLogDevOnly('info', 'Deleting files from Supabase Storage', {
      filePaths: allFiles,
      totalFiles: allFiles.length,
    });

    // Delete files in batches (Supabase has limits on bulk operations)
    const batchSize = 100;
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);
      const { error: deleteError } = await supabase.storage
        .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
        .remove(batch);

      if (deleteError) {
        log2.error(
          deleteError,
          `[deletePrototypeAssetsFromStorage] Supabase error deleting batch ${
            i / batchSize + 1
          }`,
        );
        return false;
      }
    }

    return true;
  } catch (error) {
    log2.error(error, '[deletePrototypeAssetsFromStorage] Error');
    return false;
  }
}

/**
 * Delete all chat images for a prototype from Supabase Storage chat_images bucket
 * Directory structure: {prototype_id}/chat.png (and potentially more files)
 */
export async function deletePrototypeChatImagesFromStorage(
  supabase: SupabaseClient<Database>,
  prototypeId: string,
  log2: SystemLogger,
): Promise<boolean> {
  try {
    // Recursively list all files under {prototypeId}/
    const allFiles: string[] = [];
    const listFilesRecursively = async (path: string = ''): Promise<void> => {
      const { data: items, error: listError } = await supabase.storage
        .from(SUPABASE_CHAT_IMAGES_BUCKET)
        .list(path);
      if (listError) {
        throw listError;
      }
      if (!items || items.length === 0) {
        return;
      }
      for (const item of items) {
        const fullPath = path ? `${path}/${item.name}` : item.name;
        if (item.metadata) {
          // file
          allFiles.push(fullPath);
        } else {
          // folder
          await listFilesRecursively(fullPath);
        }
      }
    };
    await listFilesRecursively(prototypeId);

    if (allFiles.length === 0) {
      log2.consoleLogDevOnly(
        'info',
        '[deletePrototypeChatImagesFromStorage] No files found',
        {
          prototypeId,
        },
      );
      return true;
    }

    log2.consoleLogDevOnly(
      'info',
      'Deleting chat images from Supabase Storage',
      {
        filePaths: allFiles,
        totalFiles: allFiles.length,
        prototypeId,
      },
    );

    // Delete in batches to respect limits
    const batchSize = 100;
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);
      const { error: deleteError } = await supabase.storage
        .from(SUPABASE_CHAT_IMAGES_BUCKET)
        .remove(batch);
      if (deleteError) {
        log2.error(
          deleteError,
          `[deletePrototypeChatImagesFromStorage] Supabase error deleting batch ${
            i / batchSize + 1
          }`,
        );
        return false;
      }
    }

    return true;
  } catch (error) {
    log2.error(error, '[deletePrototypeChatImagesFromStorage] Error');
    return false;
  }
}
