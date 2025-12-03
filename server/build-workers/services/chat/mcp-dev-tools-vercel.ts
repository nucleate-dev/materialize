import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { stripAnsiSequences } from "../terminals/TerminalAnsiUtils.js";
import {
  CommandRunner,
  DevServerRestartCallback,
  FileWriter,
  TerminalServiceInstance,
} from "./mcp-dev-tools.js";

// Vercel AI SDK tool definitions mirroring the Claude MCP dev tools.
// These are intentionally kept in a separate module so provider-specific
// wiring can diverge without affecting Claude MCP behavior.

export function createVercelDevTools(
  runCommand: CommandRunner,
  writeFile: FileWriter,
  terminalService: TerminalServiceInstance,
  restartDevServer: DevServerRestartCallback,
): ToolSet {
  return {
    SafeWrite: tool({
      description:
        "Write a file to the local filesystem with proper permissions and tracking. This will overwrite the file if it already exists. The file path must be an absolute path.",
      inputSchema: z.object({
        file_path: z
          .string()
          .min(1)
          .describe("The absolute path to the file to write"),
        content: z.string().describe("The content to write to the file"),
      }),
      execute: async ({ file_path, content }) => {
        const result = await writeFile(file_path, content);
        if (result.success) {
          return {
            bytes_written: result.bytesWritten ?? content.length,
            file_path,
            message: "File written successfully",
          };
        }
        throw new Error(result.error ?? "Unknown error writing file");
      },
    }),

    checkTerminal: tool({
      description:
        "Check the dev-server terminal output to help debug errors. Returns the most recent terminal output as plain text.",
      inputSchema: z
        .object({
          lines: z
            .number()
            .min(1)
            .max(1000)
            .optional()
            .describe(
              "Number of recent output lines to retrieve (default: 20, max: 1000)",
            ),
        })
        .strict(),
      execute: async ({ lines }) => {
        const linesToRetrieve = lines ?? 20;
        const session = terminalService.getSession("dev-server");
        if (!session) {
          throw new Error(
            "Dev-server terminal session not found. The terminal may not have been started yet.",
          );
        }

        const outputEvents = session.buffer.filter(
          (event) => event.type === "output",
        );
        if (outputEvents.length === 0) {
          return {
            message: `Dev-server terminal (state: ${session.state}) has no output yet.`,
          };
        }

        let allOutput = "";
        for (const event of outputEvents) {
          const chunk = event.payload.chunk;
          if (typeof chunk === "string") {
            allOutput += chunk;
          }
        }

        const cleanOutput = stripAnsiSequences(allOutput);
        const allLines = cleanOutput.split("\n");
        const lastNLines = allLines.slice(-linesToRetrieve);
        return { output: lastNLines.join("\n") || "(Terminal output is empty)" };
      },
    }),

    SafeBash: tool({
      description:
        "Execute bash commands in a safe terminal environment. Only run commands that finish. Long-running or background processes will time out. For dev server commands, prefer RestartDevServer.",
      inputSchema: z
        .object({
          command: z.string().min(1).describe("The bash command to execute"),
          args: z
            .array(z.string())
            .optional()
            .describe("Optional arguments to pass to the command"),
        })
        .strict(),
      execute: async ({ command, args }) => {
        const result = await runCommand(command, args ?? []);
        if (result.isError) {
          throw new Error(result.stdout || "Command failed");
        }
        return { output: result.stdout };
      },
    }),

    RestartDevServer: tool({
      description:
        "Restart the Expo dev server. Use this when you need to pick up changes that require a full restart (e.g., after modifying configuration files, installing packages, or if the dev server is in a bad state).",
      inputSchema: z.object({}).strict(),
      execute: async () => {
        await restartDevServer();
        return { message: "Dev server restarted successfully." };
      },
    }),
  };
}
