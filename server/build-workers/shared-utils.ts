import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "./loggers/SystemLogger.js";

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
): Promise<void> {
  log2.info("Installing dependencies", { projectDir });

  const packageJsonPath = path.join(projectDir, "package.json");
  try {
    const packageJson = await fs.readFile(packageJsonPath, "utf8");
    const packageData = JSON.parse(packageJson);
    log2.info("Package.json found", {
      dependencies: Object.keys(packageData.dependencies || {}).length,
      devDependencies: Object.keys(packageData.devDependencies || {}).length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log2.error(
      new Error(errorMessage),
      "Failed to read package.json"
    );
    throw new Error("package.json not found or invalid");
  }

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
      },
    );

    let stdout = "";
    let stderr = "";

    npmProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      log2.debug("npm stdout", { output: output.trim() });
    });

    npmProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      log2.debug("npm stderr", { output: output.trim() });
    });

    npmProcess.on("close", (code) => {
      if (code === 0) {
        log2.info("Dependencies installed successfully");
        resolve();
      } else {
        const error = `npm install failed with exit code ${code}: ${stderr}`;
        log2.error(
          new Error(error),
          "Install dependencies failed",
          { code, stdout, stderr }
        );
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
  projectDir: string,
  log2?: SystemLogger,
): Promise<void> {
  // Handle text files
  for (const file of files) {
    const filePath = path.join(projectDir, file.name);
    const fileDir = path.dirname(filePath);

    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, file.contents, "utf8");
    log2?.debug("Wrote text file", {
      fileName: file.name,
      size: file.contents.length,
    });
  }

  // Handle binary assets
  for (const asset of assets) {
    const filePath = path.join(projectDir, asset.name);
    const fileDir = path.dirname(filePath);

    await fs.mkdir(fileDir, { recursive: true });
    const binaryContent = Buffer.from(asset.contents, "base64");
    await fs.writeFile(filePath, binaryContent);
    log2?.debug("Wrote binary asset", {
      fileName: asset.name,
      size: binaryContent.length,
    });
  }
}
