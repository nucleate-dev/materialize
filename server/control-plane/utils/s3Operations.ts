import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import type {
  DefaultFilesResult,
  PrototypeAssetInsert,
  PrototypeFileInsert,
  S3CopyResult,
  S3UploadResult,
} from '../types/InternalTypes.js';

// Initialize Supabase storage client
const supabaseStorage = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PROTOTYPE_BUCKET = 'materialize-sites';
const SUPABASE_STORAGE_BUCKET = 'prototype-assets';

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
): Promise<S3UploadResult> {
  try {
    const filePath = `${prototypeId}/${fileName}`;

    const { error } = await supabaseStorage.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(filePath, fileContent, {
        contentType: getContentType(fileName),
        upsert: true,
      });

    if (error) {
      console.error('Error uploading to Supabase Storage:', error);
      return { success: false, error: error.message, publicUrl: null };
    }

    const { data: publicUrlData } = supabaseStorage.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    return {
      success: true,
      publicUrl: publicUrlData.publicUrl,
    };
  } catch (error) {
    console.error('Error in uploadAssetToSupabaseStorage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      publicUrl: null,
    };
  }
}

/**
 * Copy asset from one prototype to another in Supabase Storage
 */
export async function copyAssetInSupabaseStorage(
  sourcePrototypeId: string,
  targetPrototypeId: string,
  fileName: string,
): Promise<S3UploadResult> {
  try {
    const sourceFilePath = `${sourcePrototypeId}/${fileName}`;
    console.log(`🔄 Copying asset from storage: ${sourceFilePath}`);

    // Download from source
    const { data: sourceData, error: downloadError } =
      await supabaseStorage.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .download(sourceFilePath);

    if (downloadError) {
      console.log(
        `❌ Download failed for ${sourceFilePath}:`,
        downloadError.message,
      );
      return { success: false, error: downloadError.message, publicUrl: null };
    }

    if (!sourceData) {
      return {
        success: false,
        error: 'No data received from source file',
        publicUrl: null,
      };
    }

    // Convert blob to buffer
    const arrayBuffer = await sourceData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to target location
    return await uploadAssetToSupabaseStorage(
      targetPrototypeId,
      fileName,
      buffer,
    );
  } catch (error) {
    console.error('Error in copyAssetInSupabaseStorage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      publicUrl: null,
    };
  }
}

/**
 * Copy S3 bucket contents from one prefix to another
 */
