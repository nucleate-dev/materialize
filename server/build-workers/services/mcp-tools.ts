import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Define the signature for the command runner callback
export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; isError: boolean }>;

// Define the signature for the dev server restart callback
export type DevServerRestartCallback = () => Promise<void>;

// Define the signature for the file writer callback
export type FileWriter = (
  filePath: string,
  content: string,
) => Promise<{ success: boolean; error?: string; bytesWritten?: number }>;

export function createDevelopmentToolsMcpServer(
  runCommand: CommandRunner,
  restartDevServer?: DevServerRestartCallback,
  writeFile?: FileWriter,
): ReturnType<typeof createSdkMcpServer> {
  return createSdkMcpServer({
    name: "development-tools",
    version: "1.0.0",
    tools: [
      // --- Git Tool ---
      tool(
        "git",
        "Run git commands to manage version control (e.g., checkout, commit, push, status).",
        {
          args: z
            .array(z.string())
            .describe(
              "The arguments to pass to git (e.g. ['checkout', '-b', 'feature'])",
            ),
        },
        async ({ args }) => {
          const result = await runCommand("git", args);

          if (result.isError) {
            return {
              isError: true,
              content: [{ type: "text", text: result.stdout }],
            };
          }
          return { content: [{ type: "text", text: result.stdout }] };
        },
      ),

      // --- NPM Install Tool ---
      tool(
        "npm_install",
        "Install node packages using npm or npx expo. After installing packages, the dev server will automatically restart to pick up the new dependencies.",
        {
          packages: z
            .array(z.string())
            .optional()
            .describe(
              "List of packages to install. If omitted, installs all dependencies (via npm install or expo install).",
            ),
          saveDev: z
            .boolean()
            .optional()
            .describe("If true, adds --save-dev flag"),
          installer: z
            .enum(["npm", "expo"])
            .optional()
            .describe(
              "Choose the installer. Defaults to npm; 'expo' uses 'npx expo install'.",
            ),
        },
        async ({ packages, saveDev, installer }) => {
          const useExpo = installer === "expo";
          if (useExpo && saveDev) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "`saveDev` is not supported when using expo install.",
                },
              ],
            };
          }

          const command = useExpo ? "npx" : "npm";
          const args = useExpo ? ["expo", "install"] : ["install"];

          if (saveDev) args.push("--save-dev");
          if (packages && packages.length > 0) args.push(...packages);

          const result = await runCommand(command, args);

          if (result.isError) {
            return {
              isError: true,
              content: [{ type: "text", text: result.stdout }],
            };
          }

          // After successful npm install, restart the dev server to pick up new dependencies
          if (restartDevServer) {
            try {
              await restartDevServer();
              return {
                content: [
                  {
                    type: "text",
                    text: `${result.stdout}\n\n✓ Dev server restarted successfully to pick up new dependencies.`,
                  },
                ],
              };
            } catch (restartError) {
              const errorMessage =
                restartError instanceof Error
                  ? restartError.message
                  : String(restartError);
              return {
                content: [
                  {
                    type: "text",
                    text: `${result.stdout}\n\n⚠ Warning: Failed to restart dev server: ${errorMessage}\nYou may need to manually restart the dev server for changes to take effect.`,
                  },
                ],
              };
            }
          }

          return { content: [{ type: "text", text: result.stdout }] };
        },
      ),

      // --- SafeWrite File Tool ---
      tool(
        "SafeWrite",
        "Write a file to the local filesystem with proper permissions and tracking. This will overwrite the file if it already exists. The file path must be an absolute path.",
        {
          file_path: z
            .string()
            .describe("The absolute path to the file to write"),
          content: z.string().describe("The content to write to the file"),
        },
        async ({ file_path, content }) => {
          if (!writeFile) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "Write operation is not available - file writer not configured",
                },
              ],
            };
          }

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
                  text: `Error writing file: ${errorMessage}`,
                },
              ],
            };
          }
        },
      ),
    ],
  });
}
