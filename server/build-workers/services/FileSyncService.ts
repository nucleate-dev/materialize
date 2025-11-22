import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { Database } from "../types/supabase.js";
import {
  PrototypeFileInput,
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
  FILE_FETCH_BATCH_SIZE: 1000,
  ASSET_METADATA_FETCH_BATCH_SIZE: 500,
  // Asset download concurrency (parallel downloads)
  ASSET_DOWNLOAD_CONCURRENCY: 10,
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
      this.logger.info("Starting full directory sync", {
        prototypeId,
        workDir: this.workDir,
      });

      // Recursively scan the work directory for all files
      const allFiles = await this.scanDirectory(this.workDir);

      this.logger.info("Scanned directory for files", {
        prototypeId,
        fileCount: allFiles.length,
      });

      if (allFiles.length === 0) {
        this.logger.info("No files found in work directory", {
          prototypeId,
        });
        return result;
      }

      // Separate files into text and binary
      const modifiedFiles = allFiles;
      const deletedFiles: string[] = []; // No deletions in full sync

      // Process all files
      await this.processChangedFiles(
        modifiedFiles,
        deletedFiles,
        prototypeId,
        result,
      );

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
      await this.processChangedFiles(
        modifiedFiles,
        deletedFiles,
        prototypeId,
        result,
      );

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
   * Process all changed files and sync to Supabase
   */
  private async processChangedFiles(
    modifiedFiles: string[],
    deletedFiles: string[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
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

    // Process deletions first
    await this.processDeletions(deletedFiles, prototypeId, result);

    // Process text files (parallel with concurrency limit)
    await this.processTextFiles(textFiles, prototypeId, result);

    // Process binary assets (parallel with concurrency limit)
    await this.processBinaryFiles(binaryFiles, prototypeId, result);
  }

  /**
   * Process deleted files
   */
  private async processDeletions(
    deletedFiles: string[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    for (const filePath of deletedFiles) {
      try {
        const isBinary = this.isBinaryFile(filePath);

        if (isBinary) {
          // Delete from storage bucket
          try {
            await this.supabaseClient.storage
              .from("prototype-assets")
              .remove([`${prototypeId}/${filePath}`]);
          } catch (storageError) {
            this.logger.warn("Failed to delete asset from storage", {
              path: filePath,
              error:
                storageError instanceof Error
                  ? storageError.message
                  : String(storageError),
            });
          }

          // Delete from prototype_assets table
          const { error } = await this.supabaseClient
            .from("prototype_assets")
            .delete()
            .match({ prototype_id: prototypeId, name: filePath });

          if (error) {
            this.logger.error(error, "Failed to delete asset from database", {
              path: filePath,
            });
            result.errors.push(
              `Failed to delete asset ${filePath}: ${error.message}`,
            );
          } else {
            result.assetsDeleted++;
          }
        } else {
          // Delete from prototype_files table
          const { error } = await this.supabaseClient
            .from("prototype_files")
            .delete()
            .match({ prototype_id: prototypeId, name: filePath });

          if (error) {
            this.logger.error(error, "Failed to delete file from database", {
              path: filePath,
            });
            result.errors.push(
              `Failed to delete file ${filePath}: ${error.message}`,
            );
          } else {
            result.filesDeleted++;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          new Error(message),
          "Failed to process file deletion",
          { path: filePath },
        );
        result.errors.push(`Failed to delete ${filePath}: ${message}`);
      }
    }
  }

  /**
   * Process text files with parallel upload (concurrency limit: 5)
   */
  private async processTextFiles(
    textFiles: string[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    const concurrency = 5;
    const chunks = this.chunkArray(textFiles, concurrency);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (filePath) => {
          try {
            const fullPath = path.join(this.workDir, filePath);
            const contents = await fs.readFile(fullPath, "utf8");

            // Retry logic for upsert
            let retries = 0;
            while (retries > 0) {
              const { error } = await this.supabaseClient
                .from("prototype_files")
                .upsert(
                  {
                    prototype_id: prototypeId,
                    name: filePath,
                    contents: contents,
                    updated_at: new Date().toISOString(),
                  },
                  {
                    onConflict: "prototype_id,name",
                  },
                );

              if (!error) {
                result.filesUpdated++;
                break;
              }

              const attempt = 4 - retries;
              this.logger.error(error, "Failed to upsert file to database", {
                path: filePath,
                attempt,
                retriesRemaining: retries - 1,
              });

              retries--;
              if (retries === 0) {
                result.errors.push(
                  `Failed to upsert file ${filePath}: ${error.message}`,
                );
              } else {
                // Exponential backoff
                await new Promise((resolve) =>
                  setTimeout(resolve, Math.pow(2, 3 - retries) * 100),
                );
              }
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              new Error(message),
              "Failed to process text file",
              { path: filePath },
            );
            result.errors.push(`Failed to process ${filePath}: ${message}`);
          }
        }),
      );
    }
  }

  /**
   * Process binary files with parallel upload (concurrency limit: 3)
   */
  private async processBinaryFiles(
    binaryFiles: string[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    const concurrency = 3; // Lower for binary files (larger)
    const chunks = this.chunkArray(binaryFiles, concurrency);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (filePath) => {
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
                  return;
                } else {
                  await new Promise((resolve) =>
                    setTimeout(resolve, Math.pow(2, 3 - retries) * 100),
                  );
                }
              }
            }

            // Update metadata in database
            const storageUrl = `${prototypeId}/${filePath}`;

            const { error: dbError } = await this.supabaseClient
              .from("prototype_assets")
              .upsert(
                {
                  prototype_id: prototypeId,
                  name: filePath,
                  storage_url: storageUrl,
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict: "prototype_id,name",
                },
              );

            if (dbError) {
              this.logger.error(
                dbError,
                "Failed to upsert asset metadata to database",
                { path: filePath },
              );
              result.errors.push(
                `Failed to upsert asset metadata ${filePath}: ${dbError.message}`,
              );
            } else {
              result.assetsUpdated++;
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
      this.logger.info("Starting batched fetch from Supabase", {
        prototype_id: prototypeId,
      });

      // Fetch files in batches using pagination
      const files = await this.fetchFilesInBatches(prototypeId, errors);

      this.logger.info("Fetched all files from Supabase", {
        fileCount: files.length,
      });

      // Fetch asset metadata in batches
      const assetMetadata = await this.fetchAssetMetadataInBatches(
        prototypeId,
        errors,
      );

      this.logger.info("Fetched asset metadata from Supabase", {
        assetCount: assetMetadata.length,
      });

      // Download assets with controlled concurrency
      const assetsWithContent = await this.downloadAssetsInBatches(
        assetMetadata,
        errors,
      );

      this.logger.info("Downloaded all assets from Supabase storage", {
        downloadedCount: assetsWithContent.length,
        failedCount: assetMetadata.length - assetsWithContent.length,
      });

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
  ): Promise<Array<{ prototype_id: string; name: string; storage_url: string }>> {
    const allAssets: Array<{
      prototype_id: string;
      name: string;
      storage_url: string;
    }> = [];
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
    assetMetadata: Array<{ prototype_id: string; name: string; storage_url: string }>,
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
              const base64Content = Buffer.from(arrayBuffer).toString(
                "base64",
              );

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
