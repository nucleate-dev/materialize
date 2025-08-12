import AWS from "aws-sdk";
import { execSync, spawn, SpawnOptions } from "child_process";
import dotenv from "dotenv";
import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Load environment variables
dotenv.config();

// --- Types ---
interface BuildLogEntry {
  step: string;
  success: boolean;
  timestamp: string;
  output: string;
  error: string;
}

interface FileInput {
  path: string;
  content: string;
  isBase64?: boolean;
}

interface BuildRequest {
  prototypeId: string;
  files: FileInput[];
}

interface BuildResponse {
  success: boolean;
  buildLog: BuildLogEntry[];
  outputPath?: string;
  error?: string;
}

interface DeployRequest {
  prototypeId: string;
  buildPath: string;
}

interface DeployResponse {
  success: boolean;
  buildUrl?: string;
  uploadedFiles?: Array<{ key: string; location: string }>;
  error?: string;
}

interface BuildAndDeployRequest {
  prototypeId: string;
  files: FileInput[];
}

interface BuildAndDeployResponse {
  success: boolean;
  buildUrl?: string;
  buildLog: BuildLogEntry[];
  uploadedFiles?: Array<{ key: string; location: string }>;
  error?: string;
}

// --- Configuration ---
const PORT = parseInt(process.env.PORT || "3002", 10);
const WORK_DIR = process.env.WORK_DIR || "/tmp/fargate-builds";
const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const S3_BUCKET = process.env.S3_BUCKET || "materialize-sites";

// --- AWS Setup ---
// --- AWS Setup ---
AWS.config.update({
  region: AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  httpOptions: {
    timeout: 300000, // 5 minutes
    connectTimeout: 60000, // 1 minute
  },
  maxRetries: 3,
});

// Verify credentials are loaded
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("Missing AWS credentials in environment variables");
  process.exit(1);
}

const s3 = new AWS.S3();

// --- Utility Functions ---
function isBinaryFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const binaryExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".ico",
    ".svg",
    ".ttf",
    ".otf",
    ".woff",
    ".woff2",
    ".eot",
    ".mp4",
    ".mp3",
    ".wav",
    ".ogg",
    ".webm",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".rar",
    ".exe",
    ".dmg",
    ".app",
    ".deb",
    ".rpm",
  ];
  return binaryExtensions.includes(ext);
}

async function checkSystemResources(): Promise<{
  disk: string;
  memory: string;
  processes: string;
}> {
  try {
    const disk = execSync("df -h /tmp", { encoding: "utf8" });
    const memory = execSync("free -h", { encoding: "utf8" });
    const processes = execSync(
      'ps aux | grep -E "(npm|node|expo)" | grep -v grep | wc -l',
      { encoding: "utf8" },
    );

    return {
      disk: disk.trim(),
      memory: memory.trim(),
      processes: processes.trim(),
    };
  } catch (error) {
    return {
      disk: "Unable to check",
      memory: "Unable to check",
      processes: "Unable to check",
    };
  }
}

function createLogger(buildId: string) {
  const buildLog: BuildLogEntry[] = [];
  const startTime = Date.now();

  return {
    log: (
      step: string,
      success: boolean = true,
      output: string = "",
      error: string = "",
    ) => {
      const entry: BuildLogEntry = {
        step,
        success,
        timestamp: new Date().toISOString(),
        output: output.toString().trim(),
        error: error.toString().trim(),
      };
      buildLog.push(entry);

      const elapsed = Date.now() - startTime;
      const elapsedStr = `${Math.floor(elapsed / 1000)}s`;
      const status = success ? "✓" : "✗";
      const timestamp = new Date().toLocaleTimeString();

      console.log(
        `[${timestamp}] [${buildId}] ${status} ${step} (${elapsedStr})`,
      );
      if (output) console.log(`[${timestamp}] [${buildId}] Output: ${output}`);
      if (error) console.error(`[${timestamp}] [${buildId}] Error: ${error}`);
    },
    getBuildLog: () => buildLog,
    getElapsedTime: () => Date.now() - startTime,
  };
}

