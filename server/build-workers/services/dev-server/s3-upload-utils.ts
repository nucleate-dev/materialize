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

const MAX_CONCURRENT_UPLOADS = 5;

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
  const versionedPrefix = `${prototypeId}/${version}`;
  const latestPrefix = `${prototypeId}/latest`;
  const uploadResults: Array<{ key: string; location: string }> = [];
  const filesToUpload: Array<{
    fullPath: string;
    fileName: string;
    versionedKey: string;
    latestKey: string;
  }> = [];

  const collectFiles = async (
    dirPath: string,
    currentVersionPrefix: string,
    currentLatestPrefix: string,
  ): Promise<void> => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryName = entry.name;
      const fullPath = path.join(dirPath, entryName);
      if (entry.isDirectory()) {
        await collectFiles(
          fullPath,
          `${currentVersionPrefix}/${entryName}`,
          `${currentLatestPrefix}/${entryName}`,
        );
      } else if (entry.isFile()) {
        filesToUpload.push({
          fullPath,
          fileName: entryName,
          versionedKey: `${currentVersionPrefix}/${entryName}`,
          latestKey: `${currentLatestPrefix}/${entryName}`,
        });
      } else if (entry.isSymbolicLink()) {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          await collectFiles(
            fullPath,
            `${currentVersionPrefix}/${entryName}`,
            `${currentLatestPrefix}/${entryName}`,
          );
        } else if (stats.isFile()) {
          filesToUpload.push({
            fullPath,
            fileName: entryName,
            versionedKey: `${currentVersionPrefix}/${entryName}`,
            latestKey: `${currentLatestPrefix}/${entryName}`,
          });
        }
      }
    }
  };

  await collectFiles(localPath, versionedPrefix, latestPrefix);

  if (filesToUpload.length === 0) {
    return { uploadResults, version };
  }

  let fileIndex = 0;
  const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, filesToUpload.length);

  const uploadFile = async (file: {
    fullPath: string;
    fileName: string;
    versionedKey: string;
    latestKey: string;
  }): Promise<void> => {
    const fileContent = await fs.readFile(file.fullPath);

    if (!fileContent || fileContent.length === 0) {
      log2.warn("Skipping empty file during upload", {
        fileName: file.fileName,
      });
      return;
    }

    const uploadParams = {
      Body: fileContent,
      ContentType: getContentType(file.fileName),
      CacheControl: getCacheControlHeader(file.fileName),
    };

    const versionedCommand = new PutObjectCommand({
      ...uploadParams,
      Bucket: S3_BUCKET,
      Key: file.versionedKey,
    });
    await s3.send(versionedCommand);

    const latestCommand = new PutObjectCommand({
      ...uploadParams,
      Bucket: S3_BUCKET,
      Key: file.latestKey,
      CacheControl: file.fileName.endsWith(".html")
        ? "public, max-age=300"
        : uploadParams.CacheControl,
    });
    await s3.send(latestCommand);

    uploadResults.push({
      key: file.versionedKey,
      location: `https://${S3_BUCKET}.s3.amazonaws.com/${file.versionedKey}`,
    });
  };

  const workers = Array.from({ length: workerCount }).map(async () => {
    while (true) {
      const currentIndex = fileIndex++;
      if (currentIndex >= filesToUpload.length) {
        break;
      }
      const file = filesToUpload[currentIndex];
      await uploadFile(file);
    }
  });

  await Promise.all(workers);
  return { uploadResults, version };
}

async function deleteOldVersions(
  log2: SystemLogger,
  prototypeId: string,
  currentVersion: string,
  s3: S3Client,
): Promise<void> {
  try {
    const currentVersionPrefix = `${prototypeId}/${currentVersion}/`;
    let continuationToken: string | undefined;
    let foundAnyVersions = false;
    let deletedCount = 0;

    while (true) {
      const listCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: `${prototypeId}/v`,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3.send(listCommand);
      const contents = listResponse.Contents ?? [];

      if (contents.length > 0) {
        foundAnyVersions = true;
      }

      const keysToDelete = contents
        .map((obj) => obj.Key)
        .filter(
          (key): key is string =>
            typeof key === "string" && !key.startsWith(currentVersionPrefix),
        );

      if (keysToDelete.length > 0) {
        for (let i = 0; i < keysToDelete.length; i += 1000) {
          const chunk = keysToDelete.slice(i, i + 1000);
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
              Quiet: true,
            },
          });
          await s3.send(deleteCommand);
          deletedCount += chunk.length;
        }
      }

      if (!listResponse.IsTruncated) {
        break;
      }

      continuationToken = listResponse.NextContinuationToken;
    }

    if (!foundAnyVersions) {
      log2.debug("No old versions found to delete", { prototypeId });
      return;
    }

    if (deletedCount === 0) {
      log2.debug("No old versions to delete", {
        prototypeId,
        currentVersion,
      });
      return;
    }

    log2.consoleLogDevOnly("info", "Successfully deleted old versions in S3", {
      prototypeId,
      currentVersion,
      deletedCount,
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
