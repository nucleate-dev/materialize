import {
  S3Client,
  CopyObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
  type _Object,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import type {
  S3CopyResult,
  S3UploadResult,
  DefaultFilesResult,
  PrototypeFile,
} from '../types/InternalTypes.js';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  // credentials: {
  //   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  //   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  // },
});

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
      return { success: false, error: error.message };
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
      return { success: false, error: downloadError.message };
    }

    if (!sourceData) {
      return { success: false, error: 'No data received from source file' };
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
    };
  }
}

/**
 * Copy S3 bucket contents from one prefix to another
 */
export async function copyS3BucketContents(
  sourcePrefix: string,
  destinationPrefix: string,
): Promise<S3CopyResult> {
  try {
    console.log(
      `Copying S3 objects from ${sourcePrefix} to ${destinationPrefix}`,
    );

    // List all objects with the source prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: PROTOTYPE_BUCKET,
      Prefix: sourcePrefix,
    });

    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log('No objects found to copy');
      return {
        success: true,
        copiedObjects: 0,
      };
    }

    let copiedObjects = 0;
    const copyPromises = [];

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
        Bucket: PROTOTYPE_BUCKET,
        CopySource: `${PROTOTYPE_BUCKET}/${sourceKey}`,
        Key: destinationKey,
      });

      copyPromises.push(s3Client.send(copyCommand));
    }

    // Wait for all copy operations to complete
    await Promise.all(copyPromises);
    copiedObjects = listResult.Contents.length;

    return {
      success: true,
      copiedObjects,
    };
  } catch (error) {
    console.error('Error copying S3 bucket contents:', error);
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
  prototypeId: string,
): Promise<S3CopyResult> {
  const sourcePrefix = 'default-app/dist';
  const destinationPrefix = `prototypes/${prototypeId}`;

  return copyS3BucketContents(sourcePrefix, destinationPrefix);
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
      return {
        success: false,
        error: 'No default app files found in S3',
      };
    }

    const files: PrototypeFile[] = [];

    for (const object of listResult.Contents) {
      if (!object.Key) {
        continue;
      }

      const fileName = object.Key.replace(sourcePrefix, '');
      if (!fileName) {
        continue;
      } // Skip directory entries

      const getCommand = new GetObjectCommand({
        Bucket: PROTOTYPE_BUCKET,
        Key: object.Key,
      });

      const objectData = await s3Client.send(getCommand);

      if (!objectData.Body) {
        continue;
      }

      // Determine if this is a binary asset or text file
      const isAsset = /\.(png|jpg|jpeg|gif|ico|svg|ttf|woff|woff2|eot)$/i.test(
        fileName,
      );

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
            `Failed to upload asset ${fileName}:`,
            uploadResult.error,
          );
          continue;
        }

        files.push({
          prototype_id: prototypeId,
          name: fileName,
          contents: '', // Empty for assets
          file_type: 'asset',
          storage_path: uploadResult.publicUrl!,
        });
      } else {
        // For text files, get the content
        const content = await objectData.Body.transformToString();

        files.push({
          prototype_id: prototypeId,
          name: fileName,
          contents: content,
          file_type: 'text',
          storage_path: null,
        });
      }
    }

    return {
      success: true,
      files,
    };
  } catch (error) {
    console.error('Error getting default app files from S3:', error);
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
  prototypeId: string,
): Promise<void> {
  try {
    const prefix = `prototypes/${prototypeId}`;

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
