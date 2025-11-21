import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { TerminalSession } from "../services/TerminalService.js";

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
  log2: SystemLogger,
  terminalSession: TerminalSession,
): Promise<void> {
  log2.info("Installing dependencies using terminal session");

  return new Promise((resolve, reject) => {
    let stdout = "";
    let installComplete = false;

    const timeout = setTimeout(() => {
      if (!installComplete) {
        installComplete = true;
        const error = "npm install timed out after 5 minutes";
        log2.error(new Error(error), "Install dependencies timeout");
        reject(new Error(error));
      }
    }, 300000); // 5 minute timeout

    const processOutput = (chunk: string): void => {
      const output = chunk.toString();
      stdout += output;

      // Check for successful completion
      if (
        output.includes("added") &&
        output.includes("packages") &&
        !installComplete
      ) {
        installComplete = true;
        clearTimeout(timeout);
        log2.info("Dependencies installed successfully");
        cleanup();
        resolve();
      }

      // Check for errors
      if (
        (output.includes("npm ERR!") || output.includes("ERESOLVE")) &&
        !installComplete
      ) {
        installComplete = true;
        clearTimeout(timeout);
        const error = `npm install failed: ${output}`;
        log2.error(new Error(error), "Install dependencies failed", {
          stdout,
        });
        cleanup();
        reject(new Error(error));
      }
    };

    // Set up listener on the PTY output
    const disposable = terminalSession.pty.onData(processOutput);

    const cleanup = (): void => {
      disposable.dispose();
    };

    // Build the command to run in the terminal
    const command = `cd ${projectDir} && NODE_OPTIONS="--max-old-space-size=2048" npm install --prefer-offline --no-audit --no-fund\n`;

    log2.info("Sending npm install command to terminal", {
      command: command.trim(),
      projectDir,
    });

    // Send the command to the terminal
    terminalSession.pty.write(command);

    // Wait a bit for command to execute and check for immediate errors
    setTimeout(() => {
      if (!installComplete) {
        // Give it more time, npm install can take a while
        log2.debug("npm install in progress...");
      }
    }, 5000);
  });
}

export async function writeProjectFiles(
  files: PrototypeFileInput[],
  assets: PrototypeAssetInputWithContent[],
  projectDir: string,
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
