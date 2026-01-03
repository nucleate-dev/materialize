import {
  CanUseTool,
  Options,
  PermissionMode,
  PermissionResult,
  SettingSource,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import fs from "fs/promises";
import path from "path";
import { WORK_DIR, baseLogger } from "../../worker.js";
import { DesignSystemConstructorAgent } from "./DesignSystemConstructorAgent.js";
import { DESIGN_SYSTEM_CONSTRUCTOR_SYSTEM_PROMPT } from "./DesignSystemConstructorAgentPrompts.js";

const DESIGN_SYSTEM_OUTPUT_ROOT = "/tmp/design-system";
const DESIGN_SYSTEM_OUTPUT_DIRS = [
  DESIGN_SYSTEM_OUTPUT_ROOT,
  path.join(DESIGN_SYSTEM_OUTPUT_ROOT, "components"),
  path.join(DESIGN_SYSTEM_OUTPUT_ROOT, "screens"),
  path.join(DESIGN_SYSTEM_OUTPUT_ROOT, "themes"),
];

const ALLOWED_ROOTS = [WORK_DIR, DESIGN_SYSTEM_OUTPUT_ROOT];
const ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "TodoWrite",
];

type DesignSystemConstructionResult = {
  totalCostUsd: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export class ClaudeAgentSDKConstructor implements DesignSystemConstructorAgent {
  public async constructDesignSystem(): Promise<DesignSystemConstructionResult> {
    await Promise.all(
      DESIGN_SYSTEM_OUTPUT_DIRS.map((dir) =>
        fs.mkdir(dir, { recursive: true })
      ),
    );

    const canUseTool: CanUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
    ): Promise<PermissionResult> => {
      if (!ALLOWED_TOOLS.includes(toolName)) {
        return {
          behavior: "deny",
          message: `Tool ${toolName} is not permitted for design system construction.`,
          interrupt: true,
        };
      }

      const targetPaths = this.extractPaths(toolName, input);
      for (const targetPath of targetPaths) {
        if (!targetPath) {
          continue;
        }
        const resolvedPath = this.resolvePath(targetPath);
        if (!this.isPathAllowed(resolvedPath)) {
          return {
            behavior: "deny",
            message: `Path ${resolvedPath} is outside allowed roots.`,
            interrupt: true,
          };
        }
      }

      return {
        behavior: "allow",
        updatedInput: input,
      };
    };

    const options: Options = {
      cwd: WORK_DIR,
      additionalDirectories: [DESIGN_SYSTEM_OUTPUT_ROOT],
      tools: ALLOWED_TOOLS,
      allowedTools: ALLOWED_TOOLS,
      disallowedTools: ["Bash", "BashOutput", "NotebookEdit"],
      permissionMode: "default" as PermissionMode,
      canUseTool,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: DESIGN_SYSTEM_CONSTRUCTOR_SYSTEM_PROMPT,
      },
      settingSources: ["project", "user"] as SettingSource[],
      maxTurns: 50,
    };

    baseLogger.info("Starting design system construction run.", {
      cwd: WORK_DIR,
      outputRoot: DESIGN_SYSTEM_OUTPUT_ROOT,
    });

    const response = query({
      prompt: "Construct the design system from the repository now.",
      options,
    });

    let totalCostUsd: number | null = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for await (const message of response) {
      if (message.type === "result") {
        totalCostUsd = message.total_cost_usd ?? null;
        const usage = message.usage;
        if (usage) {
          const inputTokens = usage.input_tokens ?? 0;
          const outputTokens = usage.output_tokens ?? 0;
          const cacheReadInputTokens = usage.cache_read_input_tokens ?? 0;
          const cacheCreationInputTokens =
            usage.cache_creation_input_tokens ?? 0;
          const cacheCreationOutputTokens =
            usage.cache_creation_output_tokens ?? 0;

          totalInputTokens =
            inputTokens + cacheReadInputTokens + cacheCreationInputTokens;
          totalOutputTokens = outputTokens + cacheCreationOutputTokens;
        }
      }
    }

    return { totalCostUsd, totalInputTokens, totalOutputTokens };
  }

  private extractPaths(
    toolName: string,
    input: Record<string, unknown>,
  ): string[] {
    switch (toolName) {
      case "Read":
      case "Write":
      case "Edit": {
        const filePath = input.file_path;
        return typeof filePath === "string" ? [filePath] : [];
      }
      case "Glob": {
        const globPath = input.path;
        return typeof globPath === "string" ? [globPath] : [];
      }
      case "Grep": {
        const grepPath = input.path;
        const grepPaths = input.paths;
        const paths: string[] = [];
        if (typeof grepPath === "string") {
          paths.push(grepPath);
        }
        if (Array.isArray(grepPaths)) {
          for (const value of grepPaths) {
            if (typeof value === "string") {
              paths.push(value);
            }
          }
        }
        return paths;
      }
      default:
        return [];
    }
  }

  private resolvePath(targetPath: string): string {
    if (path.isAbsolute(targetPath)) {
      return path.resolve(targetPath);
    }
    return path.resolve(WORK_DIR, targetPath);
  }

  private isPathAllowed(resolvedPath: string): boolean {
    return ALLOWED_ROOTS.some((root) => {
      const normalizedRoot = root.endsWith(path.sep)
        ? root
        : `${root}${path.sep}`;
      return (
        resolvedPath === root || resolvedPath.startsWith(normalizedRoot)
      );
    });
  }
}
