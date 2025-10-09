import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../loggers/SystemLogger.js";

export class InvalidProjectPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProjectPathError";
  }
}

export interface PrototypeFileInput {
  name: string;
  contents: string;
}

export interface PrototypeAssetInputWithContent {
  name: string;
  contents: string;
}

export async function installDependencies(
  projectDir: string,
  log2: SystemLogger
): Promise<void> {
  // Use dev-only logging so repeated npm chatter stays out of production logs.
  log2.consoleLogDevOnly("info", "Installing dependencies");

  return new Promise((resolve, reject) => {
    const npmProcess = spawn(
      "npm",
      ["install", "--prefer-offline", "--no-audit", "--no-fund"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          NODE_OPTIONS: "--max-old-space-size=2048",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";

    npmProcess.stdout.on("data", (data) => {
      stdout += data.toString();
      // Buffer output and log once after completion to avoid flooding CloudWatch.
    });

    npmProcess.stderr.on("data", (data) => {
      stderr += data.toString();
      // Buffer output and log once after completion to avoid flooding CloudWatch.
    });

    npmProcess.on("close", (code) => {
      if (code === 0) {
        const trimmedStdout = stdout.trim();
        const trimmedStderr = stderr.trim();
        if (trimmedStdout || trimmedStderr) {
          // Surface the combined npm output only in dev environments for easier debugging.
          log2.consoleLogDevOnly("debug", "npm install output", {
            stdout: trimmedStdout,
            stderr: trimmedStderr,
          });
        }
        // Keep success noise in dev logs so production success paths stay quiet.
        log2.consoleLogDevOnly("info", "Dependencies installed successfully");
        resolve();
      } else {
        const error = `npm install failed with exit code ${code}: ${stderr}`;
        log2.error(new Error(error), "Install dependencies failed", {
          code,
          stdout,
          stderr,
        });
        reject(new Error(error));
      }
    });

    npmProcess.on("error", (error) => {
      log2.error(error, "npm install process error");
      reject(error);
    });
  });
}

export async function writeProjectFiles(
  files: PrototypeFileInput[],
  assets: PrototypeAssetInputWithContent[],
  projectDir: string
): Promise<void> {
  // Handle text files
  for (const file of files) {
    const filePath = resolvePathWithinProject(projectDir, file.name);
    const fileDir = path.dirname(filePath);

    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, file.contents, "utf8");
  }

  // Handle binary assets
  for (const asset of assets) {
    const filePath = resolvePathWithinProject(projectDir, asset.name);
    const fileDir = path.dirname(filePath);

    await fs.mkdir(fileDir, { recursive: true });
    const binaryContent = Buffer.from(asset.contents, "base64");
    await fs.writeFile(filePath, binaryContent);
  }
}

export function resolvePathWithinProject(
  projectDir: string,
  relativePath: string,
): string {
  if (!relativePath) {
    throw new InvalidProjectPathError(
      "Path must not be empty when writing project files",
    );
  }

  if (relativePath.includes("\0")) {
    throw new InvalidProjectPathError("Path contains null bytes");
  }

  const normalizedProjectDir = path.resolve(projectDir);
  const resolvedTargetPath = path.resolve(normalizedProjectDir, relativePath);
  const relative = path.relative(normalizedProjectDir, resolvedTargetPath);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvalidProjectPathError(
      `Path ${relativePath} resolves outside of the project directory`,
    );
  }

  return resolvedTargetPath;
}
