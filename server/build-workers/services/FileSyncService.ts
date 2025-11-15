import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { Database } from "../types/supabase.js";

interface SyncResult {
  success: boolean;
  filesUpdated: number;
  filesDeleted: number;
  assetsUpdated: number;
  assetsDeleted: number;
  errors: string[];
}

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
   * Syncs all changed files from the tracked file list to Supabase.
   * Uses file paths tracked by the file system watcher in CodeService.
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
            let retries = 3;
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

              retries--;
              if (retries === 0) {
                this.logger.error(error, "Failed to upsert file to database", {
                  path: filePath,
                });
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
