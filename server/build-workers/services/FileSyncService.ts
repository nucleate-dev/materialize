import { SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
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

interface GitFileChange {
  status: string; // M, A, D, R, etc.
  path: string;
}

export class FileSyncService {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private readonly supabaseClient: SupabaseClient<Database>;

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
   * Syncs all changed files from the local git repository to Supabase.
   * Uses git status to detect changes and commits them before syncing.
   */
  public async syncFilesToSupabase(prototypeId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      filesUpdated: 0,
      filesDeleted: 0,
      assetsUpdated: 0,
      assetsDeleted: 0,
      errors: [],
    };

    try {
      this.logger.info("Starting file sync to Supabase", { prototypeId });

      // Check if git is initialized
      try {
        execSync("git rev-parse --git-dir", {
          cwd: this.workDir,
          stdio: "pipe",
        });
      } catch (error) {
        this.logger.warn("Git not initialized, skipping sync", { prototypeId });
        return result;
      }

      // Get list of changed files before commit
      const changedFiles = this.getChangedFiles();

      if (changedFiles.length === 0) {
        this.logger.info("No file changes detected, skipping sync", {
          prototypeId,
        });
        return result;
      }

      this.logger.info("Detected file changes", {
        prototypeId,
        fileCount: changedFiles.length,
        files: changedFiles.map((f) => `${f.status} ${f.path}`),
      });

      // Add all changes to staging
      try {
        execSync("git add -A", { cwd: this.workDir, stdio: "pipe" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          new Error(message),
          "Failed to stage files with git add",
        );
        result.errors.push(`Failed to stage files: ${message}`);
        result.success = false;
        return result;
      }

      // Commit changes
      const commitMessage = `Claude Code changes - ${new Date().toISOString()}`;
      try {
        execSync(`git commit -m "${commitMessage}"`, {
          cwd: this.workDir,
          stdio: "pipe",
        });
        this.logger.info("Committed changes to git", { prototypeId });
      } catch (error) {
        // Commit might fail if there are no changes (shouldn't happen, but handle it)
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("nothing to commit")) {
          this.logger.info("No changes to commit", { prototypeId });
          return result;
        }
        this.logger.error(
          new Error(message),
          "Failed to commit changes to git",
        );
        result.errors.push(`Failed to commit: ${message}`);
        result.success = false;
        return result;
      }

      // Process each changed file
      await this.processChangedFiles(changedFiles, prototypeId, result);

      this.logger.info("File sync completed", {
        prototypeId,
        filesUpdated: result.filesUpdated,
        filesDeleted: result.filesDeleted,
        assetsUpdated: result.assetsUpdated,
        assetsDeleted: result.assetsDeleted,
        errorCount: result.errors.length,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(new Error(message), "File sync failed", { prototypeId });
      result.errors.push(`Sync failed: ${message}`);
      result.success = false;
      return result;
    }
  }

  /**
   * Gets list of changed files from git status
   */
  private getChangedFiles(): GitFileChange[] {
    try {
      const output = execSync("git status --porcelain", {
        cwd: this.workDir,
        encoding: "utf8",
      });

      if (!output.trim()) {
        return [];
      }

      const changes: GitFileChange[] = [];
      const lines = output.trim().split("\n");

      for (const line of lines) {
        // Git status --porcelain format: XY filename
        // X = index status, Y = working tree status
        const status = line.substring(0, 2).trim();
        const filePath = line.substring(3).trim();

        // Skip ignored files and directories
        if (this.shouldIgnoreFile(filePath)) {
          continue;
        }

        changes.push({
          status: status,
          path: filePath,
        });
      }

      return changes;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to get git status",
      );
      return [];
    }
  }

  /**
   * Process all changed files and sync to Supabase
   */
  private async processChangedFiles(
    changes: GitFileChange[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    // Separate files by type
    const textFiles: GitFileChange[] = [];
    const binaryFiles: GitFileChange[] = [];
    const deletedFiles: GitFileChange[] = [];

    for (const change of changes) {
      if (change.status === "D") {
        deletedFiles.push(change);
      } else if (this.isBinaryFile(change.path)) {
        binaryFiles.push(change);
      } else {
        textFiles.push(change);
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
    deletedFiles: GitFileChange[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    for (const file of deletedFiles) {
      try {
        const isBinary = this.isBinaryFile(file.path);

        if (isBinary) {
          // Delete from storage bucket
          try {
            await this.supabaseClient.storage
              .from("prototype-assets")
              .remove([`${prototypeId}/${file.path}`]);
          } catch (storageError) {
            this.logger.warn("Failed to delete asset from storage", {
              path: file.path,
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
            .match({ prototype_id: prototypeId, name: file.path });

          if (error) {
            this.logger.error(error, "Failed to delete asset from database", {
              path: file.path,
            });
            result.errors.push(
              `Failed to delete asset ${file.path}: ${error.message}`,
            );
          } else {
            result.assetsDeleted++;
          }
        } else {
          // Delete from prototype_files table
          const { error } = await this.supabaseClient
            .from("prototype_files")
            .delete()
            .match({ prototype_id: prototypeId, name: file.path });

          if (error) {
            this.logger.error(error, "Failed to delete file from database", {
              path: file.path,
            });
            result.errors.push(
              `Failed to delete file ${file.path}: ${error.message}`,
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
          { path: file.path },
        );
        result.errors.push(`Failed to delete ${file.path}: ${message}`);
      }
    }
  }

  /**
   * Process text files with parallel upload (concurrency limit: 5)
   */
  private async processTextFiles(
    textFiles: GitFileChange[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    const concurrency = 5;
    const chunks = this.chunkArray(textFiles, concurrency);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (file) => {
          try {
            const fullPath = path.join(this.workDir, file.path);
            const contents = await fs.readFile(fullPath, "utf8");

            // First, try to find existing file
            const { data: existingFile } = await this.supabaseClient
              .from("prototype_files")
              .select("id")
              .match({ prototype_id: prototypeId, name: file.path })
              .single();

            // Retry logic for upsert/update
            let retries = 3;
            while (retries > 0) {
              let error;

              if (existingFile) {
                // Update existing file
                const updateResult = await this.supabaseClient
                  .from("prototype_files")
                  .update({
                    contents: contents,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existingFile.id);
                error = updateResult.error;
              } else {
                // Insert new file
                const insertResult = await this.supabaseClient
                  .from("prototype_files")
                  .insert({
                    prototype_id: prototypeId,
                    name: file.path,
                    contents: contents,
                    updated_at: new Date().toISOString(),
                  });
                error = insertResult.error;
              }

              if (!error) {
                result.filesUpdated++;
                break;
              }

              retries--;
              if (retries === 0) {
                this.logger.error(error, "Failed to upsert file to database", {
                  path: file.path,
                });
                result.errors.push(
                  `Failed to upsert file ${file.path}: ${error.message}`,
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
              { path: file.path },
            );
            result.errors.push(`Failed to process ${file.path}: ${message}`);
          }
        }),
      );
    }
  }

  /**
   * Process binary files with parallel upload (concurrency limit: 3)
   */
  private async processBinaryFiles(
    binaryFiles: GitFileChange[],
    prototypeId: string,
    result: SyncResult,
  ): Promise<void> {
    const concurrency = 3; // Lower for binary files (larger)
    const chunks = this.chunkArray(binaryFiles, concurrency);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (file) => {
          try {
            const fullPath = path.join(this.workDir, file.path);
            const stats = await fs.stat(fullPath);

            // Skip very large files (>10MB)
            if (stats.size > 10 * 1024 * 1024) {
              this.logger.warn("Skipping large binary file", {
                path: file.path,
                size: stats.size,
              });
              result.errors.push(
                `Skipped ${file.path}: file too large (${Math.round(stats.size / 1024 / 1024)}MB)`,
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
                .upload(`${prototypeId}/${file.path}`, fileBuffer, {
                  upsert: true,
                  contentType: this.getContentType(file.path),
                });

              if (!uploadError) {
                uploadSuccess = true;
              } else {
                retries--;
                if (retries === 0) {
                  this.logger.error(
                    uploadError,
                    "Failed to upload asset to storage",
                    { path: file.path },
                  );
                  result.errors.push(
                    `Failed to upload asset ${file.path}: ${uploadError.message}`,
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
            const storageUrl = `${prototypeId}/${file.path}`;

            // First, try to find existing asset
            const { data: existingAsset } = await this.supabaseClient
              .from("prototype_assets")
              .select("id")
              .match({ prototype_id: prototypeId, name: file.path })
              .single();

            let dbError;
            if (existingAsset) {
              // Update existing asset
              const updateResult = await this.supabaseClient
                .from("prototype_assets")
                .update({
                  storage_url: storageUrl,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingAsset.id);
              dbError = updateResult.error;
            } else {
              // Insert new asset
              const insertResult = await this.supabaseClient
                .from("prototype_assets")
                .insert({
                  prototype_id: prototypeId,
                  name: file.path,
                  storage_url: storageUrl,
                  updated_at: new Date().toISOString(),
                });
              dbError = insertResult.error;
            }

            if (dbError) {
              this.logger.error(
                dbError,
                "Failed to upsert asset metadata to database",
                { path: file.path },
              );
              result.errors.push(
                `Failed to upsert asset metadata ${file.path}: ${dbError.message}`,
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
              { path: file.path },
            );
            result.errors.push(`Failed to process ${file.path}: ${message}`);
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
   * Check if file should be ignored
   */
  private shouldIgnoreFile(filePath: string): boolean {
    const ignoredPaths = [
      "node_modules/",
      "dist/",
      ".expo/",
      ".git/",
      ".next/",
      "build/",
    ];

    return ignoredPaths.some((ignored) => filePath.startsWith(ignored));
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
