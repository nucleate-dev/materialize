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
import type { Database } from '../../types/supabase.js';

type PrototypeFramework = Database['public']['Enums']['prototype_framework'];

const S3_PROTOTYPE_BUCKET = 'materialize-sites';
const SUPABASE_PROTOTYPE_ASSETS_BUCKET = 'prototype-assets';
const SUPABASE_CHAT_IMAGES_BUCKET = 'chat_images';
const S3_COPY_CONCURRENCY = 10;
const SUPABASE_STORAGE_CONCURRENCY = 5;
const S3_DOWNLOAD_CONCURRENCY = 20;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({
    length: Math.min(concurrency, items.length),
  }).map(async () => {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) break;
      results[index] = await handler(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

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
  const copyResults = await mapWithConcurrency(
    assets,
    SUPABASE_STORAGE_CONCURRENCY,
    async (asset) =>
      supabase.storage
        .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
        .copy(
          `${sourcePrototypeId}/${asset.name}`,
          `${targetPrototypeId}/${asset.name}`,
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

export function getVersion(): string {
  return 'v' + Date.now().toString();
}

/**
 * Copy S3 bucket contents with versioned deployment for forking
 */
export async function copyS3BucketContentsVersioned(
  s3Client: S3Client,
  sourcePrototypeId: string,
  sourceBuildKey: string,
  targetPrototypeId: string,
  targetVersion: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  log2.consoleLogDevOnly(
    'info',
    '[copyS3BucketContentsVersioned] Copying latest build for fork',
    {
      sourcePrototypeId,
      targetPrototypeId,
      version: targetVersion,
    },
  );
  const versionedResult = await copyS3BucketContents(
    s3Client,
    `${sourcePrototypeId}/${sourceBuildKey}/`,
    `${targetPrototypeId}/${targetVersion}/`,
    log2,
  );
  log2.consoleLogDevOnly(
    'info',
    '[copyS3BucketContentsVersioned] Copy completed',
    {
      version: targetVersion,
      versionedSuccess: versionedResult.success,
      copiedObjects: versionedResult.copiedObjects,
    },
  );
  return {
    success: versionedResult.success,
    error: versionedResult.error || undefined,
    copiedObjects: versionedResult.copiedObjects,
    version: targetVersion,
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
  log2.consoleLogDevOnly('info', '[copyS3BucketContents] Starting copy', {
    sourcePrefix,
    destinationPrefix,
  });

  do {
    const listResult: ListObjectsV2CommandOutput = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_PROTOTYPE_BUCKET,
        Prefix: sourcePrefix,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = listResult.NextContinuationToken;
    log2.consoleLogDevOnly('debug', '[copyS3BucketContents] Listed objects', {
      keyCount: listResult.KeyCount ?? 0,
      isTruncated: listResult.IsTruncated,
      continuationToken,
      sourcePrefix,
      destinationPrefix,
    });
    if (!listResult.Contents) continue;

    const copyResults = await mapWithConcurrency(
      listResult.Contents,
      S3_COPY_CONCURRENCY,
      async (object) => {
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
      },
    );

    copyResults.forEach((r) =>
      r.success ? successfulCopies++ : failedCopies++,
    );
  } while (continuationToken);

  log2.consoleLogDevOnly('info', '[copyS3BucketContents] Copy summary', {
    successfulCopies,
    failedCopies,
    sourcePrefix,
    destinationPrefix,
  });

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
  framework: PrototypeFramework,
  version: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const { distFilesPrefix: sourcePrefix } = getDefaultAppFilesSourcePrefixes(
    designStyle,
    framework,
  );
  log2.consoleLogDevOnly(
    'info',
    '[copyDefaultAppToVersionedPrototype] Copying default dist files',
    {
      prototypeId,
      designStyle,
      framework,
      sourcePrefix,
    },
  );
  const copyResult = await copyS3BucketContents(
    s3Client,
    sourcePrefix,
    `${prototypeId}/${version}/`,
    log2,
  );
  log2.consoleLogDevOnly(
    'info',
    '[copyDefaultAppToVersionedPrototype] Copy finished',
    {
      prototypeId,
      success: copyResult.success,
      copiedObjects: copyResult.copiedObjects,
      error: copyResult.error,
    },
  );
  return {
    success: copyResult.success,
    error: copyResult.error,
    copiedObjects: copyResult.copiedObjects,
    version,
  };
}

export async function uploadDefaultAssetsToSupabaseStorage(
  supabase: SupabaseClient<Database>,
  assets: { name: string; contents: Buffer; prototype_id: string }[],
  log2: SystemLogger,
): Promise<S3CopyResult> {
  log2.consoleLogDevOnly(
    'info',
    '[uploadDefaultAssetsToSupabaseStorage] Uploading default assets',
    {
      prototypeId: assets[0]?.prototype_id,
      assetCount: assets.length,
    },
  );
  const uploadResults = await mapWithConcurrency(
    assets,
    SUPABASE_STORAGE_CONCURRENCY,
    async (asset) => {
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
    },
  );
  log2.consoleLogDevOnly(
    'info',
    '[uploadDefaultAssetsToSupabaseStorage] Upload results',
    {
      prototypeId: assets[0]?.prototype_id,
      successCount: uploadResults.filter((r) => r.success).length,
      failureCount: uploadResults.filter((r) => !r.success).length,
    },
  );
  return {
    success: uploadResults.every((r) => r.success),
    error: uploadResults.find((r) => !r.success)?.error || undefined,
    copiedObjects: uploadResults.length,
  };
}

/**
 * Copy a prototype build output into a deployment-specific prefix
 */
export async function copyPrototypeBuildToDeploymentFolder(
  s3Client: S3Client,
  prototypeId: string,
  buildKey: string | null | undefined,
  deploymentKey: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const normalizedBuildKey =
    (buildKey && buildKey.replace(/^\/+|\/+$/g, '')) || 'latest';
  const normalizedDeploymentKey = deploymentKey.replace(/^\/+|\/+$/g, '');
  const sourcePrefix = `${prototypeId}/${normalizedBuildKey}/`;
  const destinationPrefix = `${prototypeId}/${normalizedDeploymentKey}/`;

  log2.consoleLogDevOnly(
    'info',
    '[copyPrototypeBuildToDeploymentFolder] Copying build to deployment prefix',
    {
      prototypeId,
      buildKey: normalizedBuildKey,
      deploymentKey: normalizedDeploymentKey,
      sourcePrefix,
      destinationPrefix,
    },
  );

  const copyResult = await copyS3BucketContents(
    s3Client,
    sourcePrefix,
    destinationPrefix,
    log2,
  );

  if (!copyResult.success) {
    log2.error(
      new Error(copyResult.error || 'Unknown copy error'),
      '[copyPrototypeBuildToDeploymentFolder] Failed to copy build to deployment prefix',
      {
        prototypeId,
        buildKey: normalizedBuildKey,
        deploymentKey: normalizedDeploymentKey,
        sourcePrefix,
        destinationPrefix,
      },
    );
  } else {
    log2.consoleLogDevOnly(
      'info',
      '[copyPrototypeBuildToDeploymentFolder] Copy completed',
      {
        prototypeId,
        buildKey: normalizedBuildKey,
        deploymentKey: normalizedDeploymentKey,
        copiedObjects: copyResult.copiedObjects,
      },
    );
  }

  return copyResult;
}

async function deleteObjectsWithPrefix(
  s3Client: S3Client,
  prefix: string,
  log2: SystemLogger,
): Promise<boolean> {
  let continuationToken: string | undefined;
  let hasError = false;

  do {
    const listResponse: ListObjectsV2CommandOutput = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_PROTOTYPE_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = listResponse.NextContinuationToken;
    const objects = listResponse.Contents ?? [];
    if (objects.length === 0) {
      continue;
    }
    try {
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: S3_PROTOTYPE_BUCKET,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key! })),
          },
        }),
      );
    } catch (error) {
      hasError = true;
      log2.error(error, '[deleteObjectsWithPrefix] Failed to delete batch', {
        prefix,
      });
    }
  } while (continuationToken);

  return !hasError;
}

