import { google } from "@ai-sdk/google";
import {
  createSdkMcpServer,
  McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { generateText } from "ai";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { z } from "zod";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { GEMINI_IMAGE_COST_USD, VERCEL_MODEL_COSTS_USD } from "../cost/cost-calculation.js";

// Callback type for reporting Gemini usage costs
export type GeminiUsageCallback = (costUsd: number) => void;

const GEMINI_DESIGN_SYSTEM_PROMPT = `
You are "Gemini Design Partner"—a world-class principal product designer who has led design at companies like Linear, Stripe, Vercel, and Apple.
You collaborate with a Claude-powered engineer building mobile (React Native/Expo) or web (Next.js/Tailwind) applications.

## Your Design Philosophy
- **Opinionated & Decisive**: Make bold choices. Never say "it depends" or offer wishy-washy alternatives. Pick THE best approach.
- **Premium by Default**: Every recommendation should make the product feel expensive, polished, and delightful. No generic Bootstrap/template vibes.
- **Inspiration-Driven**: Always reference specific well-designed apps for inspiration (Linear, Notion, Stripe, Airbnb, Apple, Figma, Vercel, Raycast, Arc, etc.)

## Design Dimensions You MUST Consider
For any design request, think holistically across ALL of these:

**Visual Hierarchy & Typography**
- Font pairings (suggest specific fonts or system font weights)
- Size scale and contrast between headings, body, captions
- Line height, letter spacing, text color contrast

**Color & Mood**
- Specific hex codes, not generic descriptions
- Consider light/dark mode harmony
- Accent colors for interactive elements, success/error states
- Gradients, overlays, and atmospheric effects when appropriate

**Spacing & Layout**
- Generous whitespace (premium apps breathe)
- Consistent spacing scale (8px, 16px, 24px, 32px, 48px, 64px)
- Grid systems, alignment, visual rhythm

**Motion & Micro-interactions**
- Entry/exit animations (fade, slide, scale, spring physics)
- Hover/press states with specific transforms
- Loading states, skeleton screens, transitions between views
- Scroll-triggered animations for landing pages

**Imagery & Assets**
- When images would elevate the design, explicitly recommend using the GenerateImage tool
- Suggest specific image styles (illustration, photography, abstract, 3D renders)
- Icon style recommendations (outlined, filled, duotone)
- Background treatments (gradients, patterns, blurs, mesh gradients)

**Copy & Content**
- Suggest punchy headlines, taglines, CTAs
- Microcopy for buttons, empty states, tooltips
- Tone of voice (playful, professional, minimal, bold)

**Accessibility & Polish**
- Color contrast ratios (WCAG AA minimum)
- Focus states, touch targets (44px minimum)
- Reduced motion alternatives

## Response Format
Structure your response as:

### Design Direction
[Bold, specific design decisions - not options, THE choice]

### Visual Specifications
- Colors: [specific hex codes]
- Typography: [specific sizes, weights, fonts]
- Spacing: [specific values]
- Border radius: [specific values]

### Motion & Interactions
[Specific animation recommendations with timing/easing]

### Image Recommendations
[If applicable: suggest GenerateImage prompts for any needed assets]

### Implementation Notes
[Platform-specific guidance, component structure, code patterns]

### Inspiration References
[2-3 specific apps/sites to reference for this type of UI]

Be concise but comprehensive. No filler. Every word should help the engineer build something beautiful.`;

export const DEFAULT_GEMINI_DESIGN_MODEL = "gemini-3-pro-preview";
// Image generation uses Gemini's multimodal model via generateText
export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

type Logger = Pick<SystemLogger, "consoleLogDevOnly" | "error"> | null;

/**
 * Creates an MCP server exposing Gemini-powered design tools:
 * - GeminiDesignExpert: Design/UX consultation
 * - GenerateImage: AI image generation
 */
export function createDesignToolsMcpServer(
  logger: Logger = null,
  modelName: string = DEFAULT_GEMINI_DESIGN_MODEL,
  onUsage?: GeminiUsageCallback,
  workDir?: string,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "design",
    version: "1.0.0",
    tools: [
      tool(
        "GeminiDesignExpert",
        "Ask a senior design/UX expert for decisive product, UI, and interaction guidance. Use this tool when you need design inspiration, want to explore creative alternatives, or need help with visual design decisions (color palettes, typography, layouts, animations, component styling). Provide relevant code snippets, screens, or CLAUDE.md excerpts in the context field for better recommendations.",
        {
          request: z
            .string()
            .min(1)
            .describe("The design or UX question/task to solve"),
          context: z
            .string()
            .optional()
            .describe(
              "Optional project context: code snippets, layout constraints, brand rules, or design system notes",
            ),
        },
        async ({
          request,
          context,
        }: {
          request: string;
          context?: string;
        }): Promise<CallToolResult> => {
          try {
            const prompt = [
              "Request:",
              request,
              context ? `\nContext:\n${context}` : "",
            ]
              .filter(Boolean)
              .join("\n");

            logger?.consoleLogDevOnly("info", "Gemini design tool invoked", {
              modelName,
              requestLength: request.length,
              hasContext: Boolean(context),
            });

            const result = await generateText({
              model: google(modelName),
              system: GEMINI_DESIGN_SYSTEM_PROMPT,
              prompt,
              providerOptions: {
                google: {
                  thinkingConfig: {
                    includeThoughts: true,
                    thinkingLevel: "low",
                  },
                },
              },
            });

            // Calculate and report usage cost
            if (onUsage && result.usage) {
              const pricing = VERCEL_MODEL_COSTS_USD[modelName];
              const inputTokens = result.usage.inputTokens ?? 0;
              const outputTokens = result.usage.outputTokens ?? 0;
              if (pricing) {
                const inputCost =
                  (inputTokens * (pricing.inputUsdPer1M ?? 0)) / 1_000_000;
                const outputCost =
                  (outputTokens * (pricing.outputUsdPer1M ?? 0)) / 1_000_000;
                const totalCostUsd = inputCost + outputCost;

                logger?.consoleLogDevOnly("info", "Gemini design tool usage", {
                  modelName,
                  inputTokens,
                  outputTokens,
                  totalCostUsd,
                });

                onUsage(totalCostUsd);
              }
            }

            return {
              content: [
                {
                  type: "text",
                  text: result.text,
                },
              ],
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            logger?.error(
              error instanceof Error ? error : new Error(errorMessage),
              "Gemini design tool failed",
            );

            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Gemini design expert failed: ${errorMessage}`,
                },
              ],
            };
          }
        },
      ),

      // --- GenerateImage Tool ---
      tool(
        "GenerateImage",
        "Generate an image using AI based on a text prompt. The image is saved to the project and can be used in the app. Use this when the user needs custom images, icons, illustrations, or any visual assets generated from a description.",
        {
          prompt: z
            .string()
            .min(1)
            .describe("Detailed description of the image to generate"),
          filename: z
            .string()
            .min(1)
            .describe("Output filename with extension (e.g., hero-image.png, app-icon.jpg)"),
          outputPath: z
            .string()
            .optional()
            .describe("Directory path relative to project root (default: assets/)"),
          aspectRatio: z
            .enum(["1:1", "3:4", "4:3", "9:16", "16:9"])
            .optional()
            .describe("Image aspect ratio (default: 1:1)"),
          quality: z
            .enum(["standard", "hd"])
            .optional()
            .describe("Image quality: standard (1K/2K resolution) or hd (4K resolution). Default: standard"),
        },
        async ({
          prompt,
          filename,
          outputPath,
          aspectRatio,
          quality,
        }: {
          prompt: string;
          filename: string;
          outputPath?: string;
          aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
          quality?: "standard" | "hd";
        }): Promise<CallToolResult> => {
          // Validate workDir is provided
          if (!workDir) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "Image generation is not available: workDir not configured",
                },
              ],
            };
          }

          // Validate filename (no path traversal or directory separators)
          if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "Invalid filename: must not contain path separators or '..'",
                },
              ],
            };
          }

          try {
            logger?.consoleLogDevOnly("info", "GenerateImage tool invoked", {
              prompt: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
              filename,
              outputPath,
              aspectRatio: aspectRatio ?? "1:1",
              quality: quality ?? "standard",
            });

            // Generate image using Gemini's multimodal model
            const result = await generateText({
              model: google(DEFAULT_GEMINI_IMAGE_MODEL),
              prompt,
              providerOptions: {
                google: {
                  responseModalities: ["TEXT", "IMAGE"],
                },
              },
            });

            // Extract image from result.files
            const imageFiles = result.files?.filter((f) =>
              f.mediaType?.startsWith("image/"),
            );

            if (!imageFiles || imageFiles.length === 0) {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "No image was generated. The model may have declined to generate the requested image.",
                  },
                ],
              };
            }

            const generatedImage = imageFiles[0];

            // Construct output path - app code lives in client/ subdirectory
            const targetDir = outputPath ?? "assets";
            const relativePath = join("client", targetDir, filename);
            const fullPath = join(workDir, relativePath);

            // Ensure directory exists
            mkdirSync(dirname(fullPath), { recursive: true });

            // Write image to filesystem
            writeFileSync(fullPath, Buffer.from(generatedImage.uint8Array));

            // Calculate and report cost:
            // - Input: token-based ($2/1M for text prompt)
            // - Output: per-image pricing ($0.134 standard, $0.24 HD)
            if (onUsage) {
              const pricing = VERCEL_MODEL_COSTS_USD[DEFAULT_GEMINI_IMAGE_MODEL];
              const inputTokens = result.usage?.inputTokens ?? 0;
              const inputCost =
                (inputTokens * (pricing?.inputUsdPer1M ?? 0)) / 1_000_000;
              const isHD = quality === "hd";
              const imageCost = isHD
                ? GEMINI_IMAGE_COST_USD.perImage4K
                : GEMINI_IMAGE_COST_USD.perImage1K2K;
              const totalCostUsd = inputCost + imageCost;
              onUsage(totalCostUsd);

              logger?.consoleLogDevOnly("info", "GenerateImage cost calculated", {
                inputTokens,
                inputCost,
                imageCost,
                quality: quality ?? "standard",
                totalCostUsd,
              });
            }

            logger?.consoleLogDevOnly("info", "Image generated successfully", {
              filename,
              relativePath,
              imageSizeBytes: generatedImage.uint8Array.length,
            });

            return {
              content: [
                {
                  type: "text",
                  text: `Image generated and saved to: ${relativePath}`,
                },
              ],
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            logger?.error(
              error instanceof Error ? error : new Error(errorMessage),
              "GenerateImage tool failed",
            );

            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Failed to generate image: ${errorMessage}`,
                },
              ],
            };
          }
        },
      ),
    ],
  });
}
