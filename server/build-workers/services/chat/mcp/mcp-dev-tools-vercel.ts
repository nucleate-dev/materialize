// import { tool, type ToolSet } from "ai";
// import { promises as fs } from "fs";
// import path from "path";
// import { z } from "zod";
// import { stripAnsiSequences } from "../../terminals/TerminalAnsiUtils.js";
// import {
//   CommandRunner,
//   DevServerRestartCallback,
//   FileWriter,
//   TerminalServiceInstance,
// } from "./mcp-dev-tools.js";
// import { WORK_DIR } from "../../../worker.js";

// // Vercel AI SDK tool definitions mirroring the Claude MCP dev tools.
// // These are intentionally kept in a separate module so provider-specific
// // wiring can diverge without affecting Claude MCP behavior.

// export function createVercelDevTools(
//   runCommand: CommandRunner,
//   writeFile: FileWriter,
//   terminalService: TerminalServiceInstance,
//   restartDevServer: DevServerRestartCallback,
// ): ToolSet {
//   return {
//     SafeWrite: tool({
//       description:
//         "Write a file to the local filesystem with proper permissions and tracking. This will overwrite the file if it already exists. The file path must be an absolute path.",
//       inputSchema: z.object({
//         file_path: z
//           .string()
//           .min(1)
//           .describe("The absolute path to the file to write"),
//         content: z.string().describe("The content to write to the file"),
//       }),
//       execute: async ({ file_path, content }) => {
//         const result = await writeFile(file_path, content);
//         if (result.success) {
//           return {
//             bytes_written: result.bytesWritten ?? content.length,
//             file_path,
//             message: "File written successfully",
//           };
//         }
//         throw new Error(result.error ?? "Unknown error writing file");
//       },
//     }),

//     checkTerminal: tool({
//       description:
//         "Check the dev-server terminal output to help debug errors. Returns the most recent terminal output as plain text.",
//       inputSchema: z
//         .object({
//           lines: z
//             .number()
//             .min(1)
//             .max(1000)
//             .optional()
//             .describe(
//               "Number of recent output lines to retrieve (default: 20, max: 1000)",
//             ),
//         })
//         .strict(),
//       execute: async ({ lines }) => {
//         const linesToRetrieve = lines ?? 20;
//         const session = terminalService.getSession("dev-server");
//         if (!session) {
//           throw new Error(
//             "Dev-server terminal session not found. The terminal may not have been started yet.",
//           );
//         }

//         const outputEvents = session.buffer.filter(
//           (event) => event.type === "output",
//         );
//         if (outputEvents.length === 0) {
//           return {
//             message: `Dev-server terminal (state: ${session.state}) has no output yet.`,
//           };
//         }

//         let allOutput = "";
//         for (const event of outputEvents) {
//           const chunk = event.payload.chunk;
//           if (typeof chunk === "string") {
//             allOutput += chunk;
//           }
//         }

//         const cleanOutput = stripAnsiSequences(allOutput);
//         const allLines = cleanOutput.split("\n");
//         const lastNLines = allLines.slice(-linesToRetrieve);
//         return { output: lastNLines.join("\n") || "(Terminal output is empty)" };
//       },
//     }),

//     SafeBash: tool({
//       description:
//         "Execute bash commands in a safe terminal environment. Only run commands that finish. Long-running or background processes will time out. For dev server commands, prefer RestartDevServer.",
//       inputSchema: z
//         .object({
//           command: z.string().min(1).describe("The bash command to execute"),
//           args: z
//             .array(z.string())
//             .optional()
//             .describe("Optional arguments to pass to the command"),
//           cwd: z
//             .string()
//             .optional()
//             .describe(
//               `Working directory for the command. Can be absolute (starting with ${WORK_DIR}) or relative to ${WORK_DIR}. Defaults to ${WORK_DIR}. For monorepo subdirectories, use paths like 'client' or 'backend'.`,
//             ),
//         })
//         .strict(),
//       execute: async ({ command, args, cwd }) => {
//         const result = await runCommand(command, args ?? [], cwd);
//         if (result.isError) {
//           throw new Error(result.stdout || "Command failed");
//         }
//         return { output: result.stdout };
//       },
//     }),

//     RestartDevServer: tool({
//       description:
//         "Restart the Expo dev server. Use this when you need to pick up changes that require a full restart (e.g., after modifying configuration files, installing packages, or if the dev server is in a bad state).",
//       inputSchema: z.object({}).strict(),
//       execute: async () => {
//         await restartDevServer();
//         return { message: "Dev server restarted successfully." };
//       },
//     }),

//     Read: tool({
//       description:
//         "Reads files from the local filesystem, including text, images, PDFs, and Jupyter notebooks.",
//       inputSchema: z.object({
//         file_path: z.string().describe("The absolute path to the file to read"),
//         offset: z
//           .number()
//           .optional()
//           .describe("The line number to start reading from"),
//         limit: z.number().optional().describe("The number of lines to read"),
//       }),
//       execute: async ({ file_path, offset, limit }) => {
//         try {
//           const stats = await fs.stat(file_path);
//           if (!stats.isFile()) {
//             throw new Error(`Path is not a file: ${file_path}`);
//           }

