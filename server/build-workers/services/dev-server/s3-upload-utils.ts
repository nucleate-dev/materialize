import { SystemLogger } from "../../loggers/SystemLogger.js";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";
import { S3_BUCKET } from "./NucleateDevelopmentServerService.js";

export async function uploadDirectoryToS3(
  log2: SystemLogger,
  localPath: string,
  s3KeyPrefix: string,
  s3: S3Client,
): Promise<{
  uploadResults: Array<{ key: string; location: string }>;
  version: string;
}> {
  // Extract prototype ID and version from s3KeyPrefix
  const parts = s3KeyPrefix.split("/");
  const prototypeId = parts[0];
  const version = generateVersion();

  // Use the dual upload method
  const uploadResult = await uploadToVersionedAndLatest(
    log2,
    localPath,
    prototypeId,
    version,
    s3,
  );
  await deleteOldVersions(log2, prototypeId, version, s3);
  return uploadResult;
}

async function uploadToVersionedAndLatest(
  log2: SystemLogger,
  localPath: string,
  prototypeId: string,
  version: string,
  s3: S3Client,
): Promise<{
  uploadResults: Array<{ key: string; location: string }>;
  version: string;
}> {
  const uploadResults: Array<{ key: string; location: string }> = [];

  const uploadDirectory = async (
    dirPath: string,
    versionedPrefix: string,
    latestPrefix: string,
  ): Promise<void> => {
    const items = await fs.readdir(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        await uploadDirectory(
          fullPath,
          `${versionedPrefix}/${item}`,
          `${latestPrefix}/${item}`,
        );
      } else if (stats.isFile()) {
        const fileContent = await fs.readFile(fullPath);

        if (!fileContent || fileContent.length === 0) {
          log2.warn("Skipping empty file during upload", {
            fileName: item,
          });
          continue;
        }

        const uploadParams = {
          Body: fileContent,
          ContentType: getContentType(item),
          CacheControl: getCacheControlHeader(item),
        };

        // Upload to versioned location
        const versionedKey = `${versionedPrefix}/${item}`;
        const versionedCommand = new PutObjectCommand({
          ...uploadParams,
          Bucket: S3_BUCKET,
          Key: versionedKey,
        });
        await s3.send(versionedCommand);

        // Upload to latest location
        const latestKey = `${latestPrefix}/${item}`;
        const latestCommand = new PutObjectCommand({
          ...uploadParams,
          Bucket: S3_BUCKET,
          Key: latestKey,
          // Shorter cache for latest folder to pick up updates faster
          CacheControl: item.endsWith(".html")
            ? "public, max-age=300"
            : uploadParams.CacheControl,
        });
        await s3.send(latestCommand);

        uploadResults.push({
          key: versionedKey,
          location: `https://${S3_BUCKET}.s3.amazonaws.com/${versionedKey}`,
        });
      }
    }
  };

  const versionedPrefix = `${prototypeId}/${version}`;
  const latestPrefix = `${prototypeId}/latest`;

  await uploadDirectory(localPath, versionedPrefix, latestPrefix);
  return { uploadResults, version };
}

async function deleteOldVersions(
  log2: SystemLogger,
  prototypeId: string,
  currentVersion: string,
  s3: S3Client,
): Promise<void> {
  try {
    // List all objects under the prototype's versioned folders
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: `${prototypeId}/v`,
    });

    const listResponse = await s3.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      log2.debug("No old versions found to delete", { prototypeId });
      return;
    }

    // Filter out objects from the current version
    const currentVersionPrefix = `${prototypeId}/${currentVersion}/`;
    const objectsToDelete = listResponse.Contents.filter(
      (obj) => obj.Key && !obj.Key.startsWith(currentVersionPrefix),
    );

    if (objectsToDelete.length === 0) {
      log2.debug("No old versions to delete", {
        prototypeId,
        currentVersion,
      });
      return;
    }

    // Delete old version objects
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: S3_BUCKET,
      Delete: {
        Objects: objectsToDelete.map((obj) => ({ Key: obj.Key! })),
        Quiet: true,
      },
    });

    await s3.send(deleteCommand);

    log2.consoleLogDevOnly("info", "Successfully deleted old versions in S3", {
      prototypeId,
      currentVersion,
      deletedCount: objectsToDelete.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log2.error(
      error instanceof Error ? error : new Error(errorMessage),
      "Failed to delete old versions",
      { prototypeId, currentVersion },
    );
    // Don't throw - we don't want cleanup failure to fail the build
  }
}

function generateVersion(): string {
  return "v" + Date.now().toString();
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain",
  };
  return contentTypes[ext] || "application/octet-stream";
}

function getCacheControlHeader(filename: string): string {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case ".html":
      return "public, max-age=300, s-maxage=300"; // 5 minutes
    case ".js":
    case ".css":
      return "public, max-age=31536000, s-maxage=31536000"; // 1 year for versioned assets
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".svg":
    case ".ico":
      return "public, max-age=31536000, s-maxage=31536000"; // 1 year
    default:
      return "public, max-age=3600, s-maxage=3600"; // 1 hour default
  }
}
