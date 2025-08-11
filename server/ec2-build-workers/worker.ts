import multipart from "@fastify/multipart";
import AWS, { S3 } from "aws-sdk";
import { ChildProcess, exec, spawn } from "child_process";
import dotenv from "dotenv";
import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { createReadStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import unzipper from "unzipper";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// --- Type Definitions and Interfaces ---

/**
 * Represents a single entry in the build log.
 */
interface BuildLogEntry {
  step: string;
  success: boolean;
  timestamp: string;
  output: string;
  error: string;
}

/**
 * Defines the successful result of the project build process.
 */
interface BuildResult {
  outputPath: string;
  buildLog: BuildLogEntry[];
  success: true;
}

/**
 * Custom error class for build failures to ensure build logs are attached.
 */
class BuildError extends Error {
  public buildLog: BuildLogEntry[];
  public buildFailed: boolean;

  constructor(message: string, buildLog: BuildLogEntry[]) {
    super(message);
    this.name = "BuildError";
    this.buildLog = buildLog;
    this.buildFailed = true;
  }
}

/**
 * Describes a file that failed to upload.
 */
interface FailedUpload {
  path?: string;
  key?: string;
  filename?: string;
  error: string;
}

/**
 * Custom error for handling partial successes in S3 uploads.
 */
class S3UploadError extends Error {
  public failedUploads: FailedUpload[];
  public successfulUploads: S3.ManagedUpload.SendData[];

  constructor(
    message: string,
    failed: FailedUpload[],
    succeeded: S3.ManagedUpload.SendData[],
  ) {
    super(message);
    this.name = "S3UploadError";
    this.failedUploads = failed;
    this.successfulUploads = succeeded;
  }
}

/**
 * Holds information about a successfully uploaded file.
 */
interface UploadedFileInfo {
  filename: string;
  s3Location: string;
  key: string;
  localPath?: string;
}

/**
 * Tracks the state of a running Expo development server.
 */
interface DevServerInfo {
  prototypeId: string;
  jobId: string;
  process: ChildProcess;
  projectDir: string;
  tempDir: string;
  tunnelUrl: string | null;
  startTime: Date;
  logs: string[];
}

// --- Type Definitions for API Payloads ---

interface BuildRequestBody {
  prototypeId: string;
  write_to_disk?: boolean;
}

interface DevServerParams {
  prototypeId: string;
}

/**
 * Enhanced npm install with real-time logging and progress monitoring
 */
async function verboseNpmInstall(
  projectDir: string,
  logStep: Function,
): Promise<void> {
  const startTime = Date.now();
  const npmCacheDir = path.join(BUILD_TEMP_DIR, ".npm-cache");
  await fs.mkdir(npmCacheDir, { recursive: true });

  logStep("Starting npm install", true, `Project dir: ${projectDir}`);

  // Check what we're about to install
  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectDir, "package.json"), "utf8"),
    );
    const depCount =
      Object.keys(packageJson.dependencies || {}).length +
      Object.keys(packageJson.devDependencies || {}).length;
    logStep(
      "Package analysis",
      true,
      `Found ${depCount} direct dependencies\n` +
        `Dependencies: ${Object.keys(packageJson.dependencies || {})
          .slice(0, 5)
          .join(
            ", ",
          )}${Object.keys(packageJson.dependencies || {}).length > 5 ? "..." : ""}\n` +
        `DevDependencies: ${Object.keys(packageJson.devDependencies || {})
          .slice(0, 5)
          .join(
            ", ",
          )}${Object.keys(packageJson.devDependencies || {}).length > 5 ? "..." : ""}`,
    );
  } catch (error: any) {
    logStep("Package analysis failed", false, "", error.message);
  }

  // Use spawn for real-time output
  const npmArgs = [
    "ci",
    // `--cache`,
    // npmCacheDir,
    "--prefer-offline",
    "--no-audit",
    "--no-fund",
    "--maxsockets",
    "10",
    "--fetch-retry-maxtimeout",
    "120000",
    "--fetch-retry-mintimeout",
    "20000",
    "--fetch-timeout",
    "300000",
    "--loglevel",
    "info", // More verbose for debugging
    "--timing", // Show timing information
    "--progress",
    "true", // Show progress
  ];

  const env = {
    ...process.env,
    CI: "1",
    NODE_OPTIONS: "--max-old-space-size=1536",
    NPM_CONFIG_MAXSOCKETS: "8",
  };

  logStep("npm command", true, `npm ${npmArgs.join(" ")}`);

  return new Promise((resolve, reject) => {
    const npmProcess = spawn("npm", npmArgs, {
      cwd: projectDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let lastProgress = Date.now();
    let packageCount = 0;
    let currentPackage = "";

    // Monitor stdout for progress
    npmProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;

      // Log interesting lines in real-time
      const lines = output.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Track package installations
        if (trimmed.includes("npm info")) {
          const match = trimmed.match(/npm info\s+(\S+)/);
          if (match) {
            currentPackage = match[1];
            packageCount++;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(
              `[${elapsed}s] Installing package ${packageCount}: ${currentPackage}`,
            );
          }
        }

        // Track download progress
        else if (trimmed.includes("fetch")) {
          console.log(`[FETCH] ${trimmed}`);
        }

        // Track extraction
        else if (trimmed.includes("extract")) {
          console.log(`[EXTRACT] ${trimmed}`);
        }

        // Track builds
        else if (trimmed.includes("build") || trimmed.includes("rebuild")) {
          console.log(`[BUILD] ${trimmed}`);
        }

        // Track timing info
        else if (trimmed.includes("Timing")) {
          console.log(`[TIMING] ${trimmed}`);
        }

        // Track warnings/errors
        else if (trimmed.includes("WARN") || trimmed.includes("ERROR")) {
          console.log(
            `[${trimmed.includes("WARN") ? "WARN" : "ERROR"}] ${trimmed}`,
          );
        }

        // Track progress percentage
        else if (trimmed.includes("%") && trimmed.includes("/")) {
          console.log(`[PROGRESS] ${trimmed}`);
        }
      }

      lastProgress = Date.now();
    });

    // Monitor stderr
    npmProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;

      // Log stderr in real-time (often contains useful progress info)
      const lines = output.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          console.log(`[STDERR] ${trimmed}`);
        }
      }

      lastProgress = Date.now();
    });

    // Timeout handler - kill if no progress for too long
    const progressTimeout = setInterval(() => {
      const timeSinceProgress = Date.now() - lastProgress;
      const totalTime = Date.now() - startTime;

      if (timeSinceProgress > 120000) {
        // 2 minutes of no output
        console.log(
          `[TIMEOUT] No output for ${(timeSinceProgress / 1000).toFixed(0)}s, killing npm process`,
        );
        clearInterval(progressTimeout);
        npmProcess.kill("SIGTERM");
        setTimeout(() => npmProcess.kill("SIGKILL"), 5000);
        reject(
          new Error(
            `npm install timed out after ${(timeSinceProgress / 1000).toFixed(0)}s of inactivity (total time: ${(totalTime / 1000).toFixed(0)}s)`,
          ),
        );
      } else if (totalTime > 600000) {
        // 10 minute absolute timeout
        console.log(`[ABSOLUTE TIMEOUT] npm install exceeded 10 minutes`);
        clearInterval(progressTimeout);
        npmProcess.kill("SIGTERM");
        setTimeout(() => npmProcess.kill("SIGKILL"), 5000);
        reject(new Error(`npm install exceeded 10 minute absolute timeout`));
      }
    }, 10000); // Check every 10 seconds

    npmProcess.on("close", (code) => {
      clearInterval(progressTimeout);
      const totalTime = Date.now() - startTime;
      const timeStr = (totalTime / 1000).toFixed(1);

      if (code === 0) {
        logStep(
          "Install dependencies",
          true,
          `Completed successfully in ${timeStr}s\n` +
            `Packages processed: ${packageCount}\n` +
            `Last package: ${currentPackage}\n` +
            `--- STDOUT ---\n${stdout}\n` +
            `--- STDERR ---\n${stderr}`,
          "",
        );
        resolve();
      } else {
        logStep(
          "Install dependencies",
          false,
          `Failed with exit code ${code} after ${timeStr}s\n` +
            `Packages processed: ${packageCount}\n` +
            `Last package: ${currentPackage}\n` +
            `--- STDOUT ---\n${stdout}`,
          `Exit code: ${code}\n--- STDERR ---\n${stderr}`,
        );
        reject(new Error(`npm install failed with exit code ${code}`));
      }
    });

    npmProcess.on("error", (error) => {
      clearInterval(progressTimeout);
      const totalTime = Date.now() - startTime;
      logStep(
        "Install dependencies",
        false,
        `Process error after ${(totalTime / 1000).toFixed(1)}s\n` +
          `Packages processed: ${packageCount}\n` +
          `--- STDOUT ---\n${stdout}`,
        `Process error: ${error.message}\n--- STDERR ---\n${stderr}`,
      );
      reject(error);
    });

    // Log system resources periodically during install
    const resourceMonitor = setInterval(async () => {
      try {
        const memInfo = await execAsync('free -m | grep "^Mem:"');
        const [, total, used, free, shared, buffers, available] =
          memInfo.stdout.split(/\s+/);
        console.log(
          `[RESOURCES] Memory: ${used}/${total}MB used, ${available}MB available`,
        );

        // Check if we're swapping
        const swapInfo = await execAsync('free -m | grep "^Swap:"');
        const [, swapTotal, swapUsed] = swapInfo.stdout.split(/\s+/);
        if (parseInt(swapUsed) > 0) {
          console.log(
            `[RESOURCES] WARNING: Swapping detected! ${swapUsed}MB swap used`,
          );
        }
      } catch (e) {
        // Ignore resource monitoring errors
      }
    }, 30000); // Every 30 seconds

    npmProcess.on("close", () => clearInterval(resourceMonitor));
    npmProcess.on("error", () => clearInterval(resourceMonitor));
  });
}

