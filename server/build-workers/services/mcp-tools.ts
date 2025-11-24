import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Define the signature for the command runner callback
export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; isError: boolean }>;

export function createDevelopmentToolsMcpServer(
  runCommand: CommandRunner,
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
        "Install node packages using npm.",
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
          return { content: [{ type: "text", text: result.stdout }] };
        },
      ),
    ],
  });
}
