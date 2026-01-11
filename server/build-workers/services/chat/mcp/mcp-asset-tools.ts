import {
  createSdkMcpServer,
  McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { z } from "zod";
import { baseLogger, WORK_DIR } from "../../../worker.js";

export type BinaryFileWriter = (
  filePath: string,
  contents: Buffer,
) => Promise<{ success: boolean; error?: string; bytesWritten?: number }>;

type NanobananaResponse = {
  cost_usd?: number;
  usage?: { cost_usd?: number; total_cost_usd?: number };
  usageMetadata?: { totalBillableCost?: number };
  data?: Array<{ b64_json?: string; base64?: string; url?: string }>;
  images?: Array<{ b64_json?: string; base64?: string; url?: string }>;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
        inline_data?: { data?: string; mime_type?: string };
      }>;
    };
  }>;
  generatedImages?: Array<{ bytesBase64Encoded?: string }>;
  image_base64?: string;
  image_url?: string;
  url?: string;
};

function extractCostUsd(payload: NanobananaResponse): number | undefined {
  const direct = payload.cost_usd;
  if (typeof direct === "number") {
    return direct;
  }
  const usageCost = payload.usage?.cost_usd ?? payload.usage?.total_cost_usd;
  if (typeof usageCost === "number") {
    return usageCost;
  }
  const billableCost = payload.usageMetadata?.totalBillableCost;
  if (typeof billableCost === "number") {
    return billableCost;
  }
  return undefined;
}

function extractImageBase64(payload: NanobananaResponse): string | undefined {
  if (typeof payload.image_base64 === "string") {
    return payload.image_base64;
  }
  const candidates = [...(payload.data ?? []), ...(payload.images ?? [])];
  for (const candidate of candidates) {
    if (typeof candidate?.b64_json === "string") {
      return candidate.b64_json;
    }
    if (typeof candidate?.base64 === "string") {
      return candidate.base64;
    }
  }

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inlineData = part.inlineData ?? part.inline_data;
      if (typeof inlineData?.data === "string") {
        return inlineData.data;
      }
    }
  }

  for (const image of payload.generatedImages ?? []) {
    if (typeof image.bytesBase64Encoded === "string") {
      return image.bytesBase64Encoded;
    }
  }
  return undefined;
}

function extractImageUrl(payload: NanobananaResponse): string | undefined {
  if (typeof payload.image_url === "string") {
    return payload.image_url;
  }
  if (typeof payload.url === "string") {
    return payload.url;
  }
  const candidates = [...(payload.data ?? []), ...(payload.images ?? [])];
  for (const candidate of candidates) {
    if (typeof candidate?.url === "string") {
      return candidate.url;
    }
  }
  return undefined;
}

async function fetchImageBuffer(
  apiUrl: string,
  apiKey: string,
  prompt: string,
  width?: number,
  height?: number,
  format?: string,
): Promise<{ buffer: Buffer; costUsd?: number }> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "nanobanana",
      prompt,
      width,
      height,
      format,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Nanobanana API error (${response.status}): ${responseText}`,
    );
  }

  let payload: NanobananaResponse;
  try {
    payload = JSON.parse(responseText) as NanobananaResponse;
  } catch (error) {
    throw new Error(
      `Nanobanana API returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const costUsd = extractCostUsd(payload);
  const imageBase64 = extractImageBase64(payload);
  if (imageBase64) {
    return { buffer: Buffer.from(imageBase64, "base64"), costUsd };
  }

  const imageUrl = extractImageUrl(payload);
  if (imageUrl) {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch generated image: ${imageResponse.status}`,
      );
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), costUsd };
  }

  throw new Error("Nanobanana API response did not include image data.");
}

export function createAssetToolsMcpServer(
  writeBinaryFile: BinaryFileWriter,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "assets",
    version: "1.0.0",
    tools: [
      tool(
        "GenerateAsset",
        "Generate an image asset using the Google Nanobanana API and save it to the provided file path. The file path must be inside the project (prefer client/assets).",
        {
          prompt: z
            .string()
            .min(1)
            .describe("The prompt describing the image to generate."),
          file_path: z
            .string()
            .min(1)
            .describe(
              `Where to save the asset. Use an absolute path or a path relative to ${WORK_DIR}. Prefer client/assets.`,
            ),
          width: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Optional width in pixels."),
          height: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Optional height in pixels."),
          format: z
            .string()
            .optional()
            .describe("Optional output format (e.g., png, webp, jpg)."),
        },
        async ({
          prompt,
          file_path,
          width,
          height,
          format,
        }: {
          prompt: string;
          file_path: string;
          width?: number;
          height?: number;
          format?: string;
        }): Promise<CallToolResult> => {
          try {
            const apiKey = process.env.GOOGLE_NANOBANANA_API_KEY ??
              process.env.NANOBANANA_API_KEY;
            const apiUrl = process.env.GOOGLE_NANOBANANA_API_URL ??
              process.env.NANOBANANA_API_URL ??
              "https://generativelanguage.googleapis.com/v1beta/models/nanobanana:generateImage";

            if (!apiKey || !apiUrl) {
              throw new Error(
                "Missing Nanobanana API configuration. Ensure GOOGLE_NANOBANANA_API_KEY and GOOGLE_NANOBANANA_API_URL are set.",
              );
            }

            const normalizedPath = path.isAbsolute(file_path)
              ? file_path
              : path.join(WORK_DIR, file_path);

            const { buffer, costUsd } = await fetchImageBuffer(
              apiUrl,
              apiKey,
              prompt,
              width,
              height,
              format,
            );

            const result = await writeBinaryFile(normalizedPath, buffer);

            if (!result.success) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: `Failed to write asset: ${result.error ?? "Unknown error"}`,
                  },
                ],
              };
            }

            const responseText = JSON.stringify({
              message: "Asset generated successfully",
              file_path: normalizedPath,
              bytes_written: result.bytesWritten ?? buffer.length,
              cost_usd: costUsd ?? 0,
            });

            return {
              content: [{ type: "text", text: responseText }],
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            baseLogger.error(
              error instanceof Error ? error : new Error(errorMessage),
              "Nanobanana asset generation failed",
            );
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Failed to generate asset: ${errorMessage}`,
                },
              ],
            };
          }
        },
      ),
    ],
  });
}