/**
 * Verbose Expo build with real-time logging and progress monitoring
 */
async function verboseExpoBuild(
  projectDir: string,
  logStep: Function,
): Promise<void> {
  const startTime = Date.now();

  logStep("Starting Expo build", true, `Project dir: ${projectDir}`);

  // Pre-build analysis
  try {
    const appJsonPath = path.join(projectDir, "app.json");
    const expoConfigPath = path.join(projectDir, "expo.json");

    let config = null;
    if (
      await fs
        .access(appJsonPath)
        .then(() => true)
        .catch(() => false)
    ) {
      config = JSON.parse(await fs.readFile(appJsonPath, "utf8"));
      logStep(
        "Expo config",
        true,
        `Found app.json with name: ${config.expo?.name || config.name}`,
      );
    } else if (
      await fs
        .access(expoConfigPath)
        .then(() => true)
        .catch(() => false)
    ) {
      config = JSON.parse(await fs.readFile(expoConfigPath, "utf8"));
      logStep("Expo config", true, `Found expo.json with name: ${config.name}`);
    }

    if (config) {
      const expo = config.expo || config;
      logStep(
        "Expo app info",
        true,
        `Name: ${expo.name}\n` +
          `SDK Version: ${expo.sdkVersion}\n` +
          `Platform: ${expo.platforms?.join(", ") || "not specified"}\n` +
          `Web bundler: ${expo.web?.bundler || "default"}`,
      );
    }
  } catch (error: any) {
    logStep("Config analysis failed", false, "", error.message);
  }

  // Check for common issues before building
  await prebuildChecks(projectDir, logStep);

  const expoArgs = [
    "export",
    "--platform",
    "web",
    "--non-interactive",
    "--max-workers",
    "2", // Limit workers for t3a.small
  ];

  const env = {
    ...process.env,
    CI: "1",
    EXPO_NO_TELEMETRY: "1",
    NODE_OPTIONS: "--max-old-space-size=1536",
    // Enable more verbose webpack output
    EXPO_DEBUG: "1",
    DEBUG: "expo:*",
  };

  logStep("Expo command", true, `npx expo ${expoArgs.join(" ")}`);

  return new Promise((resolve, reject) => {
    const expoProcess = spawn("npx", ["expo", ...expoArgs], {
      cwd: projectDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let lastProgress = Date.now();
    let buildPhase = "starting";
    let bundleProgress = 0;

    // Monitor stdout for build progress
    expoProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;

      const lines = output.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Track build phases
        if (trimmed.includes("Starting Metro")) {
          buildPhase = "metro-starting";
          console.log(`[EXPO] 🚇 Starting Metro bundler...`);
        } else if (trimmed.includes("Metro waiting")) {
          buildPhase = "metro-waiting";
          console.log(`[EXPO] ⏳ Metro waiting for connections...`);
        } else if (trimmed.includes("Bundling")) {
          buildPhase = "bundling";
          console.log(`[EXPO] 📦 Bundling JavaScript...`);
        } else if (trimmed.includes("Optimizing")) {
          buildPhase = "optimizing";
          console.log(`[EXPO] ⚡ Optimizing bundle...`);
        } else if (trimmed.includes("Exporting")) {
          buildPhase = "exporting";
          console.log(`[EXPO] 📁 Exporting static files...`);
        } else if (trimmed.includes("Export completed")) {
          buildPhase = "completed";
          console.log(`[EXPO] ✅ Export completed!`);
        }

        // Track bundle progress
        else if (trimmed.includes("%") && trimmed.includes("bundle")) {
          const progressMatch = trimmed.match(/(\d+)%/);
          if (progressMatch) {
            bundleProgress = parseInt(progressMatch[1]);
            console.log(`[EXPO] 📊 Bundle progress: ${bundleProgress}%`);
          }
        }

        // Track file processing
        else if (
          trimmed.includes("transform[") ||
          trimmed.includes("Transforming")
        ) {
          console.log(`[EXPO] 🔄 ${trimmed}`);
        }

        // Track asset processing
        else if (trimmed.includes("asset") && trimmed.includes("copying")) {
          console.log(`[EXPO] 📷 ${trimmed}`);
        }

        // Track warnings
        else if (trimmed.includes("warn") || trimmed.includes("WARNING")) {
          console.log(`[EXPO WARN] ⚠️  ${trimmed}`);
        }

        // Track errors
        else if (
          trimmed.includes("error") ||
          trimmed.includes("ERROR") ||
          trimmed.includes("Failed")
        ) {
          console.log(`[EXPO ERROR] ❌ ${trimmed}`);
        }

        // Track dependency resolution
        else if (
          trimmed.includes("Resolving") ||
          trimmed.includes("resolved")
        ) {
          console.log(`[EXPO] 🔍 ${trimmed}`);
        }

        // Track webpack output
        else if (trimmed.includes("webpack") || trimmed.includes("chunks")) {
          console.log(`[WEBPACK] 📦 ${trimmed}`);
        }

        // Track general progress
        else if (trimmed.length > 10 && !trimmed.includes("undefined")) {
          console.log(`[EXPO] ${trimmed}`);
        }
      }

      lastProgress = Date.now();
    });

    // Monitor stderr
    expoProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;

      const lines = output.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          // Metro/Expo often outputs useful info to stderr
          if (
            trimmed.includes("Metro") ||
            trimmed.includes("expo") ||
            trimmed.includes("Bundling")
          ) {
            console.log(`[EXPO STDERR] ${trimmed}`);
          } else if (trimmed.includes("warn") || trimmed.includes("WARN")) {
            console.log(`[EXPO WARN] ⚠️  ${trimmed}`);
          } else if (trimmed.includes("error") || trimmed.includes("ERROR")) {
            console.log(`[EXPO ERROR] ❌ ${trimmed}`);
          } else {
            console.log(`[EXPO DEBUG] ${trimmed}`);
          }
        }
      }

      lastProgress = Date.now();
    });

    // Enhanced timeout handler
    const progressTimeout = setInterval(() => {
      const timeSinceProgress = Date.now() - lastProgress;
      const totalTime = Date.now() - startTime;

      console.log(
        `[EXPO STATUS] Phase: ${buildPhase}, Bundle: ${bundleProgress}%, Time: ${(totalTime / 1000).toFixed(0)}s, Idle: ${(timeSinceProgress / 1000).toFixed(0)}s`,
      );

      if (timeSinceProgress > 180000) {
        // 3 minutes of no output (Expo can be slow)
        console.log(
          `[EXPO TIMEOUT] No output for ${(timeSinceProgress / 1000).toFixed(0)}s in phase '${buildPhase}', killing process`,
        );
        clearInterval(progressTimeout);
        expoProcess.kill("SIGTERM");
        setTimeout(() => expoProcess.kill("SIGKILL"), 5000);
        reject(
          new Error(
            `Expo build timed out after ${(timeSinceProgress / 1000).toFixed(0)}s of inactivity in phase '${buildPhase}' (total time: ${(totalTime / 1000).toFixed(0)}s)`,
          ),
        );
      } else if (totalTime > 900000) {
        // 15 minute absolute timeout
        console.log(`[EXPO ABSOLUTE TIMEOUT] Build exceeded 15 minutes`);
        clearInterval(progressTimeout);
        expoProcess.kill("SIGTERM");
        setTimeout(() => expoProcess.kill("SIGKILL"), 5000);
        reject(new Error(`Expo build exceeded 15 minute absolute timeout`));
      }
    }, 15000); // Check every 15 seconds

    expoProcess.on("close", (code) => {
      clearInterval(progressTimeout);
      const totalTime = Date.now() - startTime;
      const timeStr = (totalTime / 1000).toFixed(1);

      if (code === 0) {
        logStep(
          "Expo export",
          true,
          `✅ Completed successfully in ${timeStr}s\n` +
            `Final phase: ${buildPhase}\n` +
            `Bundle progress: ${bundleProgress}%\n` +
            `--- STDOUT ---\n${stdout}\n` +
            `--- STDERR ---\n${stderr}`,
          "",
        );
        resolve();
      } else {
        logStep(
          "Expo export",
          false,
          `❌ Failed with exit code ${code} after ${timeStr}s\n` +
            `Failed in phase: ${buildPhase}\n` +
            `Bundle progress: ${bundleProgress}%\n` +
            `--- STDOUT ---\n${stdout}`,
          `Exit code: ${code}\n--- STDERR ---\n${stderr}`,
        );
        reject(
          new Error(
            `Expo build failed with exit code ${code} in phase '${buildPhase}'`,
          ),
        );
      }
    });

    expoProcess.on("error", (error) => {
      clearInterval(progressTimeout);
      const totalTime = Date.now() - startTime;
      logStep(
        "Expo export",
        false,
        `💥 Process error after ${(totalTime / 1000).toFixed(1)}s\n` +
          `Phase when failed: ${buildPhase}\n` +
          `--- STDOUT ---\n${stdout}`,
        `Process error: ${error.message}\n--- STDERR ---\n${stderr}`,
      );
      reject(error);
    });

    // Monitor system resources during build
    const resourceMonitor = setInterval(async () => {
      try {
        const memInfo = await execAsync('free -m | grep "^Mem:"');
        const [, total, used, free, shared, buffers, available] =
          memInfo.stdout.split(/\s+/);
        console.log(
          `[EXPO RESOURCES] Memory: ${used}/${total}MB used, ${available}MB available (Phase: ${buildPhase})`,
        );

        if (parseInt(available) < 200) {
          console.log(
            `[EXPO RESOURCES] ⚠️  LOW MEMORY WARNING: Only ${available}MB available!`,
          );
        }
      } catch (e) {
        // Ignore resource monitoring errors
      }
    }, 45000); // Every 45 seconds

    expoProcess.on("close", () => clearInterval(resourceMonitor));
    expoProcess.on("error", () => clearInterval(resourceMonitor));
  });
}

