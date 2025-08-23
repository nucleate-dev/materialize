import {
  CopyObjectCommand,
  CopyObjectCommandOutput,
  DeleteObjectCommand,
  DeleteObjectCommandOutput,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseStorage = createClient(supabaseUrl, supabaseServiceKey);

// Initialize S3 client
const s3Client = new S3Client({
  region: "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const PROTOTYPE_BUCKET = "materialize-sites";
const SUPABASE_STORAGE_BUCKET = "prototype-assets";

export interface S3CopyResult {
  success: boolean;
  error?: string;
  copiedObjects: number;
}

export interface S3BucketInfo {
  bucketName: string;
  cloudfrontUrl: string;
}

/**
 * Upload binary asset to Supabase Storage
 */
export async function uploadAssetToSupabaseStorage(
  prototypeId: string,
  fileName: string,
  fileContent: Buffer,
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  try {
    const filePath = `${prototypeId}/${fileName}`;

    const { error } = await supabaseStorage.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(filePath, fileContent, {
        contentType: getContentType(fileName),
        upsert: true,
      });

    if (error) {
      console.error("Error uploading to Supabase Storage:", error);
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
    console.error("Error in uploadAssetToSupabaseStorage:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
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
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
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

    console.log(`✅ Downloaded asset: ${fileName} (${sourceData.size} bytes)`);

    // Upload to target
    const fileBuffer = Buffer.from(await sourceData.arrayBuffer());
    const uploadResult = await uploadAssetToSupabaseStorage(
      targetPrototypeId,
      fileName,
      fileBuffer,
    );

    console.log(`📤 Upload result for ${fileName}:`, {
      success: uploadResult.success,
      url: uploadResult.publicUrl,
    });
    return uploadResult;
  } catch (error) {
    console.error("❌ Error in copyAssetInSupabaseStorage:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete assets for a prototype from Supabase Storage
 */
export async function deletePrototypeAssetsFromStorage(
  prototypeId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: files, error: listError } = await supabaseStorage.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .list(prototypeId);

    if (listError) {
      return { success: false, error: listError.message };
    }

    if (!files || files.length === 0) {
      return { success: true }; // No files to delete
    }

    const filesToDelete = files.map((file) => `${prototypeId}/${file.name}`);
    const { error: deleteError } = await supabaseStorage.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .remove(filesToDelete);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in deletePrototypeAssetsFromStorage:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  const contentTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    ico: "image/x-icon",
    svg: "image/svg+xml",
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
  };
  return contentTypes[ext || ""] || "application/octet-stream";
}

/**
 * Copy all objects from one S3 prefix to another (used for forking prototypes)
 */
export async function copyS3BucketContents(
  sourcePrefix: string,
  destinationPrefix: string,
): Promise<S3CopyResult> {
  try {
    // List all objects in the source prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: PROTOTYPE_BUCKET,
      Prefix: sourcePrefix,
    });

    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      return {
        success: true,
        copiedObjects: 0,
      };
    }

    let copiedObjects = 0;
    const copyPromises: Promise<CopyObjectCommandOutput>[] = [];

    // Copy each object to the new destination
    for (const object of listResult.Contents) {
      if (!object.Key) continue;

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
    console.error("Error copying S3 bucket contents:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
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
  const sourcePrefix = "default-app";
  const destinationPrefix = `${prototypeId}`;

  return copyS3BucketContents(sourcePrefix, destinationPrefix);
}

/**
 * Get the viewing URL for a prototype
 */
export function getPrototypeViewingUrl(prototypeId: string): string {
  return `https://${prototypeId}.render.materializeui.com`;
}

/**
 * Clean up S3 objects if prototype creation fails
 */
/**
 * Get default app files from S3 raw files and format for Supabase insertion
 * Also uploads binary assets to Supabase Storage
 */
export async function getDefaultAppFilesFromS3(prototypeId: string): Promise<{
  success: boolean;
  files?: Array<{
    prototype_id: string;
    name: string;
    contents: string;
    file_type: "text" | "asset";
    storage_path: string | null;
  }>;
  error?: string;
}> {
  try {
    const sourcePrefix = "default-app-raw-files/";

    // List all files in the default-app-raw-files directory
    const listCommand = new ListObjectsV2Command({
      Bucket: PROTOTYPE_BUCKET,
      Prefix: sourcePrefix,
    });

    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      return {
        success: false,
        error: "No default app files found in S3",
      };
    }

    const files: Array<{
      prototype_id: string;
      name: string;
      contents: string;
      file_type: "text" | "asset";
      storage_path: string | null;
    }> = [];

    // Get content for each file
    for (const object of listResult.Contents) {
      if (!object.Key) continue;

      // Skip directory markers (objects ending with /)
      if (object.Key.endsWith("/")) continue;

      const getCommand = new GetObjectCommand({
        Bucket: PROTOTYPE_BUCKET,
        Key: object.Key,
      });

      const result = await s3Client.send(getCommand);

      if (result.Body) {
        // Extract filename (remove the prefix)
        const fileName = object.Key.replace(sourcePrefix, "");

        // Check if this is a binary asset file
        const binaryExtensions = [
          ".png",
          ".jpg",
          ".jpeg",
          ".gif",
          ".ico",
          ".ttf",
          ".otf",
          ".woff",
          ".woff2",
          ".svg",
        ];
        const isBinaryFile = binaryExtensions.some((ext) =>
          fileName.toLowerCase().endsWith(ext),
        );

        if (isBinaryFile) {
          // Handle binary asset - upload to Supabase Storage
          console.log(`Processing binary asset: ${fileName}`);

          const fileBuffer = Buffer.from(
            await result.Body.transformToByteArray(),
          );
          const uploadResult = await uploadAssetToSupabaseStorage(
            prototypeId,
            fileName,
            fileBuffer,
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
            contents: "",
            file_type: "asset",
            storage_path: uploadResult.publicUrl!,
          });
        } else {
          // Handle text file - store in contents
          const content = await result.Body.transformToString();

          files.push({
            prototype_id: prototypeId,
            name: fileName,
            contents: content,
            file_type: "text",
            storage_path: null,
          });
        }
      }
    }

    return {
      success: true,
      files,
    };
  } catch (error) {
    console.error("Error getting default app files from S3:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function cleanupPrototypeS3Objects(
  prototypeId: string,
): Promise<void> {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: PROTOTYPE_BUCKET,
      Prefix: `${prototypeId}/`,
    });

    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      return;
    }

    const deletePromises: Promise<DeleteObjectCommandOutput>[] = [];

    // Delete each object
    for (const object of listResult.Contents) {
      if (!object.Key) continue;

      const deleteCommand = new DeleteObjectCommand({
        Bucket: PROTOTYPE_BUCKET,
        Key: object.Key,
      });

      deletePromises.push(s3Client.send(deleteCommand));
    }

    // Wait for all delete operations to complete
    await Promise.all(deletePromises);

    console.log(`Cleaned up S3 objects for prototype ${prototypeId}`);
  } catch (error) {
    console.error("Error cleaning up S3 objects:", error);
  }
}
