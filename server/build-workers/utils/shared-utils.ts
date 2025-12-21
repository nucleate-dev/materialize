import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { TerminalSession } from "../services/terminals/TerminalService.js";
import { Database } from "../types/supabase.js";

// Claude session persistence constants
export const CLAUDE_PROJECTS_DIR = path.join(
  os.homedir(),
  ".claude",
  "projects",
  "-tmp-materialize-dev-server",
);
export const SESSION_RECENCY_LOOKBACK_DAYS = 30;

export class InvalidProjectPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectPathError";
  }
}

export interface PrototypeFileInput {
  name: string;
  contents: string;
}

export interface PrototypeAssetInputWithContent {
  name: string;
  contents: string;
}

export async function installDependencies(
  projectDir: string,
  log2: SystemLogger,
  terminalSession: TerminalSession,
): Promise<void> {
  log2.consoleLogDevOnly(
    "info",
    "Installing dependencies using terminal session",
  );

  return new Promise((resolve, reject) => {
    let stdout = "";
    let installComplete = false;

    const timeout = setTimeout(() => {
      if (!installComplete) {
        installComplete = true;
        const error = "npm install timed out after 5 minutes";
        log2.error(new Error(error), "Install dependencies timeout");
        reject(new Error(error));
      }
    }, 300000); // 5 minute timeout

    const processOutput = (chunk: string): void => {
      const output = chunk.toString();
      stdout += output;

      // Check for successful completion
      if (
        output.includes("added") &&
        output.includes("packages") &&
        !installComplete
      ) {
        installComplete = true;
        clearTimeout(timeout);
        log2.consoleLogDevOnly("info", "Dependencies installed successfully");
        cleanup();
        resolve();
      }

      // Check for errors
      if (
        (output.includes("npm ERR!") || output.includes("ERESOLVE")) &&
        !installComplete
      ) {
        installComplete = true;
        clearTimeout(timeout);
        const error = `npm install failed: ${output}`;
        log2.error(new Error(error), "Install dependencies failed", {
          stdout,
        });
        cleanup();
        reject(new Error(error));
      }
    };

    // Set up listener on the PTY output
    const disposable = terminalSession.pty.onData(processOutput);

    const cleanup = (): void => {
      disposable.dispose();
    };

    // Build the command to run in the terminal
    const command = `cd ${projectDir} && NODE_OPTIONS="--max-old-space-size=2048" npm install --prefer-offline --no-audit --no-fund\n`;

    log2.consoleLogDevOnly("info", "Sending npm install command to terminal", {
      command: command.trim(),
      projectDir,
    });

    // Send the command to the terminal
    terminalSession.pty.write(command);

    // Wait a bit for command to execute and check for immediate errors
    setTimeout(() => {
      if (!installComplete) {
        // Give it more time, npm install can take a while
        log2.debug("npm install in progress...");
      }
    }, 5000);
  });
}

export async function writeProjectFiles(
  files: PrototypeFileInput[],
  assets: PrototypeAssetInputWithContent[],
  projectDir: string,
): Promise<void> {
  // Handle text files
  for (const file of files) {
    const filePath = resolvePathWithinProject(projectDir, file.name);
    const fileDir = path.dirname(filePath);

    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, file.contents, "utf8");
  }

  // Handle binary assets
  for (const asset of assets) {
    const filePath = resolvePathWithinProject(projectDir, asset.name);
    const fileDir = path.dirname(filePath);

    await fs.mkdir(fileDir, { recursive: true });
    const binaryContent = Buffer.from(asset.contents, "base64");
    await fs.writeFile(filePath, binaryContent);
  }
}