/**
 * Pre-build checks to catch common issues early
 */
async function prebuildChecks(
  projectDir: string,
  logStep: Function,
): Promise<void> {
  const checks = [];

  // Check for package.json
  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectDir, "package.json"), "utf8"),
    );
    checks.push(`✅ package.json found`);

    if (packageJson.dependencies?.expo) {
      checks.push(`✅ Expo dependency found: ${packageJson.dependencies.expo}`);
    } else {
      checks.push(`⚠️  No Expo dependency in package.json`);
    }

    if (packageJson.main) {
      checks.push(`✅ Entry point: ${packageJson.main}`);
    }
  } catch (error: any) {
    checks.push(`❌ package.json issue: ${error.message}`);
  }

  // Check for node_modules
  try {
    await fs.stat(path.join(projectDir, "node_modules"));
    checks.push(`✅ node_modules exists`);
  } catch (error) {
    checks.push(`❌ node_modules missing`);
  }

  // Check for common required files
  const requiredFiles = ["App.js", "App.jsx", "App.ts", "App.tsx", "index.js"];
  let foundEntryPoint = false;
  for (const file of requiredFiles) {
    try {
      await fs.stat(path.join(projectDir, file));
      checks.push(`✅ Entry point found: ${file}`);
      foundEntryPoint = true;
      break;
    } catch (error) {
      // Continue checking
    }
  }
  if (!foundEntryPoint) {
    checks.push(
      `⚠️  No common entry point found (${requiredFiles.join(", ")})`,
    );
  }

  // Check for metro config
  const metroConfigs = ["metro.config.js", "metro.config.json"];
  for (const config of metroConfigs) {
    try {
      await fs.stat(path.join(projectDir, config));
      checks.push(`✅ Metro config: ${config}`);
      break;
    } catch (error) {
      // Continue checking
    }
  }

  logStep("Pre-build checks", true, checks.join("\n"));
}

// --- Initializations ---

const fastifyApp: FastifyInstance = fastify({ logger: true });

// Register multipart plugin
fastifyApp.register(multipart);

// Configure AWS S3
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
  httpOptions: {
    timeout: 300000, // 5 minutes
    connectTimeout: 60000, // 1 minute
  },
  maxRetries: 3,
  retryDelayOptions: {
    customBackoff: function (retryCount: number) {
      return Math.pow(2, retryCount) * 1000; // Exponential backoff
    },
  },
});

const s3 = new AWS.S3();
const BUCKET_NAME = "materialize-sites";
const execAsync = promisify(exec);

