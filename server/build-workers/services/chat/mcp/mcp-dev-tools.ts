import {
  createSdkMcpServer,
  McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ScreenUpdateData } from "../../../types/ChatTypes.js";
import { WORK_DIR } from "../../../worker.js";
import { stripAnsiSequences } from "../../terminals/TerminalAnsiUtils.js";

// Define the signature for the command runner callback
export type CommandRunner = (
  command: string,
  args: string[],
  cwd?: string,
) => Promise<{ stdout: string; isError: boolean }>;

// Define the signature for the dev server restart callback
export type DevServerRestartCallback = () => Promise<void>;

// Define the signature for broadcasting screen update events
export type ScreenUpdateBroadcaster = (data: ScreenUpdateData) => void;

// Define the signature for getting current visible screens count
export type GetVisibleScreensCount = () => number;

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

export interface SourceRepoPullRequestToolInput {
  branch_name: string;
  commit_message: string;
  pr_title: string;
  pr_description: string;
  existing_pr_number?: number;
}

export type SourceRepoPullRequestToolHandler = (
  input: SourceRepoPullRequestToolInput,
) => Promise<CallToolResult>;

export type SourceRepoBranchPreparationHandler = (
  input: {
    branch_name: string;
    base_branch?: string;
    existing_pr_number?: number;
  },
) => Promise<CallToolResult>;

export type SourceRepoPullRequestListToolHandler = () => Promise<
  CallToolResult
>;

