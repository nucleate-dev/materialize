import {
  CopyObjectCommand,
  CopyObjectCommandOutput,
  DeleteObjectCommand,
  DeleteObjectCommandOutput,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

// Initialize S3 client
const s3Client = new S3Client({
  region: "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const PROTOTYPE_BUCKET = "materialize-sites";

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
  const sourcePrefix = "default-app/dist";
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
