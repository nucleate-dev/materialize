/**
 * Utility functions for handling and formatting chat messages
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { Database } from "../../types/supabase.js";
import { processImage } from "./image-processing.js";

type ToolInput = Record<string, unknown>;

/**
 * Helper function to sanitize file paths by removing the dev server prefix
 */
export function sanitizeFilePath(path: string): string {
  if (!path) return path;
  const prefix = "/tmp/materialize-dev-server/";
  // Replace all occurrences of the prefix, not just at the start
  return path.replace(new RegExp(prefix, "g"), "");
}

/**
 * Helper function to get friendly tool display name
 * Mirrors the frontend logic in ClaudeCodePanel.tsx
 */
export function getToolDisplayName(
  toolName: string,
  toolInput?: ToolInput,
): string {
  const normalized = toolName.toLowerCase();

  if (normalized.includes("npm_install")) {
    return (
      "Installing new packages: " +
      ((toolInput?.packages as []) ?? []).map((p: string) => `${p} `)
    );
  }
  if (normalized.includes("git")) {
    return "Saved checkpoint";
  }
  if (normalized.includes("checkterminal")) {
    return "Checking for errors";
  }
  if (normalized.includes("bash") && toolInput?.description) {
    // For Bash commands, use the description if available
    return toolInput.description as string;
  }

  // For Task tool, use the description if available
  if (normalized === "task" && toolInput?.description) {
    return toolInput.description as string;
  }

  // More descriptive tool names with parameters
  if (normalized.includes("read") && toolInput?.file_path) {
    const fileName =
      sanitizeFilePath(toolInput.file_path as string)
        .split("/")
        .pop() || toolInput.file_path;
    return `Reading ${fileName}`;
  }
  if (normalized.includes("glob") && toolInput?.pattern) {
    return `Searching files matching ${toolInput.pattern}`;
  }
  if (normalized.includes("grep") && toolInput?.pattern) {
    return `Searching code for "${toolInput.pattern}"`;
  }
  if (normalized.includes("list") && toolInput?.path) {
    const pathName =
      sanitizeFilePath(toolInput.path as string)
        .split("/")
        .pop() || toolInput.path;
    return `Listing ${pathName}`;
  }
  if (normalized.includes("write") && toolInput?.file_path) {
    const fileName =
      sanitizeFilePath(toolInput.file_path as string)
        .split("/")
        .pop() || toolInput.file_path;
    return `Writing ${fileName}`;
  }
  if (normalized.includes("edit") && toolInput?.file_path) {
    const fileName =
      sanitizeFilePath(toolInput.file_path as string)
        .split("/")
        .pop() || toolInput.file_path;
    return `Editing ${fileName}`;
  }
  if (normalized.includes("delete") && toolInput?.file_path) {
    const fileName =
      sanitizeFilePath(toolInput.file_path as string)
        .split("/")
        .pop() || toolInput.file_path;
    return `Deleting ${fileName}`;
  }

  // Default friendly names
  if (normalized.includes("read")) return "Reading files";
  if (normalized.includes("glob")) return "Searching files";
  if (normalized.includes("grep")) return "Searching code";
  if (normalized.includes("list")) return "Listing files";
  if (normalized.includes("write")) return "Writing";
  if (normalized.includes("edit")) return "Editing";
  if (normalized.includes("bash")) return "Running command";
  if (normalized.includes("delete")) return "Deleting";
  if (normalized.includes("RestartDevServer"))
    return "Restarting development server";
  return toolName;
}

/**
 * Service for persisting chat messages and related media to Supabase
 */
export class MessagePersistenceService {
  private supabaseClient: SupabaseClient<Database>;
  private readonly logger: SystemLogger;

  constructor(
    supabaseClient: SupabaseClient<Database>,
    logger: SystemLogger,
  ) {
    this.supabaseClient = supabaseClient;
    this.logger = logger.child({ service: "MessagePersistenceService" });
  }

  /**
   * Updates the Supabase client reference (called when token is refreshed)
   */
  public setSupabaseClient(client: SupabaseClient<Database>): void {
    this.supabaseClient = client;
  }

