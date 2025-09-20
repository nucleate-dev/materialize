import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import type {
  DefaultFilesResult,
  PrototypeAssetInsert,
  PrototypeFileInsert,
  S3CopyResult,
  S3UploadResult,
} from '../types/InternalTypes.js';
import { Database } from '../types/supabase.js';

// Initialize Supabase storage client
const supabaseStorage = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const S3_PROTOTYPE_BUCKET = 'materialize-sites';
const SUPABASE_PROTOTYPE_ASSETS_BUCKET = 'prototype-assets';

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

/**
 * Upload binary asset to Supabase Storage
 */
export async function uploadAssetToSupabaseStorage(
  prototypeId: string,
  fileName: string,
  fileContent: Buffer,
  log2: SystemLogger,
): Promise<S3UploadResult> {
  try {
    const filePath = `${prototypeId}/${fileName}`;

    const { error } = await supabaseStorage.storage
      .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
      .upload(filePath, fileContent, {
        contentType: getContentType(fileName),
        upsert: true,
      });

    if (error) {
      log2.error(error, 'Error uploading to Supabase Storage:', {
        functionName: 'uploadAssetToSupabaseStorage',
      });
      return { success: false, error: error.message, publicUrl: null };
    }

    const { data: publicUrlData } = supabaseStorage.storage
      .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
      .getPublicUrl(filePath);

    return {
      success: true,
      publicUrl: publicUrlData.publicUrl,
    };
  } catch (error) {
    log2.error(error, 'Error in uploadAssetToSupabaseStorage:', {
      functionName: 'uploadAssetToSupabaseStorage',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      publicUrl: null,
    };
  }
}

export async function copyAllAssetsInSupabaseStorage(
  supabase: SupabaseClient<Database>,
  sourcePrototypeId: string,
  targetPrototypeId: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const { data: assets, error: assetsError } = await supabase.storage
    .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
    .list(sourcePrototypeId);
  if (assetsError) {
    log2.error(
      assetsError,
      '[copyAllAssetsInSupabaseStorage] Failed to list assets',
    );
    return { success: false, error: assetsError.message, copiedObjects: 0 };
  }
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

/**
 * Copy S3 bucket contents with versioned deployment for forking
 */
export async function copyS3BucketContentsVersioned(
  s3Client: S3Client,
  sourcePrototypeId: string,
  targetPrototypeId: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const version = Date.now().toString();
  const [versionedResult, latestResult] = await Promise.all([
    copyS3BucketContents(
      s3Client,
      `${sourcePrototypeId}/latest/`,
      `${targetPrototypeId}/v${version}/`,
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
  };
}

/**
 * Copy S3 bucket contents from one prefix to another
 */
export async function copyS3BucketContents(
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
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const sourcePrefix = 'default-app/';
  const version = Date.now().toString();

  // First copy to versioned location
  const versionedResult = await copyS3BucketContents(
    s3Client,
    sourcePrefix,
    `${prototypeId}/v${version}/`,
    log2,
  );

  if (!versionedResult.success) {
    return versionedResult;
  }

  // Then copy to latest location
  const latestResult = await copyS3BucketContents(
    s3Client,
    sourcePrefix,
    `${prototypeId}/latest/`,
    log2,
  );

  return {
    success: latestResult.success,
    error: latestResult.error,
    copiedObjects:
      versionedResult.copiedObjects + (latestResult.copiedObjects || 0),
  };
}

/**
 * Get the viewing URL for a prototype
 */
export function getPrototypeViewingUrl(prototypeId: string): string {
  return `https://${prototypeId}.render.materializeui.com/`;
}

/**
 * Get default app files from S3 raw files and format for Supabase insertion
 */
export async function getDefaultAppFilesFromS3(
  s3Client: S3Client,
  prototypeId: string,
  log2: SystemLogger,
): Promise<DefaultFilesResult> {
  try {
    const sourcePrefix = 'default-app-raw-files/';
    // List all files in the default-app-raw-files directory
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_PROTOTYPE_BUCKET,
      Prefix: sourcePrefix,
    });

    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      log2.error(
        null,
        '[getDefaultAppFilesFromS3] No default app files found in S3!',
      );
      return {
        success: false,
        error: 'No default app files found in S3',
      };
    }

    const files: PrototypeFileInsert[] = [];
    const assets: { name: string; contents: Buffer; prototype_id: string }[] =
      [];
    let processedFiles = 0;
    let skippedFiles = 0;
    let failedFiles = 0;

    for (const object of listResult.Contents) {
      if (!object.Key) {
        skippedFiles++;
        continue;
      }

      const fileName = object.Key.replace(sourcePrefix, '');
      if (!fileName) {
        skippedFiles++;
        continue;
      }

      const getCommand = new GetObjectCommand({
        Bucket: S3_PROTOTYPE_BUCKET,
        Key: object.Key,
      });

      try {
        const objectData = await s3Client.send(getCommand);

        if (!objectData.Body) {
          skippedFiles++;
          continue;
        }

        // Determine if this is a binary asset or text file
        const isAsset =
          /\.(png|jpg|jpeg|gif|ico|svg|ttf|woff|woff2|eot)$/i.test(fileName);

        if (isAsset) {
          // For assets, we need to upload to Supabase Storage
          const bodyBytes = await objectData.Body.transformToByteArray();
          const buffer = Buffer.from(bodyBytes);
          assets.push({
            prototype_id: prototypeId,
            name: fileName,
            contents: buffer,
          });
        } else {
          // For text files, get the content
          const content = await objectData.Body.transformToString();
          files.push({
            prototype_id: prototypeId,
            name: fileName,
            contents: content,
          });
        }

        processedFiles++;
      } catch (fileError) {
        log2.error(
          fileError,
          `[getDefaultAppFilesFromS3] Error processing file ${fileName}`,
        );
        failedFiles++;
      }
    }

    log2.consoleLogDevOnly(
      'info',
      `[getDefaultAppFilesFromS3] Default app files processing summary:`,
      {
        processedFiles,
        skippedFiles,
        failedFiles,
        totalFiles: files.length,
        totalAssets: assets.length,
      },
    );

    if (files.length === 0) {
      log2.error(
        null,
        '[getDefaultAppFilesFromS3] No files were successfully processed, file count is 0!',
      );
      return {
        success: false,
        error: 'No files could be processed from default app files',
      };
    }
    return {
      success: true,
      files,
      assets,
    };
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
 * Clean up S3 objects if prototype creation fails
 */
// TODO: Support 1000+ objects when needed.
export async function cleanupPrototypeS3Objects(
  s3Client: S3Client,
  prototypeId: string,
  log2: SystemLogger,
): Promise<void> {
  try {
    const prefix = prototypeId; // This will match everything: prototypeId/latest/, prototypeId/v123/, etc.

    const listParams = {
      Bucket: S3_PROTOTYPE_BUCKET,
      Prefix: prefix,
    };

    const objects = await s3Client.send(new ListObjectsV2Command(listParams));
    if (objects.Contents && objects.Contents.length > 0) {
      const deleteParams = {
        Bucket: S3_PROTOTYPE_BUCKET,
        Delete: {
          Objects: objects.Contents.map((obj) => ({ Key: obj.Key! })),
        },
      };
      await s3Client.send(new DeleteObjectsCommand(deleteParams));
    } else {
      log2.consoleLogDevOnly(
        'info',
        `[cleanupPrototypeS3Objects] No existing objects found with prefix: ${prefix}`,
      );
    }
  } catch (error) {
    log2.error(error, '[cleanupPrototypeS3Objects] Error');
  }
}

/**
 * Delete prototype assets from Supabase Storage
 */
export async function deletePrototypeAssetsFromStorage(
  prototypeId: string,
  log2: SystemLogger,
): Promise<void> {
  try {
    const { data: files, error: listError } = await supabaseStorage.storage
      .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
      .list(prototypeId);

    if (listError || !files || files.length === 0) {
      return;
    }

    const filePaths = files.map((file) => `${prototypeId}/${file.name}`);

    const { error: deleteError } = await supabaseStorage.storage
      .from(SUPABASE_PROTOTYPE_ASSETS_BUCKET)
      .remove(filePaths);

    if (deleteError) {
      log2.error(
        deleteError,
        '[deletePrototypeAssetsFromStorage] Supabase error',
      );
    } else {
      log2.consoleLogDevOnly(
        'info',
        `[deletePrototypeAssetsFromStorage] Cleaned up ${filePaths.length} Supabase Storage assets for prototype ${prototypeId}`,
      );
    }
  } catch (error) {
    log2.error(error, '[deletePrototypeAssetsFromStorage] Error');
  }
}