export async function listPrototypeDeploymentPrefixes(
  s3Client: S3Client,
  prototypeId: string,
  log2: SystemLogger,
): Promise<string[]> {
  const prefix = `${prototypeId}/d`;
  const deploymentPrefixes = new Set<string>();
  let continuationToken: string | undefined;
  do {
    const listResponse: ListObjectsV2CommandOutput = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_PROTOTYPE_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = listResponse.NextContinuationToken;
    for (const object of listResponse.Contents ?? []) {
      if (!object.Key) continue;
      const remaining = object.Key.slice(prototypeId.length + 1);
      const match = remaining.match(/(d[^/]+)\//);
      if (match) {
        deploymentPrefixes.add(`${prototypeId}/${match[1]}/`);
      }
    }
  } while (continuationToken);

  log2.consoleLogDevOnly('info', '[listPrototypeDeploymentPrefixes] Found', {
    prototypeId,
    prefixes: Array.from(deploymentPrefixes),
  });
  return Array.from(deploymentPrefixes);
}

export async function deletePrototypeDeploymentPrefixes(
  s3Client: S3Client,
  prefixes: string[],
  log2: SystemLogger,
): Promise<boolean> {
  if (prefixes.length === 0) {
    return true;
  }
  log2.consoleLogDevOnly(
    'info',
    '[deletePrototypeDeploymentPrefixes] Deleting old deployment folders',
    { prefixes },
  );
  const results = await Promise.all(
    prefixes.map((prefix) => deleteObjectsWithPrefix(s3Client, prefix, log2)),
  );
  return results.every(Boolean);
}

/**
 * Get the viewing URL for a prototype
 */
export function getPrototypeViewingUrl(prototypeId: string): string {
  return `https://${prototypeId}.build.nucleate.dev/`;
}

export function getDefaultAppFilesSourcePrefixes(
  designStyle: DesignStyle,
  framework?: PrototypeFramework,
): Record<string, string> {
  // Use development prefixes when NODE_ENV is development
  const envPrefix =
    process.env.NODE_ENV === 'development' ? 'development-' : '';

  let rawFilesPrefix = '';
  let distFilesPrefix = '';

  if (framework === 'web_nextjs_react') {
    rawFilesPrefix = `${envPrefix}web-starter-app-nextjs-raw-files/`;
    distFilesPrefix = `${envPrefix}web-starter-app-nextjs/`;
    return { rawFilesPrefix, distFilesPrefix };
  }

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
  framework: PrototypeFramework,
  log2: SystemLogger,
): Promise<DefaultFilesResult> {
  const { rawFilesPrefix: sourcePrefix } = getDefaultAppFilesSourcePrefixes(
    designStyle,
    framework,
  );
  log2.consoleLogDevOnly(
    'info',
    '[getDefaultAppFilesFromS3] Fetching starter files',
    {
      prototypeId,
      designStyle,
      framework,
      sourcePrefix,
    },
  );
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
    log2.consoleLogDevOnly(
      'info',
      '[getDefaultAppFilesFromS3] Listed starter files',
      {
        keyCount: keys.length,
        prototypeId,
        sourcePrefix,
      },
    );
    if (keys.length === 0) {
      log2.error(
        null,
        '[getDefaultAppFilesFromS3] No default app files found in S3!',
      );
      return { success: false, error: 'No default app files found in S3' };
    }

    const results = await mapWithConcurrency(
      keys,
      S3_DOWNLOAD_CONCURRENCY,
      async (fileName) => {
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
      },
    );
    const files: PrototypeFileInsert[] = [];
    const assets: { name: string; contents: Buffer; prototype_id: string }[] =
      [];

    results.forEach((result) => {
      if (result.type === 'file') {
        files.push({
          prototype_id: prototypeId,
          name: result.name,
          contents: result.contents,
        });
      } else {
        assets.push({
          prototype_id: prototypeId,
          name: result.name,
          contents: result.contents,
        });
      }
    });
    log2.consoleLogDevOnly(
      'info',
      '[getDefaultAppFilesFromS3] Prepared default files',
      {
        prototypeId,
        fileCount: files.length,
        assetCount: assets.length,
      },
    );

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
    const prefix = prototypeId; // matches prototypeId builds and deployments
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
