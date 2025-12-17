import chokidar from "chokidar";
import type { Dirent } from "fs";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../loggers/SystemLogger.js";
import {
  PrototypeAssetInput,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
} from "../types/BuildWorkerTypes.js";
import { Database } from "../types/supabase.js";
import { writeProjectFiles } from "../utils/shared-utils.js";
import { SupabaseClientService } from "./SupabaseClientService.js";
import { WORK_DIR } from "../worker.js";

interface SyncResult {
  success: boolean;
  filesUpdated: number;
  filesDeleted: number;
  assetsUpdated: number;
  assetsDeleted: number;
  errors: string[];
}

type SyncMode = "all" | "tracked" | "all_files_only";

interface SyncTargets {
  files: string[];
  assets: string[];
  deletedFiles: string[];
  deletedAssets: string[];
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
  private readonly logger: SystemLogger;
  private readonly supabaseClientService: SupabaseClientService;
  private fileWatcher?: chokidar.FSWatcher;
  private readonly updatedFiles = new Set<string>();
  private readonly updatedAssets = new Set<string>();
  private readonly deletedFiles = new Set<string>();
  private readonly deletedAssets = new Set<string>();

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
  // Directories to skip at ANY nesting level (not just root)
  // This prevents syncing node_modules, build artifacts, etc. wherever they appear
  private readonly skipDirectories = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".cache",
    "tmp",
    ".npm-cache",
    ".expo",
    ".expo-shared",
    "coverage",
    ".turbo",
    "out",
    ".vercel",
    "__pycache__",
    ".swc",
    ".webpack",
    ".yarn",
    ".pnpm-store",
  ]);

  private readonly skipFileNames = new Set([
    ".DS_Store",
    ".npmrc",
    ".yarnrc",
    ".env",
    ".eslintcache",
    ".stylelintcache",
  ]);
  // File patterns/suffixes to skip (for pattern matching)
  private readonly skipFileSuffixes = [
    ".tsbuildinfo", // TypeScript incremental build info files
  ];

  constructor(
    supabaseClientService: SupabaseClientService,
    logger: SystemLogger,
  ) {
    this.supabaseClientService = supabaseClientService;
    this.logger = logger.child({ service: "FileSyncService" });
    this.initializeFileWatcher();
  }

  private initializeFileWatcher(): void {
    if (this.fileWatcher) {
      return;
    }

    try {
      this.fileWatcher = chokidar
        .watch(WORK_DIR, {
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 200,
            pollInterval: 100,
          },
          ignored: (targetPath) => this.shouldIgnoreWatcherTarget(targetPath),
        })
        .on("add", (filePath) => this.handleWatcherUpdate(filePath))
        .on("change", (filePath) => this.handleWatcherUpdate(filePath))
        .on("unlink", (filePath) => this.handleWatcherDeletion(filePath))
        .on("error", (error) => {
          this.logger.warn("File watcher error", {
            error: error instanceof Error ? error.message : String(error),
          });
        });

      this.logger.consoleLogDevOnly("info", "Initialized file watcher", {
        workDir: WORK_DIR,
      });
    } catch (error) {
      this.logger.warn("Failed to initialize file watcher", {
        workDir: WORK_DIR,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private shouldIgnoreWatcherTarget(targetPath: string): boolean {
    const relativePath = path.relative(WORK_DIR, targetPath);

    if (relativePath === "") {
      // Root directory itself
      return false;
    }

    if (relativePath.startsWith("..")) {
      return true;
    }

    return this.shouldSkipRelativePath(relativePath, path.basename(targetPath));
  }

  private handleWatcherUpdate(fullPath: string): void {
    const relativePath = this.getTrackedRelativePath(fullPath);
    if (!relativePath) {
      return;
    }

    const isAsset = this.isBinaryFile(relativePath);
    if (isAsset) {
      this.updatedAssets.add(relativePath);
      this.deletedAssets.delete(relativePath);
      this.updatedFiles.delete(relativePath);
      this.deletedFiles.delete(relativePath);
    } else {
      this.updatedFiles.add(relativePath);
      this.deletedFiles.delete(relativePath);
      this.updatedAssets.delete(relativePath);
      this.deletedAssets.delete(relativePath);
    }
  }

  private handleWatcherDeletion(fullPath: string): void {
    const relativePath = this.getTrackedRelativePath(fullPath);
    if (!relativePath) {
      return;
    }

    const isAsset = this.isBinaryFile(relativePath);
    if (isAsset) {
      this.updatedAssets.delete(relativePath);
      this.deletedAssets.add(relativePath);
      this.updatedFiles.delete(relativePath);
      this.deletedFiles.delete(relativePath);
    } else {
      this.updatedFiles.delete(relativePath);
      this.deletedFiles.add(relativePath);
      this.updatedAssets.delete(relativePath);
      this.deletedAssets.delete(relativePath);
    }
  }

  private getTrackedRelativePath(fullPath: string): string | null {
    const relativePath = path.relative(WORK_DIR, fullPath);

    if (!relativePath || relativePath.startsWith("..")) {
      return null;
    }

    if (this.shouldSkipRelativePath(relativePath, path.basename(fullPath))) {
      return null;
    }

    return relativePath;
  }

  private consumeFileWatcherChanges(): SyncTargets {
    const targets: SyncTargets = {
      files: Array.from(this.updatedFiles),
      assets: Array.from(this.updatedAssets),
      deletedFiles: Array.from(this.deletedFiles),
      deletedAssets: Array.from(this.deletedAssets),
    };

    this.resetTrackedChanges();
    return targets;
  }

  private resetTrackedChanges(): void {
    this.updatedFiles.clear();
    this.updatedAssets.clear();
    this.deletedFiles.clear();
    this.deletedAssets.clear();
  }

  private resetFileChangesOnly(): void {
    this.updatedFiles.clear();
    this.deletedFiles.clear();
  }

  private shouldSkipRelativePath(
    relativePath: string,
    entryName: string,
  ): boolean {
    const relativeSegments = relativePath.split(path.sep);

    // Check if any segment in the path matches blocked directories (not just root)
    if (relativeSegments.some((segment) => this.skipDirectories.has(segment))) {
      return true;
    }

    // Check exact filename matches
    if (
      relativeSegments.some((segment) => this.skipFileNames.has(segment)) ||
      this.skipFileNames.has(entryName)
    ) {
      return true;
    }

    // Check file suffix patterns (e.g., *.tsbuildinfo)
    if (this.skipFileSuffixes.some((suffix) => entryName.endsWith(suffix))) {
      return true;
    }

    return false;
  }

  // ------------------------------------------------------------
  // Sync files public API method
  // ------------------------------------------------------------

  /**
   * Syncs files/assets to Supabase based on the requested mode.
   * - all: syncs all files and assets detected in the work directory.
   * - tracked: placeholder for incremental sync using tracked file list.
   * - all_files_only: syncs only text files from the work directory.
   */
  public async syncFilesToSupabase(
    prototypeId: string,
    mode: SyncMode,
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
      this.logger.consoleLogDevOnly("info", "Starting file sync", {
        prototypeId,
        mode,
      });

      const { files, assets, deletedFiles, deletedAssets } =
        await this.loadSyncTargets(mode);

      await this.processDeletions(
        [...deletedFiles, ...deletedAssets],
        prototypeId,
        result,
      );
      await this.processTextFiles(files, prototypeId, result);
      await this.processBinaryFiles(assets, prototypeId, result);

      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(new Error(message), "File sync failed", {
        prototypeId,
        mode,
      });
      result.errors.push(`Sync failed: ${message}`);
      result.success = false;
      return result;
    }
  }

  // ------------------------------------------------------------
  // Load files for sync helper functions
  // ------------------------------------------------------------

  private async loadSyncTargets(mode: SyncMode): Promise<SyncTargets> {
    switch (mode) {
      case "all":
        return this.loadAllSyncTargets();
      case "all_files_only":
        return this.loadAllFilesOnlySyncTargets();
      case "tracked":
      default:
        return this.loadTrackedSyncTargets();
    }
  }

  private async loadAllSyncTargets(): Promise<SyncTargets> {
    this.resetTrackedChanges();

    this.logger.consoleLogDevOnly(
      "info",
      "Scanning directory for full sync targets",
      {
        workDir: WORK_DIR,
      },
    );

    const allFiles = await this.scanDirectory(WORK_DIR);

    this.logger.consoleLogDevOnly("info", "Scanned directory for files", {
      fileCount: allFiles.length,
    });

    const { textFiles, binaryFiles } = this.partitionFilesByType(allFiles);

    return {
      files: textFiles,
      assets: binaryFiles,
      deletedFiles: [],
      deletedAssets: [],
    };
  }

  private async loadTrackedSyncTargets(): Promise<SyncTargets> {
    return this.consumeFileWatcherChanges();
  }

  private async loadAllFilesOnlySyncTargets(): Promise<SyncTargets> {
    this.resetFileChangesOnly();

    const allFiles = await this.scanDirectory(WORK_DIR);
    const { textFiles } = this.partitionFilesByType(allFiles);

    return {
      files: textFiles,
      assets: [],
      deletedFiles: [],
      deletedAssets: [],
    };
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

        // Skip blocked directories and files at any nesting level
        if (this.shouldSkipRelativePath(entryRelativePath, entry.name)) {
          continue;
        }

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

  private partitionFilesByType(filePaths: string[]): {
    textFiles: string[];
    binaryFiles: string[];
  } {
    const textFiles: string[] = [];
    const binaryFiles: string[] = [];

    for (const filePath of filePaths) {
      if (this.isBinaryFile(filePath)) {
        binaryFiles.push(filePath);
      } else {
        textFiles.push(filePath);
      }
    }

    return { textFiles, binaryFiles };
  }

  // ------------------------------------------------------------
  // Efficiently batch persist files to supabase helper functions
  // ------------------------------------------------------------

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
        const { error } = await this.supabaseClientService
          .getClient()
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
        const { error: storageError } = await this.supabaseClientService
          .getClient()
          .storage.from("prototype-assets")
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
        const { error } = await this.supabaseClientService
          .getClient()
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
    if (textFiles.length === 0) {
      return;
    }

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
        const fileDataPromises = chunk.map(
          async (
            filePath,
          ): Promise<
            Database["public"]["Tables"]["prototype_files"]["Insert"] | null
          > => {
            try {
              const fullPath = path.join(WORK_DIR, filePath);
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
              this.logger.error(
                new Error(message),
                "Failed to read text file",
                {
                  path: filePath,
                },
              );
              result.errors.push(`Failed to read ${filePath}: ${message}`);
              return null;
            }
          },
        );

        const fileData = (await Promise.all(fileDataPromises)).filter(
          (
            data,
          ): data is Database["public"]["Tables"]["prototype_files"]["Insert"] =>
            data !== null,
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
          const { error } = await this.supabaseClientService
            .getClient()
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
    if (binaryFiles.length === 0) {
      return;
    }
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
      const successfulUploads: Array<
        Database["public"]["Tables"]["prototype_assets"]["Insert"]
      > = [];

      // Upload files to storage with controlled concurrency
      const uploadChunks = this.chunkArray(
        batch,
        BATCH_CONFIG.ASSET_UPLOAD_CONCURRENCY,
      );

      for (const uploadChunk of uploadChunks) {
        await Promise.all(
          uploadChunk.map(async (filePath) => {
            try {
              const fullPath = path.join(WORK_DIR, filePath);
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
                const { error: uploadError } = await this.supabaseClientService
                  .getClient()
                  .storage.from("prototype-assets")
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
          const { error: dbError } = await this.supabaseClientService
            .getClient()
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

  private async prepareWorkspaceWithProject(
    files: PrototypeFileInput[],
    assets: PrototypeAssetInputWithContent[],
  ): Promise<void> {
    await fs.mkdir(WORK_DIR, { recursive: true });
    await this.cleanWorkspaceDirectory();
    await writeProjectFiles(files, assets, WORK_DIR);
    this.resetTrackedChanges();
  }

  private async cleanWorkspaceDirectory(): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(WORK_DIR, { withFileTypes: true });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      if (entry.name === ".keep") {
        continue;
      }

      const entryPath = path.join(WORK_DIR, entry.name);
      try {
        await fs.rm(entryPath, { recursive: true, force: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn("Failed to remove workspace entry", {
          entry: entryPath,
          error: message,
        });
        throw error instanceof Error ? error : new Error(message);
      }
    }
  }

  // ----------------------------------------------------------------------
  // PUBLIC API: Fetch files and assets from Supabase (whole or partial)
  // ----------------------------------------------------------------------

  /**
   * Fetches all files and assets from Supabase for a given prototype.
   * Downloads asset content from storage and converts to base64.
   * Uses batching to handle large numbers of files efficiently.
   */
  public async fetchAllFilesAndAssetsFromSupabaseAndWriteToDisk(
    prototypeId: string,
  ): Promise<{
    files: PrototypeFileInput[];
    assets: PrototypeAssetInputWithContent[];
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Fetch files in batches using pagination
      const files = await this.fetchFilesInBatches(prototypeId, errors);

      // Fetch asset metadata in batches
      const assetMetadata = await this.fetchAssetMetadataInBatches(
        prototypeId,
        errors,
      );

      // Download assets with controlled concurrency
      const assetsWithContent = await this.downloadAssetsInBatches(
        assetMetadata,
        errors,
      );
      await this.prepareWorkspaceWithProject(files, assetsWithContent); // resets tracked changes
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
   * Syncs specific files from Supabase by name and deletes specified files from disk
   * Used for selective file updates (e.g., from update-files-v2 endpoint)
   */
  public async syncSpecificFilesFromSupabase(
    prototypeId: string,
    fileNames: string[],
    assetNames: string[],
    deletedFileNames: string[],
    deletedAssetNames: string[],
  ): Promise<{
    success: boolean;
    filesUpdated: number;
    assetsUpdated: number;
    filesDeleted: number;
    assetsDeleted: number;
    errors: string[];
  }> {
    const result = {
      success: true,
      filesUpdated: 0,
      assetsUpdated: 0,
      filesDeleted: 0,
      assetsDeleted: 0,
      errors: [] as string[],
    };

    try {
      this.logger.consoleLogDevOnly("info", "Starting selective file sync", {
        prototypeId,
        fileNamesCount: fileNames.length,
        assetNamesCount: assetNames.length,
        deletedFileNamesCount: deletedFileNames.length,
        deletedAssetNamesCount: deletedAssetNames.length,
      });

      // Step 1: Delete specified files from disk
      if (deletedFileNames.length > 0) {
        for (const fileName of deletedFileNames) {
          try {
            const fullPath = path.join(WORK_DIR, fileName);
            await fs.unlink(fullPath);
            result.filesDeleted++;
            this.updatedFiles.delete(fileName);
            this.deletedFiles.delete(fileName);
          } catch (error) {
            // If file doesn't exist, that's fine - it's already deleted
            if (
              error instanceof Error &&
              "code" in error &&
              error.code !== "ENOENT"
            ) {
              const message =
                error instanceof Error ? error.message : String(error);
              this.logger.warn("Failed to delete file from disk", {
                fileName,
                error: message,
              });
              result.errors.push(
                `Failed to delete file ${fileName}: ${message}`,
              );
            } else {
              // File doesn't exist, count it as deleted
              result.filesDeleted++;
            }
          }
        }
        this.logger.consoleLogDevOnly("info", "Files deleted from disk", {
          count: result.filesDeleted,
        });
      }

      // Step 2: Delete specified assets from disk
      if (deletedAssetNames.length > 0) {
        for (const assetName of deletedAssetNames) {
          try {
            const fullPath = path.join(WORK_DIR, assetName);
            await fs.unlink(fullPath);
            result.assetsDeleted++;
            this.updatedAssets.delete(assetName);
            this.deletedAssets.delete(assetName);
          } catch (error) {
            // If file doesn't exist, that's fine - it's already deleted
            if (
              error instanceof Error &&
              "code" in error &&
              error.code !== "ENOENT"
            ) {
              const message =
                error instanceof Error ? error.message : String(error);
              this.logger.warn("Failed to delete asset from disk", {
                assetName,
                error: message,
              });
              result.errors.push(
                `Failed to delete asset ${assetName}: ${message}`,
              );
            } else {
              // File doesn't exist, count it as deleted
              result.assetsDeleted++;
            }
          }
        }
        this.logger.consoleLogDevOnly("info", "Assets deleted from disk", {
          count: result.assetsDeleted,
        });
      }

      // Step 3: Fetch specified files from Supabase
      if (fileNames.length > 0) {
        try {
          const { data: files, error } = await this.supabaseClientService
            .getClient()
            .from("prototype_files")
            .select("*")
            .eq("prototype_id", prototypeId)
            .in("name", fileNames);

          if (error) {
            const errorMsg = `Failed to fetch files from Supabase: ${error.message}`;
            this.logger.error(new Error(errorMsg), "File fetch failed", {
              prototypeId,
            });
            result.errors.push(errorMsg);
          } else if (files && files.length > 0) {
            // Write files to disk
            for (const file of files) {
              try {
                const fullPath = path.join(WORK_DIR, file.name);
                const parentDir = path.dirname(fullPath);
                await fs.mkdir(parentDir, { recursive: true });
                await fs.writeFile(fullPath, file.contents, "utf-8");
                result.filesUpdated++;
                this.updatedFiles.delete(file.name);
                this.deletedFiles.delete(file.name);
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                this.logger.error(
                  new Error(message),
                  "Failed to write file to disk",
                  { fileName: file.name },
                );
                result.errors.push(`Failed to write ${file.name}: ${message}`);
              }
            }
            this.logger.consoleLogDevOnly("info", "Files written to disk", {
              count: result.filesUpdated,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            new Error(message),
            "Error fetching files from Supabase",
            { prototypeId },
          );
          result.errors.push(`Failed to fetch files: ${message}`);
        }
      }

      // Step 4: Fetch specified assets from Supabase and download from storage
      if (assetNames.length > 0) {
        try {
          const { data: assets, error } = await this.supabaseClientService
            .getClient()
            .from("prototype_assets")
            .select("*")
            .eq("prototype_id", prototypeId)
            .in("name", assetNames);

          if (error) {
            const errorMsg = `Failed to fetch assets from Supabase: ${error.message}`;
            this.logger.error(new Error(errorMsg), "Asset fetch failed", {
              prototypeId,
            });
            result.errors.push(errorMsg);
          } else if (assets && assets.length > 0) {
            // Download and write assets to disk with controlled concurrency
            const chunks = this.chunkArray(
              assets,
              BATCH_CONFIG.ASSET_DOWNLOAD_CONCURRENCY,
            );

            for (const chunk of chunks) {
              await Promise.all(
                chunk.map(async (asset) => {
                  try {
                    // Download from storage
                    const { data, error: downloadError } =
                      await this.supabaseClientService
                        .getClient()
                        .storage.from("prototype-assets")
                        .download(asset.prototype_id + "/" + asset.name);

                    if (downloadError || !data) {
                      this.logger.warn("Failed to download asset", {
                        assetName: asset.name,
                        error: JSON.stringify(downloadError),
                      });
                      result.errors.push(
                        `Failed to download asset ${asset.name}: ${JSON.stringify(downloadError)}`,
                      );
                      return;
                    }

                    // Write to disk
                    const fullPath = path.join(WORK_DIR, asset.name);
                    const parentDir = path.dirname(fullPath);
                    await fs.mkdir(parentDir, { recursive: true });

                    const arrayBuffer = await data.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    await fs.writeFile(fullPath, buffer);
                    result.assetsUpdated++;
                    this.updatedAssets.delete(asset.name);
                    this.deletedAssets.delete(asset.name);
                  } catch (error) {
                    const message =
                      error instanceof Error ? error.message : String(error);
                    this.logger.error(
                      new Error(message),
                      "Failed to process asset",
                      { assetName: asset.name },
                    );
                    result.errors.push(
                      `Failed to process asset ${asset.name}: ${message}`,
                    );
                  }
                }),
              );
            }
            this.logger.consoleLogDevOnly("info", "Assets written to disk", {
              count: result.assetsUpdated,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            new Error(message),
            "Error fetching assets from Supabase",
            { prototypeId },
          );
          result.errors.push(`Failed to fetch assets: ${message}`);
        }
      }

      // Set success to false if any errors occurred
      if (result.errors.length > 0) {
        result.success = false;
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(new Error(message), "Selective file sync failed", {
        prototypeId,
      });
      result.errors.push(`Sync failed: ${message}`);
      result.success = false;
      return result;
    }
  }

  // ------------------------------------------------------------
  // Fetch files and assets from Supabase helper functions
  // ------------------------------------------------------------
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
        const { data, error } = await this.supabaseClientService
          .getClient()
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
        const { data, error } = await this.supabaseClientService
          .getClient()
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
              const { data, error } = await this.supabaseClientService
                .getClient()
                .storage.from("prototype-assets")
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
