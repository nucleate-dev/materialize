import { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import { baseLogger } from "../../worker.js";

type ToolName =
  | "Bash"
  | "BashOutput"
  | "Read"
  | "Write"
  | "Edit"
  | "NotebookEdit"
  | "Glob"
  | "Grep"
  | string;

interface BashToolInput {
  command?: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
  [key: string]: unknown;
}

interface BashOutputToolInput {
  bash_id?: string;
  filter?: string;
  [key: string]: unknown;
}

interface FileReadToolInput {
  file_path?: string;
  offset?: number;
  limit?: number;
  [key: string]: unknown;
}

interface FileWriteToolInput {
  file_path?: string;
  content?: string;
  [key: string]: unknown;
}

interface FileEditToolInput {
  file_path?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  [key: string]: unknown;
}

interface NotebookEditToolInput {
  notebook_path?: string;
  [key: string]: unknown;
}

interface GlobToolInput {
  pattern?: string;
  path?: string;
  [key: string]: unknown;
}

interface GrepToolInput {
  pattern?: string;
  path?: string;
  paths?: string[];
  [key: string]: unknown;
}

type ToolInput =
  | BashToolInput
  | BashOutputToolInput
  | FileReadToolInput
  | FileWriteToolInput
  | FileEditToolInput
  | NotebookEditToolInput
  | GlobToolInput
  | GrepToolInput
  | Record<string, unknown>;

interface ToolInputWithFilePath {
  file_path?: string;
  notebook_path?: string;
  [key: string]: unknown;
}

/**
 * Service responsible for evaluating and enforcing tool usage permissions.
 * Validates tool inputs against security policies and path constraints.
 */
export class ToolPermissionService {
  private readonly allowedRoot: string;

  constructor(allowedRoot: string) {
    this.allowedRoot = allowedRoot;
  }

  /**
   * Evaluates whether a tool can be used with the given input.
   * Returns a permission result with either allow/deny and potentially updated input.
   */
  public evaluateToolPermission(
    toolName: ToolName,
    input: ToolInput,
  ): PermissionResult {
    const inputPreview = this.sanitizeInputPreview(input);
    const deny = (reason: string, message?: string): PermissionResult => {
      baseLogger.warn("Tool denied by policy", {
        tool: toolName,
        reason,
        inputPreview,
      });
      return {
        behavior: "deny" as const,
        message: message ?? reason ?? "Tool denied by policy",
        interrupt: true,
      };
    };

    const validatePath = (
      rawPath: unknown,
    ): { ok: boolean; resolvedPath?: string; reason?: string } => {
      if (typeof rawPath !== "string" || rawPath.trim() === "") {
        return {
          ok: false,
          reason: "File path must be a non-empty string",
        };
      }

      const { resolvedPath, withinRoot } =
        this.normalizePathToAllowedRoot(rawPath);

      if (!withinRoot) {
        return {
          ok: false,
          resolvedPath,
          reason: `Path must stay within ${this.allowedRoot}`,
        };
      }

      if (resolvedPath && this.isSensitiveSystemPath(resolvedPath)) {
        return {
          ok: false,
          resolvedPath,
          reason: "Access to system paths is blocked",
        };
      }

      return { ok: true, resolvedPath };
    };

    switch (toolName) {
      case "Bash": {
        const bashInput = input as BashToolInput;
        const command =
          typeof bashInput.command === "string" ? bashInput.command.trim() : "";

        if (!command) {
          return deny("Bash commands are disabled for safety.");
        }

        if (
          bashInput &&
          typeof bashInput === "object" &&
          "run_in_background" in bashInput &&
          Boolean(bashInput.run_in_background)
        ) {
          return deny("Background bash commands are not permitted");
        }

        const blockedTokens = [
          "|",
          ";",
          "&&",
          "||",
          "`",
          "$(",
          "${",
          "<",
          ">",
          "\n",
        ];
        if (blockedTokens.some((token) => command.includes(token))) {
          return deny("Complex bash commands are blocked");
        }

        const tokens = command.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
          return deny("Empty bash command is not permitted");
        }

        const [executable, ...args] = tokens;

        if (executable === "pwd") {
          if (args.length > 0) {
            return deny("pwd with arguments is not allowed");
          }
          return {
            behavior: "allow" as const,
            updatedInput: { ...input, command: "pwd" },
          };
        }

        if (executable === "ls") {
          if (args.length > 1) {
            return deny("ls with multiple arguments is blocked");
          }

          if (args.length === 1) {
            if (args[0].startsWith("-")) {
              return deny("ls flags are not permitted");
            }

            const validation = validatePath(args[0]);
            if (!validation.ok || !validation.resolvedPath) {
              return deny(validation.reason ?? "ls path is not permitted");
            }

            return {
              behavior: "allow" as const,
              updatedInput: {
                ...input,
                command: `ls ${validation.resolvedPath}`,
              },
            };
          }

          return {
            behavior: "allow" as const,
            updatedInput: { ...input, command: "ls" },
          };
        }

        return deny("Bash commands are restricted to a safe whitelist");
      }

      case "BashOutput": {
        return deny("BashOutput is disabled because Bash is restricted");
      }

      case "Read":
      case "Write":
      case "Edit":
      case "NotebookEdit": {
        const filePath =
          (input as ToolInputWithFilePath)?.file_path ??
          (input as ToolInputWithFilePath)?.notebook_path;

        const validation = validatePath(filePath);
        if (!validation.ok || !validation.resolvedPath) {
          return deny(
            validation.reason ?? "Access to this file path is not permitted",
          );
        }

        const updatedInput: ToolInput = {
          ...input,
        };

        if ((input as ToolInputWithFilePath)?.file_path !== undefined) {
          updatedInput.file_path = validation.resolvedPath;
        }

        if ((input as ToolInputWithFilePath)?.notebook_path !== undefined) {
          updatedInput.notebook_path = validation.resolvedPath;
        }

        return { behavior: "allow" as const, updatedInput };
      }

      case "Glob": {
        const globInput = input as GlobToolInput;
        if (
          typeof globInput.pattern === "string" &&
          globInput.pattern.includes("..")
        ) {
          return deny("Glob patterns cannot escape the workspace");
        }

        const basePath =
          typeof globInput.path === "string"
            ? globInput.path
            : this.allowedRoot;
        const validation = validatePath(basePath);

        if (!validation.ok || !validation.resolvedPath) {
          return deny(
            validation.reason ?? "Glob path is outside the allowed workspace",
          );
        }

        const updatedInput: ToolInput = {
          ...input,
          path: validation.resolvedPath,
        };

        return { behavior: "allow" as const, updatedInput };
      }

      case "Grep": {
        const grepInput = input as GrepToolInput;
        const candidatePaths: string[] = [];
        if (typeof grepInput.path === "string") {
          candidatePaths.push(grepInput.path);
        }

        if (Array.isArray(grepInput.paths)) {
          candidatePaths.push(...grepInput.paths);
        }

        const resolvedPaths: string[] = [];

        for (const candidate of candidatePaths) {
          const validation = validatePath(candidate);
          if (!validation.ok || !validation.resolvedPath) {
            return deny(validation.reason ?? "Grep path is not permitted");
          }
          resolvedPaths.push(validation.resolvedPath);
        }

        const updatedInput: ToolInput = { ...input };

        if (candidatePaths.length > 0) {
          if (typeof grepInput.path === "string") {
            updatedInput.path = resolvedPaths[0];
          }

          if (Array.isArray(grepInput.paths)) {
            updatedInput.paths = resolvedPaths;
          }
        } else {
          updatedInput.path = this.allowedRoot;
        }

        return { behavior: "allow" as const, updatedInput };
      }

      default:
        return { behavior: "allow" as const, updatedInput: { ...input } };
    }
  }

  /**
   * Sanitizes tool input for logging by truncating long strings and limiting array/object size
   */
  private sanitizeInputPreview(input: unknown): unknown {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === "string") {
      return input.length > 200 ? `${input.slice(0, 200)}...` : input;
    }

    if (Array.isArray(input)) {
      return input.slice(0, 5).map((value) => this.sanitizeInputPreview(value));
    }

    if (typeof input === "object") {
      return Object.entries(input as Record<string, unknown>)
        .slice(0, 5)
        .reduce<Record<string, unknown>>((acc, [key, value]) => {
          acc[key] = this.sanitizeInputPreview(value);
          return acc;
        }, {});
    }

    return input;
  }

  /**
   * Normalizes a path (relative or absolute) to the allowed root and checks if it's within bounds
   */
  private normalizePathToAllowedRoot(rawPath: string): {
    resolvedPath: string;
    withinRoot: boolean;
  } {
    const resolvedPath = path.isAbsolute(rawPath)
      ? path.resolve(rawPath)
      : path.resolve(this.allowedRoot, rawPath);

    return {
      resolvedPath,
      withinRoot: this.isPathInsideAllowedRoot(resolvedPath),
    };
  }

  /**
   * Checks if a resolved path is inside the allowed root directory
   */
  private isPathInsideAllowedRoot(resolvedPath: string): boolean {
    const normalizedPath = path.resolve(resolvedPath);
    const allowedWithSep = this.allowedRoot.endsWith(path.sep)
      ? this.allowedRoot
      : `${this.allowedRoot}${path.sep}`;
    return (
      normalizedPath === this.allowedRoot ||
      normalizedPath.startsWith(allowedWithSep)
    );
  }

  /**
   * Checks if a path is a sensitive system path that should be blocked
   */
  private isSensitiveSystemPath(resolvedPath: string): boolean {
    const normalizedPath = path.resolve(resolvedPath);
    const blockedRoots = ["/proc", "/sys", "/dev", "/run", "/var/run"];

    return blockedRoots.some((blocked) => {
      const blockedWithSep = blocked.endsWith(path.sep)
        ? blocked
        : `${blocked}${path.sep}`;

      return (
        normalizedPath === blocked || normalizedPath.startsWith(blockedWithSep)
      );
    });
  }
}
