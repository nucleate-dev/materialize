import type { ImagePart, TextPart, UserContent } from "ai";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { ChatContentBlock } from "../../../types/ChatTypes.js";

export function buildDesignAgentUserContent(
  textFallback: string | undefined,
  contentBlocks: ChatContentBlock[] | undefined,
  logger: SystemLogger,
  prototypeId?: string,
): UserContent | null {
  if (contentBlocks && contentBlocks.length > 0) {
    const parts: Array<TextPart | ImagePart> = [];

    for (const block of contentBlocks) {
      if (block.type === "text") {
        const text = block.text ?? "";
        if (text.trim().length > 0) {
          parts.push({ type: "text", text });
        }
        continue;
      }

      if (block.type === "image") {
        const imagePart = toDesignAgentImagePart(
          block.source,
          logger,
          prototypeId,
        );
        if (imagePart) {
          parts.push(imagePart);
        }
      }
    }

    if (parts.length > 0) {
      return parts;
    }
  }

  if (textFallback && textFallback.trim().length > 0) {
    return textFallback;
  }

  return null;
}

function toDesignAgentImagePart(
  source: ChatContentBlock["source"] | undefined,
  logger: SystemLogger,
  prototypeId?: string,
): ImagePart | null {
  if (!source) {
    return null;
  }

  if (source.type === "url" && source.url) {
    try {
      return {
        type: "image",
        image: new URL(source.url),
      };
    } catch (error) {
      logger.warn("Invalid image URL for design agent; skipping image", {
        prototypeId,
        url: source.url,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  if (source.type === "base64" && source.data) {
    return {
      type: "image",
      image: source.data,
      mediaType: source.media_type,
    };
  }

  logger.warn("Unsupported image source for design agent; skipping image", {
    prototypeId,
    sourceType: source.type,
  });
  return null;
}