export function createDevelopmentToolsMcpServer(
  runCommand: CommandRunner,
  writeFile: FileWriter,
  terminalService: TerminalServiceInstance,
  restartDevServer: DevServerRestartCallback,
  broadcastScreenUpdate?: ScreenUpdateBroadcaster,
  getVisibleScreensCount?: GetVisibleScreensCount,
  sourceRepoPullRequestTool?: SourceRepoPullRequestToolHandler,
  prepareSourceRepoBranchTool?: SourceRepoBranchPreparationHandler,
  listSourceRepoPullRequestsTool?: SourceRepoPullRequestListToolHandler,
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
        async ({
          file_path,
          content,
        }: {
          file_path: string;
          content: string;
        }): Promise<CallToolResult> => {
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
                    text: `Failed to write file: ${
                      result.error ?? "Unknown error"
                    }`,
                  },
                ],
              };
            }
          } catch (error) {
            const errorMessage = error instanceof Error
              ? error.message
              : String(error);
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
        async ({ lines }: { lines?: number }): Promise<CallToolResult> => {
          const linesToRetrieve = lines ?? 20;
          const session = terminalService.getSession("dev-server");

          if (!session) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text:
                    "Dev-server terminal session not found. The terminal may not have been started yet.",
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
                  text:
                    `Dev-server terminal (state: ${session.state}) has no output yet.`,
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
            const errorMessage = error instanceof Error
              ? error.message
              : String(error);
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
        `Execute bash commands in a safe terminal environment. Only run one command at a time -- all commands run in the same terminal. Only run bash commands that finish. Long-running or background processes will hang and time out. Safe commands: git, npm/npx, etc. For dev server related commands, use the RestartDevServer tool instead.`,
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
        async ({
          command,
          args,
          cwd,
        }: {
          command: string;
          args?: string[];
          cwd?: string;
        }): Promise<CallToolResult> => {
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
            const errorMessage = error instanceof Error
              ? error.message
              : String(error);
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

      ...(prepareSourceRepoBranchTool
        ? [
          tool(
            "PrepareSourceRepoBranch",
            "Checkout an existing PR branch or create/reset a new branch in the source repository before making edits. Call this BEFORE editing any files in /tmp/source-repository.",
            {
              branch_name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                  "Desired branch name when creating a new PR branch. Will be normalized to remove spaces and prefixed with nucleate- if needed.",
                ),
              base_branch: z
                .string()
                .min(1)
                .max(200)
                .optional()
                .describe(
                  "Optional base branch to branch off from when creating a new branch. Defaults to the repository's default branch.",
                ),
              existing_pr_number: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                  "Set this to the GitHub PR number to checkout that PR's branch instead of creating a new one.",
                ),
            },
            async (input): Promise<CallToolResult> => {
              return prepareSourceRepoBranchTool(input);
            },
          ),
        ]
        : []),

      ...(sourceRepoPullRequestTool
        ? [
          tool(
            "CreateSourceRepoPullRequest",
            "Create or update a pull request in the linked source repository. This tool sets the remote with an authenticated installation token, checks out the target branch, stages the current changes, commits them, pushes to GitHub, and either creates a new PR or updates an existing one.",
            {
              branch_name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                  "Branch name for the PR. The tool will error if the branch name is not the same as the prepared branch name.",
                ),
              commit_message: z
                .string()
                .min(5)
                .max(500)
                .describe(
                  "Commit message for the source repository changes being pushed.",
                ),
              pr_title: z
                .string()
                .min(5)
                .max(300)
                .describe("Pull request title."),
              pr_description: z
                .string()
                .min(10)
                .max(5000)
                .describe("Pull request description/body."),
              existing_pr_number: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                  "Optional GitHub pull request number. Provide this to update the existing PR (branch, title, body) instead of creating a new one.",
                ),
            },
            async (input): Promise<CallToolResult> => {
              return sourceRepoPullRequestTool(input);
            },
          ),
        ]
        : []),

      ...(listSourceRepoPullRequestsTool
        ? [
          tool(
            "ListSourceRepoPullRequests",
            "List open source repository pull requests created via Nucleate for this prototype. Use this before updating a PR to discover branch names and PR numbers.",
            {},
            async (): Promise<CallToolResult> => {
              return listSourceRepoPullRequestsTool();
            },
          ),
        ]
        : []),

      // --- UpdatePreviewScreens Tool ---
      // Only include this tool if the broadcast callback is provided
      ...(broadcastScreenUpdate
        ? [
          tool(
            "UpdatePreviewScreens",
            "Control preview screens shown to the user. Actions: 'add' (new screen), 'remove' (by ID), 'set' (replace all). Use this to help users compare design variants side-by-side. PROACTIVELY use this when creating design variants (e.g., after creating /pricing-v1 and /pricing-v2, use this to show them side-by-side). Maximum 4 screens.",
            {
              action: z
                .enum(["add", "remove", "set"])
                .describe(
                  "Action: 'add' adds a new screen, 'remove' removes by ID, 'set' replaces all screens",
                ),
              path: z
                .string()
                .optional()
                .describe(
                  "Path for 'add' action (e.g., '/pricing-v1'). Required when action is 'add'.",
                ),
              screenId: z
                .number()
                .optional()
                .describe(
                  "Screen ID for 'remove' action. Required when action is 'remove'.",
                ),
              screens: z
                .array(z.object({ path: z.string() }))
                .max(4)
                .optional()
                .describe(
                  "Array of screen paths for 'set' action (max 4 screens). Required when action is 'set'.",
                ),
              previewMode: z
                .enum(["mobile", "web", "tablet"])
                .optional()
                .describe(
                  "Device preview mode. Prefer 'mobile' or 'web' for best user experience.",
                ),
              layoutMode: z
                .enum(["grid", "freeform"])
                .optional()
                .describe(
                  "Canvas layout mode. 'grid' shows screens in an organized grid, 'freeform' allows free positioning.",
                ),
            },
            async ({
              action,
              path,
              screenId,
              screens,
              previewMode,
              layoutMode,
            }: {
              action: "add" | "remove" | "set";
              path?: string;
              screenId?: number;
              screens?: Array<{ path: string }>;
              previewMode?: "mobile" | "web" | "tablet";
              layoutMode?: "grid" | "freeform";
            }): Promise<CallToolResult> => {
              // Validate action-specific parameters
              if (action === "add" && !path) {
                return {
                  isError: true,
                  content: [
                    {
                      type: "text",
                      text: "Path is required for 'add' action",
                    },
                  ],
                };
              }
              if (action === "remove" && screenId === undefined) {
                return {
                  isError: true,
                  content: [
                    {
                      type: "text",
                      text: "screenId is required for 'remove' action",
                    },
                  ],
                };
              }
              if (action === "set" && (!screens || screens.length === 0)) {
                return {
                  isError: true,
                  content: [
                    {
                      type: "text",
                      text: "screens array is required for 'set' action",
                    },
                  ],
                };
              }
              // Enforce max 4 screens for add action
              if (action === "add" && getVisibleScreensCount) {
                const currentCount = getVisibleScreensCount();
                if (currentCount >= 4) {
                  return {
                    content: [
                      {
                        type: "text",
                        text:
                          "Cannot add screen: maximum of 4 screens allowed. Use 'set' action to replace screens or 'remove' to free up space.",
                      },
                    ],
                  };
                }
              }

              // Broadcast screen update to client
              const updateData: ScreenUpdateData = {
                action,
                path,
                screenId,
                screens,
                previewMode,
                layoutMode,
              };
              broadcastScreenUpdate(updateData);

              // Return success message based on action
              let message: string;
              switch (action) {
                case "add":
                  message = `Screen added with path: ${path}`;
                  break;
                case "remove":
                  message = `Screen with ID ${screenId} removed`;
                  break;
                case "set":
                  message = `Screens set to: ${
                    screens?.map((s) => s.path).join(", ")
                  }`;
                  break;
              }

              // Add mode info to message if specified
              if (previewMode) {
                message += ` (preview: ${previewMode})`;
              }
              if (layoutMode) {
                message += ` (layout: ${layoutMode})`;
              }

              return {
                content: [{ type: "text", text: message }],
              };
            },
          ),
        ]
        : []),
    ],
  });
}