export async function copyS3BucketContents(
  s3Client: S3Client,
  sourcePrefix: string,
  destinationPrefix: string,
): Promise<S3CopyResult> {
  try {
    console.log(
      `🔍 [S3] Starting copy operation from ${sourcePrefix} to ${destinationPrefix}`,
    );
    console.log(`🪣 [S3] Using bucket: ${PROTOTYPE_BUCKET}`);

    // List all objects with the source prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: PROTOTYPE_BUCKET,
      Prefix: sourcePrefix,
    });

    console.log(`📋 [S3] Listing objects with prefix: ${sourcePrefix}`);
    const listResult = await s3Client.send(listCommand);

    console.log(`📊 [S3] List operation result:`, {
      ContentsCount: listResult.Contents?.length || 0,
      IsTruncated: listResult.IsTruncated,
      KeyCount: listResult.KeyCount,
    });

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(
        '⚠️ [S3] No objects found to copy - this might be the issue!',
      );
      console.log(
        `🔍 [S3] Double-check that objects exist at: s3://${PROTOTYPE_BUCKET}/${sourcePrefix}`,
      );
      return {
        success: true,
        copiedObjects: 0,
      };
    }

    console.log(`📁 [S3] Found ${listResult.Contents.length} objects to copy:`);

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
        console.log('⚠️ [S3] Skipping object with no key');
        continue;
      }

      const sourceKey = object.Key;
      const destinationKey = object.Key.replace(
        sourcePrefix,
        destinationPrefix,
      );

      const copyCommand = new CopyObjectCommand({
        Bucket: PROTOTYPE_BUCKET,
        CopySource: `${PROTOTYPE_BUCKET}/${encodeURIComponent(sourceKey)}`,
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

    console.log(
      `⏳ [S3] Waiting for ${copyResults.length} copy operations to complete...`,
    );

    // Wait for all copy operations to complete and collect results
    const results = await Promise.all(copyResults);

    // Count successes and failures
    results.forEach((result) => {
      if (result.success) {
        successfulCopies++;
      } else {
        failedCopies++;
        console.error(
          `💥 [S3] Copy failed - Source: ${result.sourceKey}, Destination: ${result.destinationKey}, Error: ${result.error}`,
        );
      }
    });

    console.log(`📈 [S3] Copy operation summary:`);
    console.log(`  ✅ Successful copies: ${successfulCopies}`);
    console.log(`  ❌ Failed copies: ${failedCopies}`);
    console.log(`  📊 Total attempted: ${results.length}`);

    if (failedCopies > 0) {
      const errorMessage = `${failedCopies} out of ${results.length} copy operations failed`;
      console.error(`🚨 [S3] ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        copiedObjects: successfulCopies,
      };
    }

    console.log(`🎉 [S3] All copy operations completed successfully!`);
    return {
      success: true,
      copiedObjects: successfulCopies,
    };
  } catch (error) {
    console.error('💥 [S3] Critical error in copyS3BucketContents:', error);

    // Log additional details about the error
    if (error instanceof Error) {
      console.error(`🔍 [S3] Error name: ${error.name}`);
      console.error(`🔍 [S3] Error message: ${error.message}`);
      console.error(`🔍 [S3] Error stack: ${error.stack}`);
    }

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
): Promise<S3CopyResult> {
  const sourcePrefix = 'default-app/';
  const destinationPrefix = prototypeId; // Remove 'prototypes/' prefix

  return copyS3BucketContents(s3Client, sourcePrefix, destinationPrefix);
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
): Promise<DefaultFilesResult> {
  try {
    const sourcePrefix = 'default-app-raw-files/';
    // List all files in the default-app-raw-files directory
    const listCommand = new ListObjectsV2Command({
      Bucket: PROTOTYPE_BUCKET,
      Prefix: sourcePrefix,
    });

    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.error(`❌ [S3] No default app files found in S3!`);
      console.error(
        `🔍 [S3] Check if files exist at: s3://${PROTOTYPE_BUCKET}/${sourcePrefix}`,
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
        console.log('⚠️ [S3] Skipping object with no key');
        skippedFiles++;
        continue;
      }

      const fileName = object.Key.replace(sourcePrefix, '');
      if (!fileName) {
        console.log(`⚠️ [S3] Skipping directory entry: ${object.Key}`);
        skippedFiles++;
        continue;
      }

      const getCommand = new GetObjectCommand({
        Bucket: PROTOTYPE_BUCKET,
        Key: object.Key,
      });

      try {
        const objectData = await s3Client.send(getCommand);

        if (!objectData.Body) {
          console.log(`⚠️ [S3] No body data for file: ${fileName}`);
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
          );

          if (!uploadResult.success) {
            console.error(
              `❌ [Supabase] Failed to upload asset ${fileName}:`,
              uploadResult.error,
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
        console.error(`❌ [S3] Error processing file ${fileName}:`, fileError);
        failedFiles++;
      }
    }

    console.log(`📈 [S3] Default app files processing summary:`);
    console.log(`  ✅ Successfully processed files: ${processedFiles}`);
    console.log(`  ⚠️ Skipped files: ${skippedFiles}`);
    console.log(`  ❌ Failed files: ${failedFiles}`);
    console.log(`  📊 Total text files processed: ${files.length}`);
    console.log(`  📊 Total assets processed: ${assets.length}`);

    if (files.length === 0) {
      console.error(`🚨 [S3] No files were successfully processed!`);
      return {
        success: false,
        error: 'No files could be processed from default app files',
      };
    }

    console.log(
      `🎉 [S3] Successfully prepared ${files.length} default app files for insertion`,
    );
    return {
      success: true,
      files,
    };
  } catch (error) {
    console.error(
      '💥 [S3] Critical error getting default app files from S3:',
      error,
    );

    // Log additional details about the error
    if (error instanceof Error) {
      console.error(`🔍 [S3] Error name: ${error.name}`);
      console.error(`🔍 [S3] Error message: ${error.message}`);
      console.error(`🔍 [S3] Error stack: ${error.stack}`);
    }

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
export async function cleanupPrototypeS3Objects(
  s3Client: S3Client,
  prototypeId: string,
): Promise<void> {
  try {
    const prefix = prototypeId; // Remove 'prototypes/' prefix

    // List all objects with the prototype prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: PROTOTYPE_BUCKET,
      Prefix: prefix,
    });

    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      return;
    }

    // Delete each object
    const deletePromises = listResult.Contents.map((object: _Object) => {
      if (!object.Key) {
        return Promise.resolve();
      }

      return s3Client.send(
        new DeleteObjectCommand({
          Bucket: PROTOTYPE_BUCKET,
          Key: object.Key,
        }),
      );
    });

    await Promise.all(deletePromises);
    console.log(
      `Cleaned up ${listResult.Contents.length} S3 objects for prototype ${prototypeId}`,
    );
  } catch (error) {
    console.error('Error cleaning up S3 objects:', error);
  }
}

/**
 * Delete prototype assets from Supabase Storage
 */
export async function deletePrototypeAssetsFromStorage(
  prototypeId: string,
): Promise<void> {
  try {
    const { data: files, error: listError } = await supabaseStorage.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .list(prototypeId);

    if (listError || !files || files.length === 0) {
      return;
    }

    const filePaths = files.map((file) => `${prototypeId}/${file.name}`);

    const { error: deleteError } = await supabaseStorage.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .remove(filePaths);

    if (deleteError) {
      console.error(
        'Error deleting assets from Supabase Storage:',
        deleteError,
      );
    } else {
      console.log(
        `Cleaned up ${filePaths.length} Supabase Storage assets for prototype ${prototypeId}`,
      );
    }
  } catch (error) {
    console.error('Error cleaning up Supabase Storage assets:', error);
  }
}