//           const ext = path.extname(file_path).toLowerCase();
//           const isBinary = [
//             ".png",
//             ".jpg",
//             ".jpeg",
//             ".gif",
//             ".pdf",
//             ".ico",
//           ].includes(ext);

//           if (isBinary) {
//             const buffer = await fs.readFile(file_path);
//             return { content: buffer.toString("base64"), encoding: "base64" };
//           }

//           const content = await fs.readFile(file_path, "utf-8");

//           if (offset !== undefined || limit !== undefined) {
//             const lines = content.split("\n");
//             const start = offset ?? 0;
//             const end = limit ? start + limit : undefined;
//             const selectedLines = lines.slice(start, end);
//             return { content: selectedLines.join("\n") };
//           }

//           return { content };
//         } catch (error) {
//           const errorMessage =
//             error instanceof Error ? error.message : String(error);
//           throw new Error(`Failed to read file: ${errorMessage}`);
//         }
//       },
//     }),

//     Glob: tool({
//       description:
//         "Fast file pattern matching that works with any codebase size.",
//       inputSchema: z.object({
//         pattern: z.string().describe("The glob pattern to match files against"),
//         path: z
//           .string()
//           .optional()
//           .describe("The directory to search in (defaults to cwd)"),
//       }),
//       execute: async ({ pattern, path: searchPath }) => {
//         const cwd = searchPath || process.cwd();
//         const args = [cwd];
//         if (pattern.includes("/")) {
//           args.push("-path", pattern);
//         } else {
//           args.push("-name", pattern);
//         }

//         const result = await runCommand("find", args);
//         if (result.isError) {
//           throw new Error(result.stdout || "Glob failed");
//         }
//         return { files: result.stdout.split("\n").filter(Boolean) };
//       },
//     }),

//     Grep: tool({
//       description: "Powerful search tool built on ripgrep with regex support.",
//       inputSchema: z.object({
//         pattern: z
//           .string()
//           .describe("The regular expression pattern to search for"),
//         path: z
//           .string()
//           .optional()
//           .describe("File or directory to search in (defaults to cwd)"),
//         glob: z
//           .string()
//           .optional()
//           .describe("Glob pattern to filter files (e.g. '*.js')"),
//         type: z
//           .string()
//           .optional()
//           .describe("File type to search (e.g. 'js', 'py', 'rust')"),
//         output_mode: z
//           .enum(["content", "files_with_matches", "count"])
//           .optional()
//           .describe("Output mode"),
//         "-i": z.boolean().optional().describe("Case insensitive search"),
//         "-n": z
//           .boolean()
//           .optional()
//           .describe("Show line numbers (for content mode)"),
//         "-B": z.number().optional().describe("Lines to show before each match"),
//         "-A": z.number().optional().describe("Lines to show after each match"),
//         "-C": z
//           .number()
//           .optional()
//           .describe("Lines to show before and after each match"),
//         head_limit: z
//           .number()
//           .optional()
//           .describe("Limit output to first N lines/entries"),
//         multiline: z.boolean().optional().describe("Enable multiline mode"),
//       }),
//       execute: async (args) => {
//         const {
//           pattern,
//           path: searchPath,
//           glob,
//           output_mode,
//           "-i": i,
//           "-n": n,
//           "-B": B,
//           "-A": A,
//           "-C": C,
//         } = args;
//         const cmdArgs = [];
//         if (i) cmdArgs.push("-i");
//         if (n) cmdArgs.push("-n");
//         if (B) cmdArgs.push("-B", String(B));
//         if (A) cmdArgs.push("-A", String(A));
//         if (C) cmdArgs.push("-C", String(C));
//         if (output_mode === "files_with_matches") cmdArgs.push("-l");
//         if (output_mode === "count") cmdArgs.push("-c");

//         cmdArgs.push("-r"); // Recursive by default

//         if (glob) {
//           cmdArgs.push(`--include=${glob}`);
//         }

//         cmdArgs.push(pattern);
//         cmdArgs.push(searchPath || process.cwd());

//         const result = await runCommand("grep", cmdArgs);

//         if (result.isError) {
//           // grep returns exit code 1 if no matches
//           if (result.stdout === "") return { output: "" };
//           throw new Error(result.stdout || "Grep failed");
//         }
//         return { output: result.stdout };
//       },
//     }),

//     TodoWrite: tool({
//       description:
//         "Creates and manages a structured task list for tracking progress.",
//       inputSchema: z.object({
//         todos: z
//           .array(
//             z.object({
//               content: z.string(),
//               status: z.enum(["pending", "in_progress", "completed"]),
//               activeForm: z.string(),
//             }),
//           )
//           .describe("The updated todo list"),
//       }),
//       execute: async ({ todos }) => {
//         const todoPath = path.join(process.cwd(), "TODO.md");
//         const content = todos
//           .map((t) => {
//             const mark =
//               t.status === "completed"
//                 ? "x"
//                 : t.status === "in_progress"
//                   ? "-"
//                   : " ";
//             return `- [${mark}] ${t.content}`;
//           })
//           .join("\n");

//         const result = await writeFile(todoPath, content);
//         if (result.success) {
//           return { message: "Todos written to TODO.md" };
//         }
//         throw new Error(result.error ?? "Unknown error writing todos");
//       },
//     }),
//   };
// }
