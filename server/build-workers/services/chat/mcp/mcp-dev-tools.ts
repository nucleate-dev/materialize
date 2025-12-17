import {
  createSdkMcpServer,
  McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { stripAnsiSequences } from "../../terminals/TerminalAnsiUtils.js";
import { WORK_DIR } from "../../../worker.js";

// Define the signature for the command runner callback
export type CommandRunner = (
  command: string,
  args: string[],
  cwd?: string,
) => Promise<{ stdout: string; isError: boolean }>;

// Define the signature for the dev server restart callback
export type DevServerRestartCallback = () => Promise<void>;

// Define the signature for the file writer callback
export type FileWriter = (
  filePath: string,
  content: string,
) => Promise<{ success: boolean; error?: string; bytesWritten?: number }>;

// Import TerminalService type
export type TerminalServiceInstance = {
  getSession: (sessionId: string) =>
    | {
        id: string;
        state: string;
        buffer: Array<{
          type: string;
          payload: { [key: string]: unknown };
          timestamp: number;
        }>;
      }
    | undefined;
};

export function createDevelopmentToolsMcpServer(
  runCommand: CommandRunner,
  writeFile: FileWriter,
  terminalService: TerminalServiceInstance,
  restartDevServer: DevServerRestartCallback,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "devtools",
    version: "1.0.0",
    tools: [
      // --- SafeWrite File Tool ---
      tool(
        "SafeWrite",
        "Write a file to the local filesystem with proper permissions and tracking. This will overwrite the file if it already exists. The file path must be an absolute path.",
        {
          file_path: z
            .string()
            .min(1)
            .describe("The absolute path to the file to write"),
          content: z.string().describe("The content to write to the file"),
        },
        async ({ file_path, content }): Promise<CallToolResult> => {
          try {
            const result = await writeFile(file_path, content);

            if (result.success) {
              const bytesWritten = result.bytesWritten ?? content.length;
              const responseText = JSON.stringify({
                message: "File written successfully",
                bytes_written: bytesWritten,
                file_path: file_path,
              });

              return {
                content: [{ type: "text", text: responseText }],
              };
            } else {
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: `Failed to write file: ${result.error ?? "Unknown error"}`,
                  },
                ],
              };
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Failed to write file: ${errorMessage}`,
                },
              ],
            };
          }
        },
      ),

      // --- CheckTerminal Tool ---
      tool(
        "checkTerminal",
        "Check the dev-server terminal output to help debug errors. Returns the most recent terminal output as plain text.",
        {
          lines: z
            .number()
            .min(1)
            .max(1000)
            .optional()
            .describe(
              "Number of recent output lines to retrieve (default: 20, max: 1000)",
            ),
        },
        async ({ lines }): Promise<CallToolResult> => {
          const linesToRetrieve = lines ?? 20;
          const session = terminalService.getSession("dev-server");

          if (!session) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "Dev-server terminal session not found. The terminal may not have been started yet.",
                },
              ],
            };
          }

          // Filter for output events and extract chunks
          const outputEvents = session.buffer.filter(
            (event) => event.type === "output",
          );

          if (outputEvents.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `Dev-server terminal (state: ${session.state}) has no output yet.`,
                },
              ],
            };
          }

          // Concatenate all output chunks
          let allOutput = "";
          for (const event of outputEvents) {
            const chunk = event.payload.chunk;
            if (typeof chunk === "string") {
              allOutput += chunk;
            }
          }

          // Strip ANSI escape sequences
          const cleanOutput = stripAnsiSequences(allOutput);

          // Split by newlines and get last N lines
          const allLines = cleanOutput.split("\n");
          const lastNLines = allLines.slice(-linesToRetrieve);
          const result = lastNLines.join("\n");

          return {
            content: [
              {
                type: "text",
                text: result || "(Terminal output is empty)",
              },
            ],
          };
        },
      ),

      // --- Restart Dev Server Tool ---
      tool(
        "RestartDevServer",
        "Restart the Expo dev server. Use this when you need to pick up changes that require a full restart (e.g., after modifying configuration files, installing packages, or if the dev server is in a bad state). The dev server will be stopped and restarted with the same configuration.",
        {},
        async (): Promise<CallToolResult> => {
          try {
            await restartDevServer();
            return {
              content: [
                {
                  type: "text",
                  text: "Dev server restarted successfully.",
                },
              ],
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Failed to restart dev server: ${errorMessage}`,
                },
              ],
            };
          }
        },
      ),

      // --- SafeBash Tool ---
      tool(
        "SafeBash",
        `Execute bash commands in a safe terminal environment. Only run bash commands that finish. Long-running or background processes will hang and time out. Safe commands: git, npm/npx, etc. For dev server related commands, use the RestartDevServer tool instead.`,
        {
          command: z.string().min(1).describe("The bash command to execute"),
          args: z
            .array(z.string())
            .optional()
            .describe(
              "Optional arguments to pass to the command (e.g., ['install'] for npm install)",
            ),
          cwd: z
            .string()
            .optional()
            .describe(
              `Working directory for the command. Can be absolute (starting with ${WORK_DIR}) or relative to ${WORK_DIR}. Defaults to ${WORK_DIR}. For monorepo subdirectories, use paths like 'client' or 'backend'.`,
            ),
        },
        async ({ command, args, cwd }): Promise<CallToolResult> => {
          try {
            const result = await runCommand(command, args ?? [], cwd);

            if (result.isError) {
              return {
                isError: true,
                content: [{ type: "text", text: result.stdout }],
              };
            }
            return { content: [{ type: "text", text: result.stdout }] };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Failed to execute command: ${errorMessage}`,
                },
              ],
            };
          }
        },
      ),
    ],
  });
}