  /**
   * Persists a message to the prototype_chat_messages table.
   * Called for user messages, assistant messages, tool events, and system events.
   */
  async persistMessage(
    chatSessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
    eventType?: string | null,
    eventData?: unknown,
    creditsUsed?: number | null,
    costFunction?: string | null,
  ): Promise<void> {
    if (!chatSessionId) {
      this.logger.warn("Cannot persist message - no chat session ID", {
        role,
        messageType,
        eventType,
      });
      return;
    }

    try {
      // Check if client is authenticated
      const { data: { user }, error: authError } = await this.supabaseClient.auth.getUser();

      this.logger.consoleLogDevOnly("debug", "Attempting to persist message", {
        chatSessionId,
        role,
        messageType,
        eventType,
        hasEventData: !!eventData,
        eventDataType: eventData ? typeof eventData : null,
        creditsUsed,
        costFunction,
        isAuthenticated: !!user,
        userId: user?.id,
        authError: authError?.message,
      });

      const { error } = await this.supabaseClient
        .from("prototype_chat_messages")
        .insert({
          chat_session_id: chatSessionId,
          role,
          content,
          message_type: messageType,
          event_type: eventType || null,
          event_data: eventData ? JSON.stringify(eventData) : null,
          credits_used: creditsUsed ?? null,
          cost_function: costFunction ?? null,
        });

      if (error) {
        this.logger.error(error, "Failed to persist message", {
          chatSessionId,
          role,
          messageType,
          eventType,
          hasEventData: !!eventData,
          eventDataSample: eventData ? JSON.stringify(eventData).substring(0, 200) : null,
          isAuthenticated: !!user,
          userId: user?.id,
        });
      } else {
        this.logger.consoleLogDevOnly("debug", "Persisted message", {
          chatSessionId,
          role,
          messageType,
          eventType,
          contentLength: content.length,
          creditsUsed,
          costFunction,
        });
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error in persistMessage",
        {
          chatSessionId,
          role,
          messageType,
        },
      );
    }
  }

  /**
   * Uploads chat images to Supabase Storage and returns the image metadata
   * @param prototypeId - The prototype ID
   * @param chatSessionId - The chat session ID
   * @param images - Array of images with base64 data and media type
   * @returns Array of uploaded image metadata
   */
  async uploadChatImages(
    prototypeId: string,
    chatSessionId: string,
    images: Array<{ base64: string; mediaType: string }>,
  ): Promise<Array<{ storage_path: string; media_type: string; file_size: number }>> {
    try {
      this.logger.consoleLogDevOnly(
        "info",
        "Uploading chat images to storage",
        {
          prototypeId,
          chatSessionId,
          imageCount: images.length,
        },
      );

      const uploadedImageMetadata: Array<{
        storage_path: string;
        media_type: string;
        file_size: number;
      }> = [];

      // Process and upload each image
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          // Resize and optimize image
          const processed = await processImage(image.base64, image.mediaType);

          // Generate unique filename: timestamp_uuid.ext
          const timestamp = Date.now();
          const uuid = Math.random().toString(36).substring(2, 15);
          const filename = `${timestamp}_${uuid}.${processed.extension}`;
          const storagePath = `${prototypeId}/chat/${chatSessionId}/${filename}`;

          // Upload to Supabase Storage
          const { error: uploadError } = await this.supabaseClient.storage
            .from("prototype-assets")
            .upload(storagePath, processed.buffer, {
              contentType: processed.mediaType,
              upsert: false,
            });

          if (uploadError) {
            throw uploadError;
          }

          uploadedImageMetadata.push({
            storage_path: storagePath,
            media_type: processed.mediaType,
            file_size: processed.buffer.length,
          });

          this.logger.consoleLogDevOnly("debug", "Uploaded chat image", {
            storagePath,
            mediaType: processed.mediaType,
            fileSize: processed.buffer.length,
          });
        } catch (error) {
          this.logger.error(
            error instanceof Error ? error : new Error(String(error)),
            `Failed to upload image ${i + 1}/${images.length}`,
            { prototypeId, chatSessionId },
          );
          // Continue with other images even if one fails
        }
      }

      this.logger.consoleLogDevOnly("info", "Chat images upload completed", {
        prototypeId,
        chatSessionId,
        successCount: uploadedImageMetadata.length,
        totalCount: images.length,
      });

      return uploadedImageMetadata;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to upload chat images",
        { prototypeId, chatSessionId },
      );
      // Return empty array on error - we don't want to fail the entire query if image upload fails
      return [];
    }
  }
}