async function writeProjectFiles(
  files: FileInput[],
  projectDir: string,
): Promise<void> {
  await fs.mkdir(projectDir, { recursive: true });

  for (const file of files) {
    const filePath = path.join(projectDir, file.path);
    const fileDir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(fileDir, { recursive: true });

    // Write file content
    if (file.isBase64) {
      // Decode base64 content to binary
      const binaryContent = Buffer.from(file.content, "base64");
      await fs.writeFile(filePath, binaryContent);
    } else {
      // Write as UTF-8 text
      await fs.writeFile(filePath, file.content, "utf8");
    }
  }
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
  timeoutMs: number = 300000, // 5 minutes default
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let processExited = false;

    const spawnOptions: SpawnOptions = {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    };

    const childProcess = spawn(command, args, spawnOptions);

    // Set up timeout
    const timeout = setTimeout(() => {
      if (!processExited) {
        processExited = true;
        childProcess.kill("SIGKILL");
        reject(
          new Error(
            `Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`,
          ),
        );
      }
    }, timeoutMs);

    // Handle stdout
    childProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      stdout += output;
      // Log real-time output
      console.log(`[STDOUT] ${output.trim()}`);
    });

    // Handle stderr
    childProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      stderr += output;
      // Log real-time output
      console.error(`[STDERR] ${output.trim()}`);
    });

    // Handle process exit
    childProcess.on("close", (code: number | null) => {
      if (!processExited) {
        processExited = true;
        clearTimeout(timeout);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: code || 0,
        });
      }
    });

    // Handle process errors
    childProcess.on("error", (error: Error) => {
      if (!processExited) {
        processExited = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start command: ${error.message}`));
      }
    });

    // Handle unexpected termination
    process.on("exit", () => {
      if (!processExited) {
        processExited = true;
        clearTimeout(timeout);
        childProcess.kill("SIGKILL");
      }
    });
  });
}

async function installDependencies(
  projectDir: string,
  logger: any,
): Promise<void> {
  logger.log("Installing dependencies", true, `Project dir: ${projectDir}`);

  // Check if package.json exists
  const packageJsonPath = path.join(projectDir, "package.json");
  try {
    const packageJson = await fs.readFile(packageJsonPath, "utf8");
    const packageData = JSON.parse(packageJson);
    logger.log(
      "Package.json found",
      true,
      `Dependencies: ${Object.keys(packageData.dependencies || {}).length}, Dev dependencies: ${Object.keys(packageData.devDependencies || {}).length}`,
    );
  } catch (error) {
    logger.log(
      "Package.json check",
      false,
      "",
      `Failed to read package.json: ${error}`,
    );
    throw new Error("package.json not found or invalid");
  }

  // Check if node_modules already exists (for debugging)
  const nodeModulesPath = path.join(projectDir, "node_modules");
  try {
    await fs.stat(nodeModulesPath);
    logger.log(
      "Node modules check",
      true,
      "node_modules directory already exists",
    );
  } catch (error) {
    logger.log(
      "Node modules check",
      true,
      "node_modules directory does not exist, will create",
    );
  }

  logger.log(
    "Starting npm install",
    true,
    "Running: npm ci --prefer-offline --no-audit --no-fund",
  );

  const result = await runCommand(
    "npm",
    ["ci", "--prefer-offline", "--no-audit", "--no-fund"],
    projectDir,
    {
      CI: "1",
      NODE_OPTIONS: "--max-old-space-size=2048",
      NPM_CONFIG_LOGLEVEL: "verbose", // More verbose npm logging
    },
    600000, // 10 minutes timeout for dependency installation
  );

  if (result.code !== 0) {
    logger.log("Install dependencies", false, result.stdout, result.stderr);
    throw new Error(`npm install failed with exit code ${result.code}`);
  }

  // Verify node_modules was created and has content
  try {
    const nodeModulesStats = await fs.stat(nodeModulesPath);
    if (!nodeModulesStats.isDirectory()) {
      throw new Error("node_modules is not a directory");
    }

    const nodeModulesContents = await fs.readdir(nodeModulesPath);
    logger.log(
      "Install verification",
      true,
      `node_modules created with ${nodeModulesContents.length} items`,
    );
  } catch (error) {
    logger.log(
      "Install verification",
      false,
      "",
      `Failed to verify node_modules: ${error}`,
    );
  }

  logger.log(
    "Install dependencies",
    true,
    `Completed successfully\n${result.stdout}`,
    result.stderr,
  );
}

async function buildExpoProject(
  projectDir: string,
  logger: any,
): Promise<string> {
  logger.log("Building Expo project", true, `Starting build in ${projectDir}`);

  // Check if expo is available
  try {
    const expoConfigPath = path.join(projectDir, "app.json");
    const expoConfig = await fs.readFile(expoConfigPath, "utf8");
    const config = JSON.parse(expoConfig);
    logger.log(
      "Expo config found",
      true,
      `Project: ${config.expo?.name || "Unknown"}, Platform: ${config.expo?.platforms?.join(", ") || "Unknown"}`,
    );
  } catch (error) {
    logger.log(
      "Expo config check",
      false,
      "",
      `Failed to read app.json: ${error}`,
    );
    throw new Error("app.json not found or invalid");
  }

  logger.log(
    "Starting Expo export",
    true,
    "Running: npx expo export --platform web",
  );

  const result = await runCommand(
    "npx",
    ["expo", "export", "--platform", "web"],
    projectDir,
    {
      CI: "1",
      EXPO_NO_TELEMETRY: "1",
      NODE_OPTIONS: "--max-old-space-size=2048",
    },
    900000, // 15 minutes timeout for Expo build
  );

  if (result.code !== 0) {
    logger.log("Build Expo project", false, result.stdout, result.stderr);
    throw new Error(`Expo build failed with exit code ${result.code}`);
  }

  const distPath = path.join(projectDir, "dist");

  // Verify build output exists and has content
  try {
    const distStats = await fs.stat(distPath);
    if (!distStats.isDirectory()) {
      throw new Error("dist is not a directory");
    }

    const distContents = await fs.readdir(distPath);
    logger.log(
      "Build output verification",
      true,
      `dist folder created with ${distContents.length} items`,
    );

    // Check for key files
    const hasIndexHtml = distContents.includes("index.html");
    const hasAssets = distContents.some(
      (item) => item === "assets" || item === "static",
    );
    logger.log(
      "Build output check",
      true,
      `index.html: ${hasIndexHtml}, assets: ${hasAssets}`,
    );

    if (!hasIndexHtml) {
      logger.log(
        "Build output warning",
        false,
        "",
        "index.html not found in build output",
      );
    }
  } catch (error) {
    logger.log(
      "Verify build output",
      false,
      "",
      `Expo export did not create dist folder: ${error}`,
    );
    throw new Error("Expo export did not create dist folder");
  }

  logger.log(
    "Build Expo project",
    true,
    `Build completed successfully\n${result.stdout}`,
    result.stderr,
  );
  return distPath;
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain",
  };
  return contentTypes[ext] || "application/octet-stream";
}

async function uploadDirectoryToS3(
  localPath: string,
  s3KeyPrefix: string,
): Promise<Array<{ key: string; location: string }>> {
  const uploadResults: Array<{ key: string; location: string }> = [];

  async function uploadDirectory(dirPath: string, prefix: string) {
    const items = await fs.readdir(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const s3Key = `${prefix}/${item}`;

      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        await uploadDirectory(fullPath, s3Key);
      } else if (stats.isFile()) {
        const fileContent = await fs.readFile(fullPath);

        // Skip empty or null files
        if (!fileContent || fileContent.length === 0) {
          console.warn(`Skipping empty file: ${s3Key}`);
          continue;
        }

        const uploadParams = {
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: fileContent,
          ContentType: getContentType(item),
        };

        const result = await s3.upload(uploadParams).promise();
        uploadResults.push({
          key: result.Key,
          location: result.Location,
        });
      }
    }
  }

  await uploadDirectory(localPath, s3KeyPrefix);
  return uploadResults;
}

// --- Fastify Setup ---
const app: FastifyInstance = fastify({
  logger: {
    level: "info",
    transport: {
      target: "pino-pretty",
    },
  },
  bodyLimit: 50 * 1024 * 1024, // 50MB limit for large file uploads
});

// --- Health Check ---
app.get("/health", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const resources = await checkSystemResources();
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "fargate-build-worker",
      system: {
        disk: resources.disk.split("\n")[1],
        memory: resources.memory.split("\n")[1],
        nodeProcesses: resources.processes,
      },
      workDir: WORK_DIR,
      s3Bucket: S3_BUCKET,
    };
  } catch (error) {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "fargate-build-worker",
      system: "Unable to check",
      workDir: WORK_DIR,
      s3Bucket: S3_BUCKET,
    };
  }
});

// --- Build Endpoint ---
app.post<{ Body: BuildRequest }>("/build", async (request, reply) => {
  const buildId = uuidv4();
  const { prototypeId, files } = request.body;
  const logger = createLogger(buildId);

  logger.log(
    "Starting build",
    true,
    `Build ID: ${buildId}, Prototype: ${prototypeId}, Files: ${files.length}`,
  );

  if (!prototypeId || !files || !Array.isArray(files) || files.length === 0) {
    return reply.code(400).send({
      success: false,
      error: "prototypeId and files array are required",
      buildLog: logger.getBuildLog(),
    });
  }

  const buildDir = path.join(WORK_DIR, buildId);

  try {
    // Check system resources before starting
    logger.log("Checking system resources");
    try {
      const resources = await checkSystemResources();
      logger.log(
        "System resources",
        true,
        `Disk: ${resources.disk.split("\n")[1]}, Memory: ${resources.memory.split("\n")[1]}, Node processes: ${resources.processes}`,
      );
    } catch (error) {
      logger.log(
        "System resources check",
        false,
        "",
        `Failed to check resources: ${error}`,
      );
    }

    // Write files to disk
    logger.log("Writing project files");
    await writeProjectFiles(files, buildDir);
    logger.log("Project files written", true, `Build directory: ${buildDir}`);

    // Install dependencies
    logger.log("Starting dependency installation");
    const installStartTime = Date.now();
    await installDependencies(buildDir, logger);
    const installDuration = Date.now() - installStartTime;
    logger.log(
      "Dependency installation completed",
      true,
      `Duration: ${Math.floor(installDuration / 1000)}s`,
    );

    // Build project
    logger.log("Starting Expo build");
    const buildStartTime = Date.now();
    const outputPath = await buildExpoProject(buildDir, logger);
    const buildDuration = Date.now() - buildStartTime;
    logger.log(
      "Expo build completed",
      true,
      `Duration: ${Math.floor(buildDuration / 1000)}s`,
    );

    logger.log("Build completed", true, `Output available at: ${outputPath}`);

    const response: BuildResponse = {
      success: true,
      buildLog: logger.getBuildLog(),
      outputPath,
    };

    return response;
  } catch (error: any) {
    logger.log("Build failed", false, "", error.message);

    const response: BuildResponse = {
      success: false,
      error: error.message,
      buildLog: logger.getBuildLog(),
    };

    return reply.code(500).send(response);
  } finally {
    // Note: In production, you might want to keep build output for deploy step
    // Cleanup will happen when container terminates
  }
});

// --- Deploy Endpoint ---
app.post<{ Body: DeployRequest }>("/deploy", async (request, reply) => {
  const deployId = uuidv4();
  const { prototypeId, buildPath } = request.body;
  const logger = createLogger(deployId);

  logger.log(
    "Starting deploy",
    true,
    `Deploy ID: ${deployId}, Prototype: ${prototypeId}, Build path: ${buildPath}`,
  );

  if (!prototypeId || !buildPath) {
    return reply.code(400).send({
      success: false,
      error: "prototypeId and buildPath are required",
    });
  }

  try {
    // Verify build path exists
    await fs.stat(buildPath);

    // Upload to S3
    logger.log("Uploading to S3");
    const s3KeyPrefix = `${prototypeId}/dist`;
    const uploadedFiles = await uploadDirectoryToS3(buildPath, s3KeyPrefix);

    const buildUrl = `https://${prototypeId}.render.materializeui.com`;

    logger.log(
      "Deploy completed",
      true,
      `Uploaded ${uploadedFiles.length} files. URL: ${buildUrl}`,
    );

    const response: DeployResponse = {
      success: true,
      buildUrl,
      uploadedFiles,
    };

    return response;
  } catch (error: any) {
    logger.log("Deploy failed", false, "", error.message);

    const response: DeployResponse = {
      success: false,
      error: error.message,
    };

    return reply.code(500).send(response);
  }
});