const PORT = parseInt(process.env.PORT || "3002", 10);
const PROTOTYPES_DIR = process.env.PROTOTYPES_DIR || "./prototypes";
const BUILD_TEMP_DIR =
  process.env.BUILD_TEMP_DIR || path.join(os.homedir(), "build-worker", "temp");

// Track running dev servers
const runningDevServers = new Map<string, DevServerInfo>();

// --- Utility Functions ---

/**
 * Cleans up old temporary files and build artifacts to free up disk space
 */
async function cleanupOldFiles(): Promise<void> {
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  const now = Date.now();

  try {
    // Clean up build temp directories
    await fs.mkdir(BUILD_TEMP_DIR, { recursive: true }); // Ensure directory exists
    const tmpEntries = await fs.readdir(BUILD_TEMP_DIR);
    for (const entryName of tmpEntries) {
      if (
        entryName.startsWith("build-") ||
        entryName.startsWith("extract-build-")
      ) {
        const fullPath = path.join(BUILD_TEMP_DIR, entryName);
        try {
          const stats = await fs.stat(fullPath);
          if (!stats.isDirectory()) continue;
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.rm(fullPath, { recursive: true, force: true });
            console.log(`Cleaned up old temp directory: ${fullPath}`);
          }
        } catch (error) {
          // Ignore errors for individual files
        }
      }
    }

    // Clean up old prototypes directories if they exist
    try {
      const prototypeEntries = await fs.readdir(PROTOTYPES_DIR);
      for (const entryName of prototypeEntries) {
        const fullPath = path.join(PROTOTYPES_DIR, entryName);
        try {
          const stats = await fs.stat(fullPath);
          if (!stats.isDirectory()) continue;
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.rm(fullPath, { recursive: true, force: true });
            console.log(`Cleaned up old prototype directory: ${fullPath}`);
          }
        } catch (error) {
          // Ignore errors for individual directories
        }
      }
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error(
          "Error during prototype directory cleanup:",
          error.message,
        );
      }
      // Ignore error if the main prototypes directory doesn't exist
    }
  } catch (error: any) {
    console.error("Error during cleanup:", error.message);
  }
}

/**
 * Builds the Expo project for the web platform.
 * @param projectPath - The local path to the project source code.
 * @param prototypeId - The unique identifier for the prototype.
 * @returns A promise that resolves with the build result.
 */
async function buildProject(
  projectPath: string,
  prototypeId: string,
): Promise<BuildResult> {
  const tempDir = path.join(BUILD_TEMP_DIR, `build-${prototypeId}`);
  const buildLog: BuildLogEntry[] = [];

  // Cleanup any existing temp directory first
  await fs.rm(tempDir, { recursive: true, force: true });

  const logStep = (
    step: string,
    success = true,
    output = "",
    error = "",
  ): void => {
    const logEntry: BuildLogEntry = {
      step,
      success,
      timestamp: new Date().toISOString(),
      output: output.toString().trim(),
      error: error.toString().trim(),
    };
    buildLog.push(logEntry);
    console.log(
      `[${step}] ${success ? "✓" : "✗"} ${success ? "Success" : "Failed"}`,
    );
    if (output) console.log(`Output: ${output}`);
    if (error) console.error(`Error: ${error}`);
  };

  try {
    await fs.mkdir(tempDir, { recursive: true });
    logStep("Create build directory", true, `Created: ${tempDir}`);

    await fs.cp(projectPath, tempDir, { recursive: true });
    logStep(
      "Copy project files",
      true,
      `Copied from ${projectPath} to ${tempDir}`,
    );

    // Check available disk space before installing dependencies
    try {
      const { stdout: dfOutput } = await execAsync(
        `df ${BUILD_TEMP_DIR} --output=avail`,
        { cwd: tempDir },
      );
      const availableKB = parseInt(dfOutput.split("\n")[1].trim());
      const availableMB = Math.floor(availableKB / 1024);
      logStep("Check disk space", true, `Available space: ${availableMB}MB`);

      if (availableMB < 500) {
        // Less than 500MB available
        throw new Error(
          `Insufficient disk space: only ${availableMB}MB available. Need at least 500MB.`,
        );
      }
    } catch (error: any) {
      if (error.message.includes("Insufficient disk space")) {
        logStep("Check disk space", false, "", error.message);
        throw error;
      }
      // If df command fails, continue (might be different system)
      logStep(
        "Check disk space",
        true,
        "Unable to check disk space, proceeding",
      );
    }

    console.log(`Installing dependencies for build ${prototypeId}...`);
    try {
      await verboseNpmInstall(tempDir, logStep);
    } catch (error: any) {
      // Always cleanup on install failure to free up space
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }

    // Expo CLI is pre-installed globally during EC2 setup

    console.log(`Building Expo project for web platform...`);
    try {
      await verboseExpoBuild(tempDir, logStep);
    } catch (error: any) {
      throw error;
    }

    const expoDistPath = path.join(tempDir, "dist");
    try {
      await fs.stat(expoDistPath);
    } catch (error) {
      const errorMsg = "Expo export did not create dist folder";
      logStep("Verify build output", false, "", errorMsg);
      throw new Error(errorMsg);
    }

    logStep(
      "Verify build output",
      true,
      `Build output found at: ${expoDistPath}`,
    );
    console.log(`Expo build completed successfully for ${prototypeId}`);

    return {
      outputPath: expoDistPath,
      buildLog,
      success: true,
    };
  } catch (error: any) {
    console.error(`Build error for ${prototypeId}:`, error.message);
    // Cleanup on error before throwing
    await fs
      .rm(tempDir, { recursive: true, force: true })
      .catch((cleanupError) => {
        console.error(
          `Failed to cleanup temp dir ${tempDir}:`,
          cleanupError.message,
        );
      });
    throw new BuildError(error.message, buildLog);
  }
}

/**
 * Recursively uploads a directory's contents to an S3 bucket.
 * @param localPath - The local directory path to upload from.
 * @param s3KeyPrefix - The prefix to use for the S3 object keys.
 * @returns A promise that resolves with an array of S3 upload results.
 */
