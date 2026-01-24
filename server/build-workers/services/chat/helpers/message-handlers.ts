/**
 * Utility functions for handling and formatting chat messages
 */

import { processImage } from "./image-processing.js";
import { baseLogger } from "../../../worker.js";
import { SupabaseClientService } from "../../SupabaseClientService.js";

type ToolInput = Record<string, unknown>;

export function sanitizeFilePath(path: string): string {
  if (!path) return path;
  const prefix = "/tmp/materialize-dev-server/";
  return path.replace(new RegExp(prefix, "g"), "");
}

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
    return toolInput.description as string;
  }

  if (normalized === "task" && toolInput?.description) {
    return toolInput.description as string;
  }

  if (normalized.includes("read") && toolInput?.file_path) {
    const fileName = sanitizeFilePath(toolInput.file_path as string)
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
    const pathName = sanitizeFilePath(toolInput.path as string)
      .split("/")
      .pop() || toolInput.path;
    return `Listing ${pathName}`;
  }
  if (normalized.includes("write") && toolInput?.file_path) {
    const fileName = sanitizeFilePath(toolInput.file_path as string)
      .split("/")
      .pop() || toolInput.file_path;
    return `Writing ${fileName}`;
  }
  if (normalized.includes("edit") && toolInput?.file_path) {
    const fileName = sanitizeFilePath(toolInput.file_path as string)
      .split("/")
      .pop() || toolInput.file_path;
    return `Editing ${fileName}`;
  }
  if (normalized.includes("delete") && toolInput?.file_path) {
    const fileName = sanitizeFilePath(toolInput.file_path as string)
      .split("/")
      .pop() || toolInput.file_path;
    return `Deleting ${fileName}`;
  }

  if (normalized.includes("read")) return "Reading files";
  if (normalized.includes("glob")) return "Searching files";
  if (normalized.includes("grep")) return "Searching code";
  if (normalized.includes("list")) return "Listing files";
  if (normalized.includes("write")) return "Writing";
  if (normalized.includes("edit")) return "Editing";
  if (normalized.includes("bash")) return "Running command";
  if (normalized.includes("delete")) return "Deleting";
  if (normalized.includes("RestartDevServer")) {
    return "Restarting development server";
  }
  return toolName;
}

export async function persistChatMessage(
  supabaseClientService: SupabaseClientService,
  chatSessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
  eventType?: string | null,
  eventData?: unknown,
  creditsUsed?: number | null,
  costFunction?: string | null,
  provider?: string | null,
  model?: string | null,
): Promise<void> {
  if (!chatSessionId) {
    baseLogger.warn("Cannot persist message - no chat session ID", {
      role,
      messageType,
      eventType,
    });
    return;
  }

  const supabase = supabaseClientService.getClient();

  try {
    // const {
    //   data: { user },
    //   error: authError,
    // } = await supabase.auth.getUser();

    // baseLogger.consoleLogDevOnly("debug", "Attempting to persist message", {
    //   chatSessionId,
    //   role,
    //   messageType,
    //   eventType,
    //   hasEventData: !!eventData,
    //   eventDataType: eventData ? typeof eventData : null,
    //   creditsUsed,
    //   costFunction,
    //   provider,
    //   model,
    //   isAuthenticated: !!user,
    //   userId: user?.id,
    //   authError: authError?.message,
    // });

    const mergedEventData = {
      ...(eventData ?? {}),
      provider: provider ?? null,
      model: model ?? null,
    };

    const { error } = await supabase.from("prototype_chat_messages").insert({
      chat_session_id: chatSessionId,
      role,
      content,
      message_type: messageType,
      event_type: eventType || null,
      event_data: mergedEventData ? JSON.stringify(mergedEventData) : null,
      credits_used: creditsUsed ?? null,
      cost_function: costFunction ?? null,
    });

    if (error) {
      baseLogger.error(error, "Failed to persist message", {
        chatSessionId,
        role,
        messageType,
        eventType,
      });
    } else {
      // baseLogger.consoleLogDevOnly("info", "Persisted chat message", {
      //   chatSessionId,
      //   role,
      //   messageType,
      //   eventType,
      // });
    }
  } catch (error) {
    baseLogger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to persist message",
      {
        chatSessionId,
        role,
        messageType,
        eventType,
      },
    );
  }
}

export async function uploadChatImages(
  supabaseClientService: SupabaseClientService,
  prototypeId: string,
  chatSessionId: string,
  images: Array<{ base64: string; mediaType: string }>,
): Promise<
  Array<{ storage_path: string; media_type: string; file_size: number }>
> {
  try {
    baseLogger.consoleLogDevOnly("info", "Uploading chat images to storage", {
      prototypeId,
      chatSessionId,
      imageCount: images.length,
    });

    const uploadedImageMetadata: Array<{
      storage_path: string;
      media_type: string;
      file_size: number;
    }> = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        const processed = await processImage(image.base64, image.mediaType);

        const timestamp = Date.now();
        const uuid = Math.random().toString(36).substring(2, 15);
        const filename = `${timestamp}_${uuid}.${processed.extension}`;
        const storagePath = `${prototypeId}/chat/${chatSessionId}/${filename}`;

        const { error: uploadError } = await supabaseClientService
          .getClient()
          .storage.from("chat-images")
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

        baseLogger.consoleLogDevOnly("debug", "Uploaded chat image", {
          storagePath,
          mediaType: processed.mediaType,
          fileSize: processed.buffer.length,
        });
      } catch (error) {
        baseLogger.error(
          error instanceof Error ? error : new Error(String(error)),
          `Failed to upload image ${i + 1}/${images.length}`,
          { prototypeId, chatSessionId },
        );
      }
    }

    baseLogger.consoleLogDevOnly("info", "Chat images upload completed", {
      prototypeId,
      chatSessionId,
      successCount: uploadedImageMetadata.length,
      totalCount: images.length,
    });

    return uploadedImageMetadata;
  } catch (error) {
    baseLogger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to upload chat images",
      { prototypeId, chatSessionId },
    );
    return [];
  }
}