// --- Build and Deploy Endpoint ---
app.post<{ Body: BuildAndDeployRequest }>(
  "/build-and-deploy",
  async (request, reply) => {
    const jobId = uuidv4();
    const { prototypeId, files } = request.body;
    const logger = createLogger(jobId);

    logger.log(
      "Starting build and deploy",
      true,
      `Job ID: ${jobId}, Prototype: ${prototypeId}, Files: ${files.length}`,
    );

    if (!prototypeId || !files || !Array.isArray(files) || files.length === 0) {
      return reply.code(400).send({
        success: false,
        error: "prototypeId and files array are required",
        buildLog: logger.getBuildLog(),
      });
    }

    const buildDir = path.join(WORK_DIR, jobId);

    try {
      // Build phase
      logger.log("Writing project files");
      await writeProjectFiles(files, buildDir);

      await installDependencies(buildDir, logger);
      const outputPath = await buildExpoProject(buildDir, logger);

      // Deploy phase
      logger.log("Starting deploy phase");
      const s3KeyPrefix = `${prototypeId}/dist`;
      const uploadedFiles = await uploadDirectoryToS3(outputPath, s3KeyPrefix);

      const buildUrl = `https://${prototypeId}.render.materializeui.com`;

      logger.log(
        "Build and deploy completed",
        true,
        `Uploaded ${uploadedFiles.length} files. URL: ${buildUrl}`,
      );

      const response: BuildAndDeployResponse = {
        success: true,
        buildUrl,
        buildLog: logger.getBuildLog(),
        uploadedFiles,
      };

      return response;
    } catch (error: any) {
      logger.log("Build and deploy failed", false, "", error.message);

      const response: BuildAndDeployResponse = {
        success: false,
        error: error.message,
        buildLog: logger.getBuildLog(),
      };

      return reply.code(500).send(response);
    } finally {
      // Cleanup build directory
      try {
        await fs.rm(buildDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(
          `Failed to cleanup build directory ${buildDir}:`,
          cleanupError,
        );
      }
    }
  },
);

// --- Start Server ---
const start = async (): Promise<void> => {
  try {
    // Ensure work directory exists
    await fs.mkdir(WORK_DIR, { recursive: true });

    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 Fargate build worker listening on port ${PORT}`);
    console.log(`📁 Work directory: ${WORK_DIR}`);
    console.log(`☁️  S3 bucket: ${S3_BUCKET}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
