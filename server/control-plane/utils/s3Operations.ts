import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
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
 * Copy S3 bucket contents from one prefix to another
 */
export async function copyS3BucketContents(
  s3Client: S3Client,
  sourcePrefix: string,
  destinationPrefix: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  try {
    // List all objects with the source prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_PROTOTYPE_BUCKET,
      Prefix: sourcePrefix,
    });
    const listResult = await s3Client.send(listCommand);
    if (!listResult.Contents || listResult.Contents.length === 0) {
      return {
        success: true,
        copiedObjects: 0,
      };
    }

    let successfulCopies = 0;
    let failedCopies = 0;
    const copyResults: Promise<{
      success: boolean;
      sourceKey: string;
      destinationKey: string;
      error?: string;
    }>[] = [];

    // Copy each object to the new destination
    for (const object of listResult.Contents) {
      if (!object.Key) {
        continue;
      }

      const sourceKey = object.Key;
      const destinationKey = object.Key.replace(
        sourcePrefix,
        destinationPrefix,
      );

      const copyCommand = new CopyObjectCommand({
        Bucket: S3_PROTOTYPE_BUCKET,
        CopySource: `${S3_PROTOTYPE_BUCKET}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
      });

      // Wrap each copy operation to track individual results
      const copyOperation = s3Client
        .send(copyCommand)
        .then(() => {
          return { success: true, sourceKey, destinationKey };
        })
        .catch((error) => {
          return {
            success: false,
            sourceKey,
            destinationKey,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        });

      copyResults.push(copyOperation);
    }

    // Wait for all copy operations to complete and collect results
    const results = await Promise.all(copyResults);

    // Count successes and failures
    results.forEach((result) => {
      if (result.success) {
        successfulCopies++;
      } else {
        failedCopies++;
        log2.error(result.error, `[copyS3BucketContents] Copy failed`, {
          functionName: 'copyS3BucketContents',
          source: result.sourceKey,
          destination: result.destinationKey,
          error: result.error,
        });
      }
    });

    log2.consoleLogDevOnly(
      'info',
      `[copyS3BucketContents] Copy operation summary:`,
      {
        successfulCopies,
        failedCopies,
        totalAttempted: results.length,
      },
    );

    if (failedCopies > 0) {
      const errorMessage = `[copyS3BucketContents] Error: ${failedCopies} out of ${results.length} copy operations failed`;
      log2.error(null, errorMessage);
      return {
        success: false,
        error: errorMessage,
        copiedObjects: successfulCopies,
      };
    }

    return {
      success: true,
      copiedObjects: successfulCopies,
    };
  } catch (error) {
    log2.error(error, '[copyS3BucketContents] Critical error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      copiedObjects: 0,
    };
  }
}

/**
 * Copy default app files to a new prototype bucket
 */
export async function copyDefaultAppToPrototype(
  s3Client: S3Client,
  prototypeId: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const sourcePrefix = 'default-app/';
  const destinationPrefix = `${prototypeId}/`; // Add trailing slash

  return copyS3BucketContents(s3Client, sourcePrefix, destinationPrefix, log2);
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
 * Copy S3 bucket contents with versioned deployment for forking
 */
export async function copyS3BucketContentsVersioned(
  s3Client: S3Client,
  sourcePrototypeId: string,
  targetPrototypeId: string,
  log2: SystemLogger,
): Promise<S3CopyResult> {
  const version = Date.now().toString();

  // Copy from source latest to target versioned
  const versionedResult = await copyS3BucketContents(
    s3Client,
    `${sourcePrototypeId}/latest/`,
    `${targetPrototypeId}/v${version}/`,
    log2,
  );

  if (!versionedResult.success) {
    return versionedResult;
  }

  // Copy from source latest to target latest
  const latestResult = await copyS3BucketContents(
    s3Client,
    `${sourcePrototypeId}/latest/`,
    `${targetPrototypeId}/latest/`,
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
    const assets: PrototypeAssetInsert[] = [];
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
          const uploadResult = await uploadAssetToSupabaseStorage(
            prototypeId,
            fileName,
            buffer,
            log2,
          );

          if (!uploadResult.success) {
            log2.error(
              uploadResult.error,
              `[getDefaultAppFilesFromS3] Failed to upload asset ${fileName}`,
            );
            failedFiles++;
            continue;
          }

          assets.push({
            prototype_id: prototypeId,
            name: fileName,
            storage_url: uploadResult.publicUrl!, // Empty for assets
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
