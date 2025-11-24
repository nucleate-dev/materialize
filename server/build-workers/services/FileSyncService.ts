import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { Database } from "../types/supabase.js";
import {
  PrototypeFileInput,
  PrototypeAssetInput,
  PrototypeAssetInputWithContent,
} from "../types/BuildWorkerTypes.js";

interface SyncResult {
  success: boolean;
  filesUpdated: number;
  filesDeleted: number;
  assetsUpdated: number;
  assetsDeleted: number;
  errors: string[];
}

// Batch configuration for fetching files and assets
const BATCH_CONFIG = {
  // Supabase query batch size (rows per query)
  FILE_FETCH_BATCH_SIZE: 500,
  FILE_UPSERT_BATCH_SIZE: 200,
  ASSET_METADATA_FETCH_BATCH_SIZE: 500,
  // Asset download concurrency (parallel downloads)
  ASSET_DOWNLOAD_CONCURRENCY: 10,
  ASSET_UPLOAD_CONCURRENCY: 10,
  // Delay between batches (ms) to avoid rate limiting
  BATCH_DELAY_MS: 100,
} as const;

export class FileSyncService {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private supabaseClient: SupabaseClient<Database>;

  // Binary file extensions (matching PublicApiService)
  private readonly binaryExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".svg",
    ".webp",
    ".bmp",
    ".tiff",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".mkv",
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".flac",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".7z",
    ".rar",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".bin",
    ".dat",
    ".db",
    ".sqlite",
  ];

  constructor(
    workDir: string,
    supabaseClient: SupabaseClient<Database>,
    logger: SystemLogger,
  ) {
    this.workDir = workDir;
    this.supabaseClient = supabaseClient;
    this.logger = logger.child({ service: "FileSyncService" });
  }

  /**
   * Updates the Supabase client instance (e.g., for JWT refresh)
   */
  public setSupabaseClient(client: SupabaseClient<Database>): void {
    this.supabaseClient = client;
  }

  /**
   * Syncs ALL files from the work directory to Supabase.
   * This performs a full sync, uploading all files regardless of changes.
   * Recommended for simplicity and reliability.
   */
  public async syncAllFilesToSupabase(
    prototypeId: string,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      filesUpdated: 0,
      filesDeleted: 0,
      assetsUpdated: 0,
      assetsDeleted: 0,
      errors: [],
    };

    try {
      this.logger.consoleLogDevOnly("info", "Starting full directory sync", {
        prototypeId,
        workDir: this.workDir,
      });

      // Recursively scan the work directory for all files
      const allFiles = await this.scanDirectory(this.workDir);

      this.logger.consoleLogDevOnly("info", "Scanned directory for files", {
        prototypeId,
        fileCount: allFiles.length,
      });

      if (allFiles.length === 0) {
        this.logger.warn("No files found in work directory", {
          prototypeId,
        });
        return result;
      }

      // Separate files into text and binary
      const modifiedFiles = allFiles;
      const deletedFiles: string[] = []; // No deletions in full sync

      // Process all files
      // Separate modified files by type
      const textFiles: string[] = [];
      const binaryFiles: string[] = [];
      for (const filePath of modifiedFiles) {
        if (this.isBinaryFile(filePath)) {
          binaryFiles.push(filePath);
        } else {
          textFiles.push(filePath);
        }
      }
      await this.processDeletions(deletedFiles, prototypeId, result);
      await this.processTextFiles(textFiles, prototypeId, result);
      await this.processBinaryFiles(binaryFiles, prototypeId, result);

      // Set success to false if any individual file operations failed
      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(new Error(message), "Full directory sync failed", {
        prototypeId,
      });
      result.errors.push(`Sync failed: ${message}`);
      result.success = false;
      return result;
    }
  }

  /**
   * Recursively scans a directory and returns all file paths (relative to workDir).
   * Excludes common directories that shouldn't be synced.
   */
  private async scanDirectory(
    dirPath: string,
    relativePath = "",
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        const entryRelativePath = relativePath
          ? path.join(relativePath, entry.name)
          : entry.name;

        // Skip common top-level directories and special files only at root
        const skipRootDirs = new Set([
          "node_modules",
          ".git",
          ".next",
          "dist",
          "build",
          ".cache",
          "tmp",
          ".npm-cache",
          ".expo",
        ]);
        const skipFiles = new Set([".DS_Store", ".npmrc", ".yarnrc"]);

        const relativeSegments = entryRelativePath.split(path.sep);
        const isTopLevelSkip =
          relativeSegments.length > 0 && skipRootDirs.has(relativeSegments[0]);
        const isSkippedFile = skipFiles.has(entry.name);

        if (isTopLevelSkip || isSkippedFile) continue;

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(
            entryPath,
            entryRelativePath,
          );
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Add file to list
          files.push(entryRelativePath);
        }
      }
    } catch (error) {
      this.logger.warn("Error scanning directory", {
        path: dirPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return files;
  }

  /**
   * Syncs all changed files from the tracked file list to Supabase.
   * Uses file paths tracked by the file system watcher in CodeService.
   * Legacy incremental sync strategy.
   */
  public async syncFilesToSupabase(
    prototypeId: string,
    trackedFiles: Set<string>,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      filesUpdated: 0,
      filesDeleted: 0,
      assetsUpdated: 0,
      assetsDeleted: 0,
      errors: [],
    };

    try {
      if (trackedFiles.size === 0) {
        this.logger.info("No file changes detected, skipping sync", {
          prototypeId,
        });
        return result;
      }

      // Separate files into modified and deleted
      const modifiedFiles: string[] = [];
      const deletedFiles: string[] = [];

      for (const filePath of trackedFiles) {
        try {
          const fullPath = path.join(this.workDir, filePath);

          // Check if file exists (if not, it was deleted)
          try {
            await fs.access(fullPath);
            // File exists - it was modified or added
            modifiedFiles.push(filePath);
          } catch {
            // File doesn't exist - it was deleted
            deletedFiles.push(filePath);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn("Error checking file status", {
            filePath,
            error: message,
          });
        }
      }

      // Process each changed file
      // Separate modified files by type
      const textFiles: string[] = [];
      const binaryFiles: string[] = [];
      for (const filePath of modifiedFiles) {
        if (this.isBinaryFile(filePath)) {
          binaryFiles.push(filePath);
        } else {
          textFiles.push(filePath);
        }
      }

      // Process files (parallel with concurrency limit)
      await this.processDeletions(deletedFiles, prototypeId, result);
      await this.processTextFiles(textFiles, prototypeId, result);
      await this.processBinaryFiles(binaryFiles, prototypeId, result);

      // Set success to false if any individual file operations failed
      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(new Error(message), "File sync failed", {
        prototypeId,
      });
      result.errors.push(`Sync failed: ${message}`);
      result.success = false;
      return result;
    }
  }

  /**
   * Process deleted files using bulk DELETE operations
   */
  private async processDeletions(
    deletedFiles: string[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    if (deletedFiles.length === 0) {
      return;
    }

    // Separate files by type
    const textFilesToDelete: string[] = [];
    const binaryFilesToDelete: string[] = [];

    for (const filePath of deletedFiles) {
      if (this.isBinaryFile(filePath)) {
        binaryFilesToDelete.push(filePath);
      } else {
        textFilesToDelete.push(filePath);
      }
    }

    // Bulk delete text files from database
    if (textFilesToDelete.length > 0) {
      try {
        const { error } = await this.supabaseClient
          .from("prototype_files")
          .delete()
          .eq("prototype_id", prototypeId)
          .in("name", textFilesToDelete);

        if (error) {
          this.logger.error(error, "Failed to bulk delete text files", {
            count: textFilesToDelete.length,
          });
          result.errors.push(
            `Failed to bulk delete ${textFilesToDelete.length} text files: ${error.message}`,
          );
        } else {
          result.filesDeleted += textFilesToDelete.length;
          this.logger.consoleLogDevOnly("info", "Bulk deleted text files", {
            count: textFilesToDelete.length,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          new Error(message),
          "Failed to bulk delete text files",
          { count: textFilesToDelete.length },
        );
        result.errors.push(`Failed to bulk delete text files: ${message}`);
      }
    }

    // Bulk delete binary assets
    if (binaryFilesToDelete.length > 0) {
      // Bulk delete from storage bucket
      try {
        const storagePaths = binaryFilesToDelete.map(
          (filePath) => `${prototypeId}/${filePath}`,
        );
        const { error: storageError } = await this.supabaseClient.storage
          .from("prototype-assets")
          .remove(storagePaths);

        if (storageError) {
          this.logger.warn("Failed to bulk delete assets from storage", {
            count: binaryFilesToDelete.length,
            error: storageError.message,
          });
          // Don't fail the entire operation, continue to DB deletion
        }
      } catch (storageError) {
        this.logger.warn("Error during bulk asset storage deletion", {
          count: binaryFilesToDelete.length,
          error:
            storageError instanceof Error
              ? storageError.message
              : String(storageError),
        });
        // Continue to database deletion
      }

      // Bulk delete from database
      try {
        const { error } = await this.supabaseClient
          .from("prototype_assets")
          .delete()
          .eq("prototype_id", prototypeId)
          .in("name", binaryFilesToDelete);

        if (error) {
          this.logger.error(
            error,
            "Failed to bulk delete assets from database",
            {
              count: binaryFilesToDelete.length,
            },
          );
          result.errors.push(
            `Failed to bulk delete ${binaryFilesToDelete.length} assets: ${error.message}`,
          );
        } else {
          result.assetsDeleted += binaryFilesToDelete.length;
          this.logger.consoleLogDevOnly("info", "Bulk deleted assets", {
            count: binaryFilesToDelete.length,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(new Error(message), "Failed to bulk delete assets", {
          count: binaryFilesToDelete.length,
        });
        result.errors.push(`Failed to bulk delete assets: ${message}`);
      }
    }
  }

  /**
   * Process text files with bulk upsert operations
   */
  private async processTextFiles(
    textFiles: string[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    // TODO: currently single file fail will cause entire batch to fail, we should handle this better
    // Use larger batch size for bulk operations (was 5 for individual upserts)
    const chunks = this.chunkArray(
      textFiles,
      BATCH_CONFIG.FILE_UPSERT_BATCH_SIZE,
    );

    this.logger.consoleLogDevOnly(
      "info",
      "Processing text files with bulk upsert",
      {
        totalFiles: textFiles.length,
        batches: chunks.length,
        batchSize: BATCH_CONFIG.FILE_UPSERT_BATCH_SIZE,
      },
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        // Read all files in the batch concurrently
        const fileDataPromises = chunk.map(async (filePath) => {
          try {
            const fullPath = path.join(this.workDir, filePath);
            const contents = await fs.readFile(fullPath, "utf8");
            return {
              prototype_id: prototypeId,
              name: filePath,
              contents: contents,
              updated_at: new Date().toISOString(),
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(new Error(message), "Failed to read text file", {
              path: filePath,
            });
            result.errors.push(`Failed to read ${filePath}: ${message}`);
            return null;
          }
        });

        const fileData = (await Promise.all(fileDataPromises)).filter(
          (data): data is NonNullable<typeof data> => data !== null,
        );

        if (fileData.length === 0) {
          this.logger.warn("No valid files to upsert in batch", {
            batchIndex: i + 1,
          });
          continue;
        }

        // Bulk upsert with retry logic
        let retries = 3;
        let success = false;

        while (retries > 0 && !success) {
          const { error } = await this.supabaseClient
            .from("prototype_files")
            .upsert(fileData, {
              onConflict: "prototype_id,name",
            });

          if (!error) {
            result.filesUpdated += fileData.length;
            success = true;
            this.logger.consoleLogDevOnly("info", "Bulk upserted text files", {
              batchIndex: i + 1,
              filesCount: fileData.length,
            });
          } else {
            retries--;
            const attempt = 4 - retries;
            this.logger.error(
              error,
              "Failed to bulk upsert files to database",
              {
                batchIndex: i + 1,
                filesCount: fileData.length,
                attempt,
                retriesRemaining: retries,
              },
            );

            if (retries === 0) {
              result.errors.push(
                `Failed to bulk upsert batch ${i + 1} (${fileData.length} files): ${error.message}`,
              );
            } else {
              // Exponential backoff
              await new Promise((resolve) =>
                setTimeout(resolve, Math.pow(2, 3 - retries) * 100),
              );
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          new Error(message),
          "Failed to process text file batch",
          { batchIndex: i + 1 },
        );
        result.errors.push(`Failed to process batch ${i + 1}: ${message}`);
      }

      // Small delay between batches to avoid overwhelming the database
      if (i < chunks.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, BATCH_CONFIG.BATCH_DELAY_MS),
        );
      }
    }
  }

  /**
   * Process binary files with parallel upload and bulk metadata upsert
   */
  private async processBinaryFiles(
    binaryFiles: string[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    // TODO: currently single asset fail will cause entire batch to fail, we should handle this better
    // Process in larger batches, with controlled concurrency for storage uploads
    const BATCH_SIZE = 50; // Process 50 files at a time
    const chunks = this.chunkArray(binaryFiles, BATCH_SIZE);

    this.logger.consoleLogDevOnly(
      "info",
      "Processing binary files with bulk operations",
      {
        totalFiles: binaryFiles.length,
        batches: chunks.length,
        batchSize: BATCH_SIZE,
        uploadConcurrency: BATCH_CONFIG.ASSET_UPLOAD_CONCURRENCY,
      },
    );

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
      const batch = chunks[batchIndex];
      const successfulUploads: Array<{
        prototype_id: string;
        name: string;
        storage_url: string;
        updated_at: string;
      }> = [];

      // Upload files to storage with controlled concurrency
      const uploadChunks = this.chunkArray(
        batch,
        BATCH_CONFIG.ASSET_UPLOAD_CONCURRENCY,
      );

      for (const uploadChunk of uploadChunks) {
        await Promise.all(
          uploadChunk.map(async (filePath) => {
            try {
              const fullPath = path.join(this.workDir, filePath);
              const stats = await fs.stat(fullPath);

              // Skip very large files (>10MB)
              if (stats.size > 10 * 1024 * 1024) {
                this.logger.warn("Skipping large binary file", {
                  path: filePath,
                  size: stats.size,
                });
                result.errors.push(
                  `Skipped ${filePath}: file too large (${Math.round(stats.size / 1024 / 1024)}MB)`,
                );
                return;
              }

              const fileBuffer = await fs.readFile(fullPath);

              // Upload to storage bucket (with retry)
              let uploadSuccess = false;
              let retries = 3;

              while (retries > 0 && !uploadSuccess) {
                const { error: uploadError } = await this.supabaseClient.storage
                  .from("prototype-assets")
                  .upload(`${prototypeId}/${filePath}`, fileBuffer, {
                    upsert: true,
                    contentType: this.getContentType(filePath),
                  });

                if (!uploadError) {
                  uploadSuccess = true;
                  // Add to successful uploads for bulk metadata upsert
                  successfulUploads.push({
                    prototype_id: prototypeId,
                    name: filePath,
                    storage_url: `${prototypeId}/${filePath}`,
                    updated_at: new Date().toISOString(),
                  });
                } else {
                  retries--;
                  if (retries === 0) {
                    this.logger.error(
                      uploadError,
                      "Failed to upload asset to storage",
                      { path: filePath },
                    );
                    result.errors.push(
                      `Failed to upload asset ${filePath}: ${uploadError.message}`,
                    );
                  } else {
                    await new Promise((resolve) =>
                      setTimeout(resolve, Math.pow(2, 3 - retries) * 100),
                    );
                  }
                }
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              this.logger.error(
                new Error(message),
                "Failed to process binary file",
                { path: filePath },
              );
              result.errors.push(`Failed to process ${filePath}: ${message}`);
            }
          }),
        );
      }

      // Bulk upsert metadata for all successfully uploaded files in this batch
      if (successfulUploads.length > 0) {
        let retries = 3;
        let success = false;

        while (retries > 0 && !success) {
          const { error: dbError } = await this.supabaseClient
            .from("prototype_assets")
            .upsert(successfulUploads, {
              onConflict: "prototype_id,name",
            });

          if (!dbError) {
            result.assetsUpdated += successfulUploads.length;
            success = true;
            this.logger.consoleLogDevOnly(
              "info",
              "Bulk upserted asset metadata",
              {
                batchIndex: batchIndex + 1,
                assetsCount: successfulUploads.length,
              },
            );
          } else {
            retries--;
            const attempt = 4 - retries;
            this.logger.error(
              dbError,
              "Failed to bulk upsert asset metadata to database",
              {
                batchIndex: batchIndex + 1,
                assetsCount: successfulUploads.length,
                attempt,
                retriesRemaining: retries,
              },
            );

            if (retries === 0) {
              result.errors.push(
                `Failed to bulk upsert metadata for batch ${batchIndex + 1} (${successfulUploads.length} assets): ${dbError.message}`,
              );
            } else {
              // Exponential backoff
              await new Promise((resolve) =>
                setTimeout(resolve, Math.pow(2, 3 - retries) * 100),
              );
            }
          }
        }
      }

      // Small delay between batches to avoid overwhelming storage/database
      if (batchIndex < chunks.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, BATCH_CONFIG.BATCH_DELAY_MS),
        );
      }
    }
  }

  /**
   * Check if file is binary based on extension
   */
  private isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.binaryExtensions.includes(ext);
  }

  /**
   * Get content type for binary file
   */
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
      ".pdf": "application/pdf",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".otf": "font/otf",
    };
    return contentTypes[ext] || "application/octet-stream";
  }

  /**
   * Fetches all files and assets from Supabase for a given prototype.
   * Downloads asset content from storage and converts to base64.
   * Uses batching to handle large numbers of files efficiently.
   */
  public async fetchAllFilesAndAssetsFromSupabaseForInitialSync(
    prototypeId: string,
  ): Promise<{
    files: PrototypeFileInput[];
    assets: PrototypeAssetInputWithContent[];
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      this.logger.consoleLogDevOnly(
        "info",
        "Starting batched fetch from Supabase",
        {
          prototype_id: prototypeId,
        },
      );

      // Fetch files in batches using pagination
      const files = await this.fetchFilesInBatches(prototypeId, errors);

      this.logger.consoleLogDevOnly("info", "Fetched all files from Supabase", {
        fileCount: files.length,
      });

      // Fetch asset metadata in batches
      const assetMetadata = await this.fetchAssetMetadataInBatches(
        prototypeId,
        errors,
      );

      this.logger.consoleLogDevOnly(
        "info",
        "Fetched asset metadata from Supabase",
        {
          assetCount: assetMetadata.length,
        },
      );

      // Download assets with controlled concurrency
      const assetsWithContent = await this.downloadAssetsInBatches(
        assetMetadata,
        errors,
      );

      this.logger.consoleLogDevOnly(
        "info",
        "Downloaded all assets from Supabase storage",
        {
          downloadedCount: assetsWithContent.length,
          failedCount: assetMetadata.length - assetsWithContent.length,
        },
      );

      return { files, assets: assetsWithContent, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        new Error(message),
        "Failed to fetch files and assets from Supabase",
        { prototypeId },
      );
      errors.push(`Fetch failed: ${message}`);
      return { files: [], assets: [], errors };
    }
  }

  /**
   * Fetches files from Supabase in batches using pagination
   */
  private async fetchFilesInBatches(
    prototypeId: string,
    errors: string[],
  ): Promise<PrototypeFileInput[]> {
    const allFiles: PrototypeFileInput[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const { data, error } = await this.supabaseClient
          .from("prototype_files")
          .select("*")
          .eq("prototype_id", prototypeId)
          .range(offset, offset + BATCH_CONFIG.FILE_FETCH_BATCH_SIZE - 1)
          .order("name", { ascending: true });

        if (error) {
          const errorMsg = `Failed to fetch files batch at offset ${offset}: ${error.message}`;
          this.logger.error(new Error(errorMsg), "File batch fetch failed", {
            error,
            offset,
          });
          errors.push(errorMsg);
          break;
        }

        if (data && data.length > 0) {
          allFiles.push(...data);
          this.logger.debug("Fetched file batch", {
            batchSize: data.length,
            offset,
            totalSoFar: allFiles.length,
          });

          // Check if we got a full batch (indicates more data might exist)
          hasMore = data.length === BATCH_CONFIG.FILE_FETCH_BATCH_SIZE;
          offset += BATCH_CONFIG.FILE_FETCH_BATCH_SIZE;

          // Small delay to avoid rate limiting
          if (hasMore) {
            await new Promise((resolve) =>
              setTimeout(resolve, BATCH_CONFIG.BATCH_DELAY_MS),
            );
          }
        } else {
          hasMore = false;
        }
      } catch (err) {
        const errorMsg = `Error fetching files batch: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.error(new Error(errorMsg), "File batch fetch error", {
          offset,
        });
        errors.push(errorMsg);
        break;
      }
    }

    return allFiles;
  }

  /**
   * Fetches asset metadata from Supabase in batches using pagination
   */
  private async fetchAssetMetadataInBatches(
    prototypeId: string,
    errors: string[],
  ): Promise<PrototypeAssetInput[]> {
    const allAssets: PrototypeAssetInput[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const { data, error } = await this.supabaseClient
          .from("prototype_assets")
          .select("*")
          .eq("prototype_id", prototypeId)
          .range(
            offset,
            offset + BATCH_CONFIG.ASSET_METADATA_FETCH_BATCH_SIZE - 1,
          )
          .order("name", { ascending: true });

        if (error) {
          const errorMsg = `Failed to fetch assets batch at offset ${offset}: ${error.message}`;
          this.logger.error(new Error(errorMsg), "Asset batch fetch failed", {
            error,
            offset,
          });
          errors.push(errorMsg);
          break;
        }

        if (data && data.length > 0) {
          allAssets.push(...data);
          this.logger.debug("Fetched asset metadata batch", {
            batchSize: data.length,
            offset,
            totalSoFar: allAssets.length,
          });

          // Check if we got a full batch
          hasMore =
            data.length === BATCH_CONFIG.ASSET_METADATA_FETCH_BATCH_SIZE;
          offset += BATCH_CONFIG.ASSET_METADATA_FETCH_BATCH_SIZE;

          // Small delay to avoid rate limiting
          if (hasMore) {
            await new Promise((resolve) =>
              setTimeout(resolve, BATCH_CONFIG.BATCH_DELAY_MS),
            );
          }
        } else {
          hasMore = false;
        }
      } catch (err) {
        const errorMsg = `Error fetching asset metadata batch: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.error(new Error(errorMsg), "Asset metadata batch error", {
          offset,
        });
        errors.push(errorMsg);
        break;
      }
    }

    return allAssets;
  }

  /**
   * Downloads assets from Supabase storage with controlled concurrency
   */
  private async downloadAssetsInBatches(
    assetMetadata: PrototypeAssetInput[],
    errors: string[],
  ): Promise<PrototypeAssetInputWithContent[]> {
    const allAssetsWithContent: PrototypeAssetInputWithContent[] = [];

    // Split assets into chunks for controlled concurrency
    const chunks = this.chunkArray(
      assetMetadata,
      BATCH_CONFIG.ASSET_DOWNLOAD_CONCURRENCY,
    );

    let processedCount = 0;

    for (const chunk of chunks) {
      try {
        // Download assets in this chunk in parallel
        const downloadResults = await Promise.all(
          chunk.map(async (asset) => {
            try {
              const { data, error } = await this.supabaseClient.storage
                .from("prototype-assets")
                .download(`${asset.prototype_id}/${asset.name}`);

              if (error || !data) {
                this.logger.warn("Failed to download asset", {
                  assetName: asset.name,
                  error: error?.message ?? "unknown error",
                });
                errors.push(
                  `Failed to download asset ${asset.name}: ${error?.message ?? "unknown error"}`,
                );
                return null;
              }

              const arrayBuffer = await data.arrayBuffer();
              const base64Content = Buffer.from(arrayBuffer).toString("base64");

              return {
                ...asset,
                contents: base64Content,
              } as PrototypeAssetInputWithContent;
            } catch (err) {
              this.logger.warn("Error downloading asset", {
                assetName: asset.name,
                error: err instanceof Error ? err.message : String(err),
              });
              errors.push(
                `Error downloading asset ${asset.name}: ${err instanceof Error ? err.message : String(err)}`,
              );
              return null;
            }
          }),
        );

        // Filter out failed downloads and add successful ones
        const successfulDownloads = downloadResults.filter(
          (result): result is PrototypeAssetInputWithContent => result !== null,
        );
        allAssetsWithContent.push(...successfulDownloads);

        processedCount += chunk.length;
        this.logger.debug("Downloaded asset batch", {
          batchSize: chunk.length,
          successfulDownloads: successfulDownloads.length,
          processedCount,
          totalAssets: assetMetadata.length,
        });

        // Small delay between batches to avoid overwhelming storage
        if (processedCount < assetMetadata.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, BATCH_CONFIG.BATCH_DELAY_MS),
          );
        }
      } catch (err) {
        const errorMsg = `Error downloading asset batch: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.error(new Error(errorMsg), "Asset download batch error");
        errors.push(errorMsg);
        // Continue with next batch despite error
      }
    }

    return allAssetsWithContent;
  }

  /**
   * Split array into chunks for parallel processing
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
