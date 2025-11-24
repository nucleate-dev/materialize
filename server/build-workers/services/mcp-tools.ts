import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Define the signature for the command runner callback
export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; isError: boolean }>;

// Define the signature for the dev server restart callback
export type DevServerRestartCallback = () => Promise<void>;

export function createDevelopmentToolsMcpServer(
  runCommand: CommandRunner,
  restartDevServer?: DevServerRestartCallback,
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
        "Install node packages using npm. After installing packages, the dev server will automatically restart to pick up the new dependencies.",
        {
          packages: z
            .array(z.string())
            .optional()
            .describe(
              "List of packages to install. If omitted, runs 'npm install' for all dependencies.",
            ),
          saveDev: z
            .boolean()
            .optional()
            .describe("If true, adds --save-dev flag"),
        },
        async ({ packages, saveDev }) => {
          const args = ["install"];

          if (saveDev) args.push("--save-dev");
          if (packages && packages.length > 0) args.push(...packages);

          const result = await runCommand("npm", args);

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
    ],
  });
}