async function uploadDirectoryToS3(
  localPath: string,
  s3KeyPrefix: string,
): Promise<S3.ManagedUpload.SendData[]> {
  console.log(
    `Starting upload for directory: ${localPath} with prefix: ${s3KeyPrefix}`,
  );

  let files: string[];
  try {
    files = await fs.readdir(localPath);
  } catch (error: any) {
    console.error(`Failed to read directory ${localPath}:`, error.message);
    throw error;
  }

  console.log(`Found ${files.length} items in ${localPath}:`, files);

  const uploadResults: S3.ManagedUpload.SendData[] = [];
  const failedUploads: FailedUpload[] = [];

  // Add retry logic for individual file uploads
  const maxRetries = 3;

  for (const fileName of files) {
    const localFilePath = path.join(localPath, fileName);
    const s3Key = `${s3KeyPrefix}/${fileName}`;

    console.log(`Processing item: ${localFilePath}`);

    let stats;
    try {
      stats = await fs.stat(localFilePath);
    } catch (error: any) {
      console.error(`Failed to stat ${localFilePath}:`, error.message);
      failedUploads.push({
        path: localFilePath,
        error: `Failed to stat file: ${error.message}`,
      });
      continue;
    }

    if (stats.isDirectory()) {
      console.log(`Recursing into subdirectory: ${localFilePath}`);
      try {
        const subDirResults = await uploadDirectoryToS3(localFilePath, s3Key);
        uploadResults.push(...subDirResults);
        console.log(
          `Completed subdirectory ${localFilePath}, added ${subDirResults.length} files`,
        );
      } catch (error: any) {
        console.error(
          `Error processing subdirectory ${localFilePath}:`,
          error.message,
        );
        if (error instanceof S3UploadError) {
          failedUploads.push(...error.failedUploads);
          if (error.successfulUploads) {
            uploadResults.push(...error.successfulUploads);
          }
        } else {
          failedUploads.push({
            path: localFilePath,
            error: `Subdirectory processing failed: ${error.message}`,
          });
        }
      }
    } else if (stats.isFile()) {
      console.log(`Uploading file: ${localFilePath} to S3 key: ${s3Key}`);
      try {
        // Check file size before reading
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`File size: ${fileSizeMB}MB`);

        // For large files (>5MB), use streaming upload instead of buffer
        const useStream = stats.size > 5 * 1024 * 1024;

        let uploadResult: S3.ManagedUpload.SendData;
        let retryCount = 0;

        while (retryCount <= maxRetries) {
          try {
            console.log(
              `Upload attempt ${retryCount + 1} for ${fileName} (${fileSizeMB}MB)${useStream ? " using stream" : " using buffer"}`,
            );

            let uploadParams;
            if (useStream) {
              // Use stream for large files to avoid memory issues
              const fileStream = createReadStream(localFilePath);
              uploadParams = {
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: fileStream,
                ContentType: getContentType(fileName),
              };
            } else {
              // Use buffer for smaller files
              const fileBuffer = await fs.readFile(localFilePath);
              console.log(
                `Read file ${localFilePath}, size: ${fileBuffer.length} bytes`,
              );
              uploadParams = {
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: fileBuffer,
                ContentType: getContentType(fileName),
              };
            }

            // Add timeout to the upload promise
            const uploadPromise = s3.upload(uploadParams).promise();
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(
                () => reject(new Error("Upload timeout after 5 minutes")),
                5 * 60 * 1000,
              );
            });

            uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
            console.log(`Upload completed successfully for ${fileName}`);
            break; // Success, exit retry loop
          } catch (uploadError: any) {
            retryCount++;
            console.log(
              `Upload attempt ${retryCount} failed for ${localFilePath}: ${uploadError.message}`,
            );

            if (retryCount > maxRetries) {
              throw uploadError; // Give up after max retries
            }

            // Wait before retrying (exponential backoff)
            const delay = Math.pow(2, retryCount) * 1000;
            console.log(`Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        uploadResults.push(uploadResult!);
        console.log(
          `Successfully uploaded ${localFilePath} to S3 after ${retryCount} retries (${fileSizeMB}MB)`,
        );
      } catch (error: any) {
        console.error(
          `Failed to upload ${localFilePath} to S3 after ${maxRetries} retries:`,
          error.message,
        );
        failedUploads.push({
          path: localFilePath,
          key: s3Key,
          error: `${error.message} (after ${maxRetries} retries)`,
        });
      }
    } else {
      console.log(`Skipping non-file/non-directory item: ${localFilePath}`);
      // Skip symbolic links, sockets, etc.
      continue;
    }
  }

  console.log(`Completed processing directory ${localPath}:`);
  console.log(`- Successful uploads: ${uploadResults.length}`);
  console.log(`- Failed uploads: ${failedUploads.length}`);

  if (failedUploads.length > 0) {
    console.log("Failed uploads details:", failedUploads);
    const errorMessage = `Failed to upload ${failedUploads.length} files to S3`;
    throw new S3UploadError(errorMessage, failedUploads, uploadResults);
  }

  console.log("uploadResults", uploadResults);
  return uploadResults;
}

/**
 * Determines the MIME content type of a file based on its extension.
 * @param filename - The name of the file.
 * @returns The corresponding content type string.
 */
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: { [key: string]: string } = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };
  return contentTypes[ext] || "application/octet-stream";
}

/**
 * Extracts a zip file to a temporary directory for building.
 * @param zipBuffer - The buffer containing the zip file data.
 * @param prototypeId - The ID of the prototype.
 * @param writeToDisk - Whether to also save the source files to the persistent prototypes directory.
 * @returns An object containing the paths to the extracted content and the temporary directory.
 */
async function extractZipForBuilding(
  zipBuffer: Buffer,
  prototypeId: string,
  writeToDisk = false,
): Promise<{ extractDir: string; tempDir: string }> {
  const tempDir = path.join(BUILD_TEMP_DIR, `extract-build-${uuidv4()}`);
  const zipPath = path.join(tempDir, "upload.zip");

  console.log(`Extracting zip file for building to ${tempDir}`);
  console.log(`Zip buffer size: ${zipBuffer.length} bytes`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(zipPath, zipBuffer);

    const extractDir = path.join(tempDir, "extracted");
    await fs.mkdir(extractDir, { recursive: true });

    console.log(`Created extract directory: ${extractDir}`);

    // Extract zip file using buffer approach
    try {
      const zipFileBuffer = await fs.readFile(zipPath);
      const directory = await unzipper.Open.buffer(zipFileBuffer);

      for (const file of directory.files) {
        if (file.type === "File") {
          const filePath = path.join(extractDir, file.path);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          const content = await file.buffer();
          await fs.writeFile(filePath, content);
        }
      }
      console.log("Zip extraction completed using buffer method");
    } catch (error: any) {
      console.error(
        "Buffer extraction failed, trying stream method:",
        error.message,
      );

      // Fallback to stream method
      await new Promise((resolve, reject) => {
        const extractStream = unzipper.Extract({ path: extractDir });

        extractStream.on("close", () => {
          console.log("Zip extraction completed using stream method");
          resolve(true);
        });

        extractStream.on("error", (error: any) => {
          console.error("Stream extraction error:", error);
          reject(error);
        });

        createReadStream(zipPath).pipe(extractStream);
      });
    }

    // Check what was extracted
    const extractedContents = await fs.readdir(extractDir);
    console.log(
      `Extracted ${extractedContents.length} items:`,
      extractedContents,
    );

    if (writeToDisk) {
      const savedFiles: { filename: string; localPath: string }[] = [];
      await saveFilesToDisk(extractDir, "", prototypeId, savedFiles);
      console.log(
        `Successfully saved ${savedFiles.length} source files to local disk`,
      );
    }

    return { extractDir, tempDir };
  } catch (error) {
    console.error("extractZipForBuilding error:", error);
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Saves extracted files to a persistent local disk location.
 * @param dirPath - The directory containing files to save.
 * @param relativePath - The current relative path within the directory structure.
 * @param prototypeId - The ID of the prototype.
 * @param savedFiles - An array to accumulate information about saved files.
 */
async function saveFilesToDisk(
  dirPath: string,
  relativePath: string,
  prototypeId: string,
  savedFiles: { filename: string; localPath: string }[],
): Promise<void> {
  const prototypesDir = path.resolve(PROTOTYPES_DIR, prototypeId, "files");
  await fs.mkdir(prototypesDir, { recursive: true });

  const files = await fs.readdir(dirPath);

  for (const fileName of files) {
    const fullPath = path.join(dirPath, fileName);
    const currentRelativePath = path.join(relativePath, fileName);

    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      await saveFilesToDisk(
        fullPath,
        currentRelativePath,
        prototypeId,
        savedFiles,
      );
    } else {
      const localSavePath = path.join(prototypesDir, currentRelativePath);
      await fs.mkdir(path.dirname(localSavePath), { recursive: true });
      await fs.copyFile(fullPath, localSavePath);

      savedFiles.push({
        filename: currentRelativePath,
        localPath: localSavePath,
      });
    }
  }
}

/**
 * Builds and deploys a project from an existing project directory
 */
async function buildAndDeployFromExistingProject(
  projectDir: string,
  prototypeId: string,
): Promise<{ buildUrl: string; buildLog: BuildLogEntry[] }> {
  let buildResult: BuildResult;
  try {
    buildResult = await buildProject(projectDir, prototypeId);
  } catch (error) {
    if (error instanceof BuildError) {
      throw error;
    }
    throw new BuildError(
      `Build process failed: ${(error as Error).message}`,
      [],
    );
  }

  const { outputPath, buildLog } = buildResult;
  const buildS3Prefix = `${prototypeId}/dist`;
  let uploadResults: S3.ManagedUpload.SendData[];

  try {
    uploadResults = await uploadDirectoryToS3(outputPath, buildS3Prefix);
  } catch (error) {
    if (error instanceof S3UploadError) {
      // If some files failed to upload, we still want to return the buildUrl if index.html was uploaded
      const hasIndexHtml = error.successfulUploads.some((f) =>
        f.Key.endsWith("index.html"),
      );
      if (hasIndexHtml) {
        return {
          buildUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${buildS3Prefix}/index.html`,
          buildLog,
        };
      }
      throw error;
    }
    throw error;
  }

  // Cleanup build output directory
  await fs
    .rm(path.dirname(outputPath), { recursive: true, force: true })
    .catch((err) =>
      fastifyApp.log.error(
        `Failed to cleanup build output ${path.dirname(outputPath)}:`,
        err.message,
      ),
    );

  return {
    buildUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${buildS3Prefix}/index.html`,
    buildLog,
  };
}

// --- API Endpoints ---

fastifyApp.get(
  "/health",
  async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: "ok", timestamp: new Date().toISOString() };
  },
);

fastifyApp.post(
  "/build-and-deploy",
  async (request: FastifyRequest, reply: FastifyReply) => {
    const jobId = uuidv4();
    let prototypeId: string | null = null;
    let writeToDisk = true;
    let projectDir: string | null = null;
    let tempDir: string | null = null;

    try {
      fastifyApp.log.info(`Starting build-and-deploy job ${jobId}`);
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === "field") {
          if (part.fieldname === "prototypeId") {
            prototypeId = part.value as string;
          } else if (part.fieldname === "write_to_disk") {
            writeToDisk = !(part.value === "false" || part.value === false);
          }
        } else if (part.type === "file") {
          if (!prototypeId) {
            return reply.code(400).send({
              error: "prototypeId must be provided before file uploads",
            });
          }

          const buffer = await part.toBuffer();
          const isZip =
            part.mimetype === "application/zip" ||
            (part.filename && part.filename.toLowerCase().endsWith(".zip"));

          if (isZip) {
            fastifyApp.log.info(
              `Processing zip file for build-and-deploy: ${part.filename}`,
            );
            const { extractDir, tempDir: extractTempDir } =
              await extractZipForBuilding(buffer, prototypeId, writeToDisk);
            projectDir = extractDir;
            tempDir = extractTempDir; // Keep track of the outer temp dir for cleanup
            break; // Process only the first zip file
          } else {
            return reply.code(400).send({
              error: "build-and-deploy endpoint only supports zip files",
            });
          }
        }
      }

      if (!prototypeId)
        return reply.code(400).send({ error: "prototypeId is required" });
      if (!projectDir)
        return reply.code(400).send({ error: "No valid zip file provided" });

      fastifyApp.log.info(
        `Starting build-and-deploy for prototype ${prototypeId}, job ${jobId}`,
      );

      let buildResult: BuildResult;
      try {
        buildResult = await buildProject(projectDir, prototypeId);
      } catch (error) {
        if (error instanceof BuildError) {
          return reply.code(500).send({
            jobId,
            prototypeId,
            status: "build_failed",
            error: "Build process failed",
            details: error.message,
            buildLog: error.buildLog,
            buildFailed: true,
          });
        }
        throw error; // Rethrow other errors
      }

      const { outputPath, buildLog } = buildResult;
      const buildS3Prefix = `${prototypeId}/dist`;
      let uploadResults: S3.ManagedUpload.SendData[];

      try {
        uploadResults = await uploadDirectoryToS3(outputPath, buildS3Prefix);
      } catch (error) {
        if (error instanceof S3UploadError) {
          return reply.code(207).send({
            jobId,
            prototypeId,
            status: "partial_success",
            error: "Some files failed to upload to S3",
            failedUploads: error.failedUploads,
            buildLog,
            buildSuccess: true,
            uploadedFiles: error.successfulUploads.map((r) => ({
              key: r.Key,
              location: r.Location,
            })),
            message: `Build completed but S3 upload partially failed: ${error.successfulUploads.length} uploaded, ${error.failedUploads.length} failed`,
            buildUrl: error.successfulUploads.some((f) =>
              f.Key.endsWith("index.html"),
            )
              ? `https://${BUCKET_NAME}.s3.amazonaws.com/${buildS3Prefix}/index.html`
              : null,
          });
        }
        throw error;
      }

      fastifyApp.log.info(
        `Uploaded ${uploadResults.length} built files for job ${jobId}`,
      );

      let localBuildPath: string | null = null;
      if (writeToDisk) {
        localBuildPath = path.resolve(PROTOTYPES_DIR, prototypeId, "build");
        await fs.mkdir(localBuildPath, { recursive: true });
        await fs.cp(outputPath, localBuildPath, { recursive: true });
        fastifyApp.log.info(
          `Saved build output to local disk: ${localBuildPath}`,
        );
      }

      // Cleanup temp directories
      if (tempDir) {
        await fs
          .rm(tempDir, { recursive: true, force: true })
          .catch((err) =>
            fastifyApp.log.error(
              `Failed to cleanup tempDir ${tempDir}:`,
              err.message,
            ),
          );
      }
      await fs
        .rm(path.dirname(outputPath), { recursive: true, force: true })
        .catch((err) =>
          fastifyApp.log.error(
            `Failed to cleanup build output ${path.dirname(outputPath)}:`,
            err.message,
          ),
        );

      const response: any = {
        jobId,
        prototypeId,
        status: "completed",
        message: `Build and deploy completed successfully. ${uploadResults.length} files uploaded.`,
        buildUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${buildS3Prefix}/index.html`,
        buildLog,
        buildSuccess: true,
        uploadedFiles: uploadResults.map((r) => ({
          key: r.Key,
          location: r.Location,
        })),
      };

      if (writeToDisk && localBuildPath) {
        response.localBuildPath = localBuildPath;
        response.localBuildUrl = `file://${localBuildPath}/index.html`;
      }

      return response;
    } catch (error: any) {
      fastifyApp.log.error(`Build-and-deploy failed for job ${jobId}:`, error);

      // Ensure cleanup happens on any failure
      if (tempDir) {
        await fs
          .rm(tempDir, { recursive: true, force: true })
          .catch((cleanupError) =>
            fastifyApp.log.error("Cleanup failed:", cleanupError.message),
          );
      }
      if (projectDir && projectDir.startsWith(BUILD_TEMP_DIR)) {
        await fs
          .rm(path.dirname(projectDir), { recursive: true, force: true })
          .catch((cleanupError) =>
            fastifyApp.log.error(
              "Project cleanup failed:",
              cleanupError.message,
            ),
          );
      }

      return reply.code(500).send({
        jobId,
        prototypeId: prototypeId || "unknown",
        status: "failed",
        error: "Build and deploy failed",
        details: error.message,
        stack: error.stack,
      });
    }
  },
);

