import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

export interface Logger {
  log: (
    message: string,
    success?: boolean,
    output?: string,
    error?: string,
  ) => void;
}

export interface SimpleLogger {
  addLog: (message: string) => void;
}

export async function installDependencies(
  projectDir: string,
  logger: Logger | SimpleLogger,
): Promise<void> {
  if ("addLog" in logger) {
    logger.addLog("Installing dependencies...");
  } else {
    logger.log("Installing dependencies", true, `Project dir: ${projectDir}`);
  }

  const packageJsonPath = path.join(projectDir, "package.json");
  try {
    const packageJson = await fs.readFile(packageJsonPath, "utf8");
    const packageData = JSON.parse(packageJson);
    if ("log" in logger) {
      logger.log(
        "Package.json found",
        true,
        `Dependencies: ${Object.keys(packageData.dependencies || {}).length}, Dev dependencies: ${Object.keys(packageData.devDependencies || {}).length}`,
      );
    }
  } catch (error) {
    if ("log" in logger) {
      logger.log(
        "Package.json check",
        false,
        "",
        `Failed to read package.json: ${error}`,
      );
    } else {
      logger.addLog(`Failed to read package.json: ${error}`);
    }
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
      if ("addLog" in logger) {
        logger.addLog(`npm stdout: ${output.trim()}`);
      }
    });

    npmProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      if ("addLog" in logger) {
        logger.addLog(`npm stderr: ${output.trim()}`);
      }
    });

    npmProcess.on("close", (code) => {
      if (code === 0) {
        if ("addLog" in logger) {
          logger.addLog("Dependencies installed successfully");
        } else {
          logger.log("Dependencies installed successfully");
        }
        resolve();
      } else {
        const error = `npm install failed with exit code ${code}: ${stderr}`;
        if ("log" in logger) {
          logger.log("Install dependencies", false, stdout, stderr);
        } else {
          logger.addLog(error);
        }
        reject(new Error(error));
      }
    });

    npmProcess.on("error", (error) => {
      if ("addLog" in logger) {
        logger.addLog(`npm install process error: ${error.message}`);
      } else {
        logger.log("npm install process error", false, "", error.message);
      }
      reject(error);
    });
  });
}