export function resolvePathWithinProject(
  projectDir: string,
  relativePath: string,
): string {
  if (!relativePath) {
    throw new InvalidProjectPathError(
      "Path must not be empty when writing project files",
    );
  }

  if (relativePath.includes("\0")) {
    throw new InvalidProjectPathError("Path contains null bytes");
  }

  const normalizedProjectDir = path.resolve(projectDir);
  const resolvedTargetPath = path.resolve(normalizedProjectDir, relativePath);
  const relative = path.relative(normalizedProjectDir, resolvedTargetPath);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvalidProjectPathError(
      `Path ${relativePath} resolves outside of the project directory`,
    );
  }

  return resolvedTargetPath;
}

/**
 * Uploads all Claude session .jsonl files from the local directory to Supabase Storage.
 * Called before building/deploying to preserve all session state.
 *
 * @param prototypeId - The prototype ID
 * @param supabaseClient - Supabase client instance
 * @param logger - Logger instance
 * @returns Summary of upload results
 */
export async function uploadAllClaudeSessionsToSupabase(
  prototypeId: string,
  supabaseClient: SupabaseClient<Database>,
  logger: SystemLogger,
): Promise<{
  success: boolean;
  uploadedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let uploadedCount = 0;

  try {
    // Ensure CLAUDE_PROJECTS_DIR exists
    try {
      await fs.access(CLAUDE_PROJECTS_DIR);
    } catch {
      logger.error(
        new Error(
          "Claude projects directory does not exist, skipping session upload",
        ),
        "Claude projects directory does not exist, skipping session upload",
        {
          prototypeId,
          path: CLAUDE_PROJECTS_DIR,
        },
      );
      return { success: true, uploadedCount: 0, errors: [] };
    }

    // Read all files in the directory
    const files = await fs.readdir(CLAUDE_PROJECTS_DIR);
    const sessionFiles = files.filter((file) => file.endsWith(".jsonl"));

    if (sessionFiles.length === 0) {
      logger.warn("No Claude session files found to upload", { prototypeId });
      return { success: true, uploadedCount: 0, errors: [] };
    }

    // Debug: Check current user auth
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      const errorMsg = `Authentication failed - cannot upload session files: ${userError?.message || "No user"}`;
      logger.error(
        userError || new Error("No authenticated user"),
        "Failed to authenticate for session upload",
        {
          prototypeId,
          hasUser: !!user,
          userId: user?.id,
        },
      );
      return { success: false, uploadedCount: 0, errors: [errorMsg] };
    }

    // Debug: Verify user owns the prototype
    const { data: prototype, error: prototypeError } = await supabaseClient
      .from("prototypes")
      .select("id, owner_id")
      .eq("id", prototypeId)
      .single();

    if (prototypeError || !prototype) {
      const errorMsg = `Failed to verify prototype ownership: ${prototypeError?.message || "Prototype not found"}`;
      logger.error(
        prototypeError || new Error("Prototype not found"),
        "Cannot verify prototype ownership for session upload",
        {
          prototypeId,
          userId: user.id,
        },
      );
      return { success: false, uploadedCount: 0, errors: [errorMsg] };
    }

    if (prototype.owner_id !== user.id) {
      const errorMsg = `User ${user.id} does not own prototype ${prototypeId} (owner: ${prototype.owner_id})`;
      logger.error(new Error(errorMsg), "User does not own prototype", {
        prototypeId,
        userId: user.id,
        ownerId: prototype.owner_id,
      });
      return { success: false, uploadedCount: 0, errors: [errorMsg] };
    }

    logger.consoleLogDevOnly(
      "info",
      "Uploading Claude session files to Supabase",
      {
        prototypeId,
        sessionCount: sessionFiles.length,
        userId: user.id,
        ownerId: prototype.owner_id,
        ownershipVerified: true,
      },
    );

    // Upload all session files in parallel
    const uploadPromises = sessionFiles.map(async (filename) => {
      try {
        const sessionFilePath = path.join(CLAUDE_PROJECTS_DIR, filename);
        const fileBuffer = await fs.readFile(sessionFilePath);

        // Storage path: prototype-id/session-id.jsonl
        const storagePath = `${prototypeId}/${filename}`;

        logger.consoleLogDevOnly("info", "Attempting to upload session file", {
          filename,
          storagePath,
          prototypeId,
          userId: user.id,
          fileSize: fileBuffer.byteLength,
        });

        const { error } = await supabaseClient.storage
          .from("claude-code-chat-sessions")
          .upload(storagePath, fileBuffer, {
            contentType: "application/x-jsonlines",
            upsert: true, // Overwrite if exists
          });

        if (error) {
          const errorMsg = `Failed to upload ${filename}: ${error.message}`;
          errors.push(errorMsg);
          logger.error(error, "Failed to upload session file", {
            filename,
            prototypeId,
            storagePath,
            userId: user.id,
            errorDetails: error,
          });
          return { success: false, filename };
        } else {
          logger.debug("Uploaded session file to Storage", {
            filename,
            size: fileBuffer.byteLength,
          });
          return { success: true, filename };
        }
      } catch (error) {
        const errorMsg = `Error uploading ${filename}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Error uploading session file",
          { filename },
        );
        return { success: false, filename };
      }
    });

    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);
    uploadedCount = results.filter((r) => r.success).length;

    logger.consoleLogDevOnly("info", "Claude session upload completed", {
      prototypeId,
      uploadedCount,
      totalFiles: sessionFiles.length,
      errorCount: errors.length,
    });

    return {
      success: errors.length === 0,
      uploadedCount,
      errors,
    };
  } catch (error) {
    const errorMsg = `Error scanning Claude sessions directory: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Error scanning Claude sessions directory",
      { prototypeId },
    );
    return { success: false, uploadedCount, errors };
  }
}

/**
 * Clears all Claude session .jsonl files from the local directory.
 * Used when resetting a sandbox to a clean state.
 *
 * @param logger - Logger instance
 * @returns Summary of deletion results
 */
export async function clearAllClaudeSessions(
  logger: SystemLogger,
): Promise<{
  success: boolean;
  deletedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let deletedCount = 0;

  try {
    // Check if CLAUDE_PROJECTS_DIR exists
    try {
      await fs.access(CLAUDE_PROJECTS_DIR);
    } catch {
      logger.consoleLogDevOnly(
        "info",
        "Claude projects directory does not exist, nothing to clear",
        {
          path: CLAUDE_PROJECTS_DIR,
        },
      );
      return { success: true, deletedCount: 0, errors: [] };
    }

    // Read all files in the directory
    const files = await fs.readdir(CLAUDE_PROJECTS_DIR);
    const sessionFiles = files.filter((file) => file.endsWith(".jsonl"));

    if (sessionFiles.length === 0) {
      logger.consoleLogDevOnly(
        "info",
        "No Claude session files found to clear",
      );
      return { success: true, deletedCount: 0, errors: [] };
    }

    logger.consoleLogDevOnly("info", "Clearing Claude session files", {
      sessionCount: sessionFiles.length,
      directory: CLAUDE_PROJECTS_DIR,
    });

    // Delete all session files
    for (const filename of sessionFiles) {
      try {
        const sessionFilePath = path.join(CLAUDE_PROJECTS_DIR, filename);
        await fs.unlink(sessionFilePath);
        deletedCount++;
        logger.debug("Deleted Claude session file", { filename });
      } catch (error) {
        const errorMsg = `Failed to delete ${filename}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to delete session file",
          { filename },
        );
      }
    }

    logger.consoleLogDevOnly("info", "Claude session cleanup completed", {
      deletedCount,
      totalFiles: sessionFiles.length,
      errorCount: errors.length,
    });

    return {
      success: errors.length === 0,
      deletedCount,
      errors,
    };
  } catch (error) {
    const errorMsg = `Error clearing Claude sessions directory: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Error clearing Claude sessions directory",
      { directory: CLAUDE_PROJECTS_DIR },
    );
    return { success: false, deletedCount, errors };
  }
}

/**
 * Restores Claude session .jsonl files from Supabase Storage to the local directory.
 * Called during worker allocation to restore session state.
 *
 * @param prototypeId - The prototype ID
 * @param supabaseClient - Supabase client instance
 * @param logger - Logger instance
 * @returns List of restored session IDs
 */
export async function restoreClaudeSessionsFromSupabase(
  prototypeId: string,
  supabaseClient: SupabaseClient<Database>,
  logger: SystemLogger,
): Promise<{
  success: boolean;
  restoredSessionIds: string[];
  errors: string[];
}> {
  const errors: string[] = [];
  const restoredSessionIds: string[] = [];

  try {
    // Ensure CLAUDE_PROJECTS_DIR exists
    await fs.mkdir(CLAUDE_PROJECTS_DIR, { recursive: true });

    // List all .jsonl files in the prototype's storage folder
    const { data: fileList, error: listError } = await supabaseClient.storage
      .from("claude-code-chat-sessions")
      .list(prototypeId, {
        sortBy: { column: "created_at", order: "desc" },
      });

    if (listError) {
      const errorMsg = `Failed to list session files: ${listError.message}`;
      errors.push(errorMsg);
      logger.error(listError, "Failed to list session files from Storage", {
        prototypeId,
      });
      return { success: false, restoredSessionIds: [], errors };
    }

    if (!fileList || fileList.length === 0) {
      logger.consoleLogDevOnly(
        "info",
        "No Claude session files found to restore",
        { prototypeId },
      );
      return { success: true, restoredSessionIds: [], errors: [] };
    }

    const sessionFiles = fileList.filter((file) =>
      file.name.endsWith(".jsonl"),
    );

    if (sessionFiles.length === 0) {
      logger.consoleLogDevOnly(
        "info",
        "No .jsonl session files found to restore",
        { prototypeId },
      );
      return { success: true, restoredSessionIds: [], errors: [] };
    }

    // Download and restore all session files in parallel
    const restorePromises = sessionFiles.map(async (file) => {
      try {
        const storagePath = `${prototypeId}/${file.name}`;
        const { data: fileData, error: downloadError } =
          await supabaseClient.storage
            .from("claude-code-chat-sessions")
            .download(storagePath);

        if (downloadError || !fileData) {
          const errorMsg = `Failed to download ${file.name}: ${downloadError?.message ?? "No data"}`;
          errors.push(errorMsg);
          logger.error(
            downloadError,
            "Failed to download session file from Storage",
            { filename: file.name, prototypeId },
          );
          return { success: false, sessionId: null };
        }

        // Write to local filesystem
        const localFilePath = path.join(CLAUDE_PROJECTS_DIR, file.name);
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.writeFile(localFilePath, buffer);

        // Extract session ID from filename (remove .jsonl extension)
        const sessionId = file.name.replace(/\.jsonl$/, "");

        return { success: true, sessionId };
      } catch (error) {
        const errorMsg = `Error restoring ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Error restoring session file",
          { filename: file.name },
        );
        return { success: false, sessionId: null };
      }
    });

    // Wait for all downloads to complete
    const results = await Promise.all(restorePromises);
    restoredSessionIds.push(
      ...results
        .filter((r) => r.success && r.sessionId)
        .map((r) => r.sessionId!),
    );

    if (restoredSessionIds.length > 0) {
      logger.debug("Successfully restored Claude sessions from Supabase", {
        prototypeId,
        restoredCount: restoredSessionIds.length,
        restoredSessionIds,
        targetDirectory: CLAUDE_PROJECTS_DIR,
      });
    }

    return {
      success: errors.length === 0,
      restoredSessionIds,
      errors,
    };
  } catch (error) {
    const errorMsg = `Error restoring Claude sessions: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Error restoring Claude sessions",
      { prototypeId },
    );
    return { success: false, restoredSessionIds: [], errors };
  }
}