fastifyApp.post(
  "/dev-server",
  async (request: FastifyRequest, reply: FastifyReply) => {
    const jobId = uuidv4();
    let prototypeId: string | null = null;
    let projectDir: string | null = null;
    let tempDir: string | null = null;
    let devPort: number | null = null;

    try {
      fastifyApp.log.info(`Starting dev server job ${jobId}`);
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === "field") {
          if (part.fieldname === "prototypeId") {
            prototypeId = part.value as string;
          } else if (part.fieldname === "port") {
            devPort = parseInt(part.value as string, 10);
          }
        } else if (part.type === "file" && part.fieldname === "files") {
          if (!prototypeId)
            return reply.code(400).send({
              error: "prototypeId must be provided before file uploads",
            });

          const buffer = await part.toBuffer();
          const isZip =
            part.mimetype === "application/zip" ||
            (part.filename && part.filename.toLowerCase().endsWith(".zip"));

          if (isZip) {
            fastifyApp.log.info(
              `Processing zip file for dev server: ${part.filename}`,
            );
            const { extractDir, tempDir: extractTempDir } =
              await extractZipForBuilding(buffer, prototypeId, false);
            projectDir = extractDir;
            tempDir = extractTempDir;
            break;
          } else {
            return reply
              .code(400)
              .send({ error: "dev-server endpoint only supports zip files" });
          }
        }
      }

      if (!prototypeId)
        return reply.code(400).send({ error: "prototypeId is required" });
      if (!projectDir)
        return reply.code(400).send({ error: "No valid zip file provided" });
      if (!devPort) devPort = 19006; // Default Expo port

      if (runningDevServers.has(prototypeId)) {
        return reply.code(409).send({
          error: "Dev server already running for this prototype",
          prototypeId,
          existingServer: runningDevServers.get(prototypeId),
        });
      }

      // Create a predictable tunnel subdomain from prototypeId
      const tunnelSubdomain = prototypeId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .substring(0, 20);

      fastifyApp.log.info(
        `Starting dev server for prototype ${prototypeId}, job ${jobId} on port ${devPort}`,
      );
      fastifyApp.log.info(`Using tunnel subdomain: ${tunnelSubdomain}`);

      await execAsync("npm install --no-save --cache /tmp/.npm", {
        cwd: projectDir,
        timeout: 300000, // 5 minute timeout
      });
      // @expo/ngrok is pre-installed globally during EC2 setup

      const expoProcess = spawn(
        "npx",
        [
          "expo",
          "start",
          "--web",
          "--tunnel",
          "--port",
          devPort.toString(),
          "--non-interactive",
        ],
        {
          cwd: projectDir,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            CI: "1",
            EXPO_NO_TELEMETRY: "1",
            EXPO_TUNNEL_SUBDOMAIN: tunnelSubdomain,
          },
        },
      );

      let tunnelUrl: string | null = null;
      const startupLogs: string[] = [];

      const waitForTunnel = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Timeout waiting for tunnel URL")),
          60000,
        );

        const processOutput = (data: Buffer, source: string) => {
          const output = data.toString();
          startupLogs.push(output);
          fastifyApp.log.info(`Expo ${source}: ${output.trim()}`);

          // Look for any HTTPS URL that's not localhost
          const urlMatch = output.match(/https?:\/\/[^\s\)]+/g);
          if (urlMatch) {
            fastifyApp.log.info(`Found URL candidates: ${urlMatch.join(", ")}`);

            // Filter out localhost URLs and find tunnel URLs
            const tunnelCandidates = urlMatch.filter(
              (url) =>
                !url.includes("localhost") &&
                !url.includes("127.0.0.1") &&
                (url.includes(".exp.direct") ||
                  url.includes(".ngrok.io") ||
                  url.includes(".tunnel.dev") ||
                  url.includes(".exp.dev") ||
                  url.includes("exp.host") ||
                  url.includes("ngrok") ||
                  url.match(/https:\/\/[a-z0-9-]+\.(com|dev|io)/)),
            );

            if (tunnelCandidates.length > 0) {
              tunnelUrl = tunnelCandidates[0];
              fastifyApp.log.info(`Found tunnel URL: ${tunnelUrl}`);
              clearTimeout(timeout);
              resolve(tunnelUrl);
            }
          }

          // Check for tunnel ready messages and construct expected URL
          if (output.includes("Tunnel ready") && !tunnelUrl) {
            fastifyApp.log.info(
              "Tunnel ready but no URL found in logs, constructing expected URL",
            );
            // Construct expected tunnel URL based on subdomain - Expo uses ngrok.io
            const expectedTunnelUrl = `https://${tunnelSubdomain}.ngrok.io`;
            tunnelUrl = expectedTunnelUrl;
            fastifyApp.log.info(`Using constructed tunnel URL: ${tunnelUrl}`);
            clearTimeout(timeout);
            resolve(tunnelUrl);
          }
        };

        expoProcess.stdout.on("data", (data: Buffer) =>
          processOutput(data, "stdout"),
        );
        expoProcess.stderr.on("data", (data: Buffer) =>
          processOutput(data, "stderr"),
        );
        expoProcess.on("close", (code) => {
          clearTimeout(timeout);
          if (code !== 0)
            reject(new Error(`Expo dev server exited with code ${code}`));
        });
        expoProcess.on("error", reject);
      });

      await waitForTunnel;

      const devServerInfo: DevServerInfo = {
        prototypeId,
        jobId,
        process: expoProcess,
        projectDir,
        tempDir: tempDir || "",
        tunnelUrl,
        startTime: new Date(),
        logs: startupLogs,
      };

      runningDevServers.set(prototypeId, devServerInfo);

      expoProcess.on("close", () => {
        runningDevServers.delete(prototypeId!);
        if (tempDir)
          fs.rm(tempDir, { recursive: true, force: true }).catch((err) =>
            fastifyApp.log.error(`Cleanup failed for ${prototypeId}:`, err),
          );
      });

      return {
        jobId,
        prototypeId,
        status: "started",
        tunnelUrl,
        message: "Dev server started successfully",
        startTime: devServerInfo.startTime,
      };
    } catch (error: any) {
      fastifyApp.log.error(
        `Dev server startup failed for job ${jobId}:`,
        error,
      );

      // Cleanup on dev server startup failure
      if (tempDir) {
        await fs
          .rm(tempDir, { recursive: true, force: true })
          .catch((e) =>
            fastifyApp.log.error("Dev server cleanup failed:", e.message),
          );
      }
      if (projectDir && projectDir.startsWith(BUILD_TEMP_DIR)) {
        await fs
          .rm(path.dirname(projectDir), { recursive: true, force: true })
          .catch((e) =>
            fastifyApp.log.error(
              "Dev server project cleanup failed:",
              e.message,
            ),
          );
      }

      return reply.code(500).send({
        jobId,
        prototypeId: prototypeId || "unknown",
        status: "failed",
        error: "Failed to start dev server",
        details: error.message,
      });
    }
  },
);

