import { google } from "@ai-sdk/google";
import {
  createSdkMcpServer,
  McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { generateText } from "ai";
import { z } from "zod";
import { SystemLogger } from "../../../loggers/SystemLogger.js";

const GEMINI_DESIGN_SYSTEM_PROMPT = `
You are "Gemini Design Partner"—a principal mobile product designer and UI/UX specialist.
You collaborate with a Claude-powered engineer inside a React Native + Expo codebase.
- Be decisive, opinionated, and actionable. No filler, no apologies.
- Honor any provided design system (especially content from CLAUDE.md or brand notes).
- Prioritize accessibility, motion, hierarchy, spacing, and mobile ergonomics.
- Keep answers concise and implementation-ready. Prefer bullets over prose.

Always respond in three sections:
1) Direction: the concrete design move(s) to make.
2) Rationale: why this is the right call for the product.
3) Implementation Hints: specific UI/UX guidance the engineer can apply immediately.`;

export const DEFAULT_GEMINI_DESIGN_MODEL = "gemini-2.5-flash";

type Logger = Pick<SystemLogger, "consoleLogDevOnly" | "error"> | null;

/**
 * Creates an MCP server exposing a Gemini-powered design/UX expert.
 */
export function createDesignToolsMcpServer(
  logger: Logger = null,
  modelName: string = DEFAULT_GEMINI_DESIGN_MODEL,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "design",
    version: "1.0.0",
    tools: [
      tool(
        "GeminiDesignExpert",
        "Ask a senior Gemini design/UX expert for decisive product, UI, and interaction guidance tailored to the current React Native/Expo app. Provide relevant code snippets, screens, or CLAUDE.md excerpts in the context field.",
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
                    thinkingLevel: 'low',
                  },
                },
              },
            });

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
    ],
  });
}