fastifyApp.delete(
  "/dev-server/:prototypeId",
  async (
    request: FastifyRequest<{ Params: DevServerParams }>,
    reply: FastifyReply,
  ) => {
    const { prototypeId } = request.params;
    const devServerInfo = runningDevServers.get(prototypeId);

    if (!devServerInfo) {
      return reply.code(404).send({
        error: "No dev server running for this prototype",
        prototypeId,
      });
    }

    try {
      // Build and deploy the project before stopping the dev server
      let buildUrl: string | null = null;
      let buildLog: BuildLogEntry[] = [];
      let buildSuccess = false;

      try {
        const buildResult = await buildAndDeployFromExistingProject(
          devServerInfo.projectDir,
          prototypeId,
        );
        buildUrl = buildResult.buildUrl;
        buildLog = buildResult.buildLog;
        buildSuccess = true;
        fastifyApp.log.info(
          `Successfully built and deployed ${prototypeId} before stopping dev server`,
        );
      } catch (buildError: any) {
        fastifyApp.log.error(
          `Failed to build and deploy ${prototypeId} before stopping dev server:`,
          buildError.message,
        );
        // Continue with stopping the dev server even if build fails
      }

      // Stop the dev server
      devServerInfo.process.kill("SIGTERM");
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!devServerInfo.process.killed)
          devServerInfo.process.kill("SIGKILL");
      }, 5000);

      if (devServerInfo.tempDir) {
        await fs.rm(devServerInfo.tempDir, { recursive: true, force: true });
      }

      runningDevServers.delete(prototypeId);
      fastifyApp.log.info(`Dev server stopped for ${prototypeId}`);

      const response: any = {
        prototypeId,
        status: "stopped",
        message: "Dev server stopped successfully",
        buildSuccess,
      };

      if (buildSuccess && buildUrl) {
        response.buildUrl = buildUrl;
        response.buildLog = buildLog;
        response.message =
          "Dev server stopped and project built/deployed successfully";
      } else if (!buildSuccess) {
        response.buildError =
          "Failed to build and deploy project before stopping dev server";
      }

      return reply.send(response);
    } catch (error: any) {
      return reply
        .code(500)
        .send({ error: "Failed to stop dev server", details: error.message });
    }
  },
);

// New endpoint to stop dev server by port number
fastifyApp.delete(
  "/dev-server/port/:port",
  async (
    request: FastifyRequest<{ Params: { port: string } }>,
    reply: FastifyReply,
  ) => {
    const { port } = request.params;
    const portNumber = parseInt(port, 10);

    if (isNaN(portNumber)) {
      return reply.code(400).send({
        error: "Invalid port number",
        port,
      });
    }

    // Find dev server by port number
    let targetDevServer: DevServerInfo | null = null;
    let targetPrototypeId: string | null = null;

    for (const [prototypeId, devServerInfo] of runningDevServers.entries()) {
      // Check if the dev server is running on the specified port
      // We'll need to check the process arguments or use a different approach
      // For now, we'll check if the port matches the one used when starting
      if (devServerInfo.process && devServerInfo.process.pid) {
        try {
          // Use lsof to check what port the process is actually listening on
          const { stdout } = await execAsync(`lsof -i :${portNumber} -t`);
          const pids = stdout
            .trim()
            .split("\n")
            .filter((pid) => pid);

          if (pids.includes(devServerInfo.process.pid.toString())) {
            targetDevServer = devServerInfo;
            targetPrototypeId = prototypeId;
            break;
          }
        } catch (error) {
          // Process might not be listening on that port anymore
          continue;
        }
      }
    }

    if (!targetDevServer || !targetPrototypeId) {
      return reply.code(404).send({
        error: "No dev server running on the specified port",
        port: portNumber,
      });
    }

    try {
      // Build and deploy the project before stopping the dev server
      let buildUrl: string | null = null;
      let buildLog: BuildLogEntry[] = [];
      let buildSuccess = false;

      try {
        const buildResult = await buildAndDeployFromExistingProject(
          targetDevServer.projectDir,
          targetPrototypeId,
        );
        buildUrl = buildResult.buildUrl;
        buildLog = buildResult.buildLog;
        buildSuccess = true;
        fastifyApp.log.info(
          `Successfully built and deployed ${targetPrototypeId} before stopping dev server on port ${portNumber}`,
        );
      } catch (buildError: any) {
        fastifyApp.log.error(
          `Failed to build and deploy ${targetPrototypeId} before stopping dev server on port ${portNumber}:`,
          buildError.message,
        );
        // Continue with stopping the dev server even if build fails
      }

      // Stop the dev server
      targetDevServer.process.kill("SIGTERM");
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!targetDevServer!.process.killed)
          targetDevServer!.process.kill("SIGKILL");
      }, 5000);

      if (targetDevServer.tempDir) {
        await fs.rm(targetDevServer.tempDir, { recursive: true, force: true });
      }

      runningDevServers.delete(targetPrototypeId);
      fastifyApp.log.info(
        `Dev server stopped on port ${portNumber} for prototype ${targetPrototypeId}`,
      );

      const response: any = {
        prototypeId: targetPrototypeId,
        port: portNumber,
        status: "stopped",
        message: "Dev server stopped successfully by port number",
        buildSuccess,
      };

      if (buildSuccess && buildUrl) {
        response.buildUrl = buildUrl;
        response.buildLog = buildLog;
        response.message =
          "Dev server stopped by port number and project built/deployed successfully";
      } else if (!buildSuccess) {
        response.buildError =
          "Failed to build and deploy project before stopping dev server";
      }

      return reply.send(response);
    } catch (error: any) {
      return reply
        .code(500)
        .send({ error: "Failed to stop dev server", details: error.message });
    }
  },
);

fastifyApp.get(
  "/dev-servers",
  async (request: FastifyRequest, reply: FastifyReply) => {
    const servers = Array.from(runningDevServers.values()).map((info) => ({
      prototypeId: info.prototypeId,
      jobId: info.jobId,
      tunnelUrl: info.tunnelUrl,
      startTime: info.startTime,
      status: "running",
    }));
    return { runningServers: servers, count: servers.length };
  },
);

fastifyApp.delete(
  "/build/:prototypeId",
  async (
    request: FastifyRequest<{ Params: { prototypeId: string } }>,
    reply: FastifyReply,
  ) => {
    const { prototypeId } = request.params;

    if (!prototypeId) {
      return reply.code(400).send({
        error: "prototypeId is required",
      });
    }

    try {
      const prototypeBuildPath = path.resolve(PROTOTYPES_DIR, prototypeId);

      // Check if the prototype directory exists
      try {
        await fs.stat(prototypeBuildPath);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          return reply.code(404).send({
            error: "Build not found for this prototype",
            prototypeId,
          });
        }
        throw error;
      }

      // Remove the entire prototype directory (includes both source files and build)
      await fs.rm(prototypeBuildPath, { recursive: true, force: true });

      fastifyApp.log.info(
        `Successfully deleted build for prototype ${prototypeId} from local disk`,
      );

      return {
        prototypeId,
        status: "deleted",
        message: "Build successfully deleted from local disk",
        deletedPath: prototypeBuildPath,
      };
    } catch (error: any) {
      fastifyApp.log.error(
        `Failed to delete build for ${prototypeId}:`,
        error.message,
      );

      return reply.code(500).send({
        error: "Failed to delete build from local disk",
        prototypeId,
        details: error.message,
      });
    }
  },
);

// --- Cleanup Scheduler ---

// Run cleanup every 30 minutes
setInterval(
  async () => {
    console.log("Running periodic cleanup...");
    await cleanupOldFiles();
  },
  30 * 60 * 1000,
);

// Run initial cleanup on startup
cleanupOldFiles().catch((error) => {
  console.error("Initial cleanup failed:", error.message);
});

// --- Server Start ---

const start = async (): Promise<void> => {
  try {
    await fastifyApp.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Build worker server listening on port ${PORT}`);
  } catch (err) {
    fastifyApp.log.error(err);
    process.exit(1);
  }
};

start();
