import multipart from "@fastify/multipart";
import AWS, { S3 } from "aws-sdk";
import { ChildProcess, exec, spawn } from "child_process";
import dotenv from "dotenv";
import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fs from "fs-extra";
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

// --- Initializations ---

const fastifyApp: FastifyInstance = fastify({ logger: true });

// Register multipart plugin
fastifyApp.register(multipart);

// Configure AWS S3
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.BUCKET_NAME || "materialize-sites";
const execAsync = promisify(exec);

const PORT = parseInt(process.env.PORT || "3002", 10);
const PROTOTYPES_DIR = process.env.PROTOTYPES_DIR || "./prototypes";

// Track running dev servers
const runningDevServers = new Map<string, DevServerInfo>();

// --- Utility Functions ---

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
  const tempDir = path.join("/tmp", `build-${prototypeId}`);
  const buildLog: BuildLogEntry[] = [];

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
    await fs.ensureDir(tempDir);
    logStep("Create build directory", true, `Created: ${tempDir}`);

    await fs.copy(projectPath, tempDir);
    logStep(
      "Copy project files",
      true,
      `Copied from ${projectPath} to ${tempDir}`,
    );

    console.log(`Installing dependencies for build ${prototypeId}...`);
    try {
      const { stdout, stderr } = await execAsync("npm install", {
        cwd: tempDir,
      });
      logStep("Install dependencies", true, stdout, stderr);
    } catch (error: any) {
      logStep(
        "Install dependencies",
        false,
        error.stdout || "",
        error.stderr || error.message,
      );
      throw error;
    }

    // Expo CLI is pre-installed globally during EC2 setup

    console.log(`Building Expo project for web platform...`);
    try {
      const { stdout, stderr } = await execAsync(
        "npx expo export --platform web",
        { cwd: tempDir },
      );
      logStep("Expo export", true, stdout, stderr);
    } catch (error: any) {
      logStep(
        "Expo export",
        false,
        error.stdout || "",
        error.stderr || error.message,
      );
      throw error;
    }

    const expoDistPath = path.join(tempDir, "dist");
    if (!(await fs.pathExists(expoDistPath))) {
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
    await fs.remove(tempDir);
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
  const files = await fs.readdir(localPath, { withFileTypes: true });
  const uploadResults: S3.ManagedUpload.SendData[] = [];
  const failedUploads: FailedUpload[] = [];

  for (const file of files) {
    const localFilePath = path.join(localPath, file.name);
    const s3Key = `${s3KeyPrefix}/${file.name}`;

    if (file.isDirectory()) {
      try {
        const subDirResults = await uploadDirectoryToS3(localFilePath, s3Key);
        uploadResults.push(...subDirResults);
      } catch (error: any) {
        if (error instanceof S3UploadError) {
          failedUploads.push(...error.failedUploads);
          if (error.successfulUploads) {
            uploadResults.push(...error.successfulUploads);
          }
        } else {
          failedUploads.push({ path: localFilePath, error: error.message });
        }
      }
    } else {
      try {
        const fileBuffer = await fs.readFile(localFilePath);
        const result = await s3
          .upload({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: getContentType(file.name),
          })
          .promise();
        uploadResults.push(result);
      } catch (error: any) {
        console.error(
          `Failed to upload ${localFilePath} to S3:`,
          error.message,
        );
        failedUploads.push({
          path: localFilePath,
          key: s3Key,
          error: error.message,
        });
      }
    }
  }

  if (failedUploads.length > 0) {
    const errorMessage = `Failed to upload ${failedUploads.length} files to S3`;
    throw new S3UploadError(errorMessage, failedUploads, uploadResults);
  }

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
  const tempDir = path.join("/tmp", `extract-build-${uuidv4()}`);
  const zipPath = path.join(tempDir, "upload.zip");

  console.log(`Extracting zip file for building to ${tempDir}`);
  console.log(`Zip buffer size: ${zipBuffer.length} bytes`);

  try {
    await fs.ensureDir(tempDir);
    await fs.writeFile(zipPath, zipBuffer);

    const extractDir = path.join(tempDir, "extracted");
    await fs.ensureDir(extractDir);

    console.log(`Created extract directory: ${extractDir}`);

    // Extract zip file using buffer approach
    try {
      const zipBuffer = await fs.readFile(zipPath);
      const directory = await unzipper.Open.buffer(zipBuffer);

      for (const file of directory.files) {
        if (file.type === "File") {
          const filePath = path.join(extractDir, file.path);
          await fs.ensureDir(path.dirname(filePath));
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

        extractStream.on("error", (error) => {
          console.error("Stream extraction error:", error);
          reject(error);
        });

        fs.createReadStream(zipPath).pipe(extractStream);
      });
    }

    // Check what was extracted
    const extractedContents = await fs.readdir(extractDir, {
      withFileTypes: true,
    });
    console.log(
      `Extracted ${extractedContents.length} items:`,
      extractedContents.map((f) => f.name),
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
    await fs.remove(tempDir);
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
  await fs.ensureDir(prototypesDir);

  const files = await fs.readdir(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    const currentRelativePath = path.join(relativePath, file.name);

    if (file.isDirectory()) {
      await saveFilesToDisk(
        fullPath,
        currentRelativePath,
        prototypeId,
        savedFiles,
      );
    } else {
      const localSavePath = path.join(prototypesDir, currentRelativePath);
      await fs.ensureDir(path.dirname(localSavePath));
      await fs.copy(fullPath, localSavePath);

      savedFiles.push({
        filename: currentRelativePath,
        localPath: localSavePath,
      });
    }
  }
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
        await fs.ensureDir(localBuildPath);
        await fs.copy(outputPath, localBuildPath);
        fastifyApp.log.info(
          `Saved build output to local disk: ${localBuildPath}`,
        );
      }

      // Cleanup
      if (tempDir) await fs.remove(tempDir);
      await fs.remove(path.dirname(outputPath));

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
      if (tempDir)
        await fs
          .remove(tempDir)
          .catch((cleanupError) =>
            fastifyApp.log.error("Cleanup failed:", cleanupError),
          );

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

      await execAsync("npm install", { cwd: projectDir });
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
          fs.remove(tempDir).catch((err) =>
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
      if (tempDir)
        await fs
          .remove(tempDir)
          .catch((e) => fastifyApp.log.error("Cleanup failed:", e));
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
      devServerInfo.process.kill("SIGTERM");
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!devServerInfo.process.killed)
          devServerInfo.process.kill("SIGKILL");
      }, 5000);

      if (devServerInfo.tempDir) {
        await fs.remove(devServerInfo.tempDir);
      }

      runningDevServers.delete(prototypeId);
      fastifyApp.log.info(`Dev server stopped for ${prototypeId}`);
      return {
        prototypeId,
        status: "stopped",
        message: "Dev server stopped successfully",
      };
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
      targetDevServer.process.kill("SIGTERM");
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!targetDevServer!.process.killed)
          targetDevServer!.process.kill("SIGKILL");
      }, 5000);

      if (targetDevServer.tempDir) {
        await fs.remove(targetDevServer.tempDir);
      }

      runningDevServers.delete(targetPrototypeId);
      fastifyApp.log.info(
        `Dev server stopped on port ${portNumber} for prototype ${targetPrototypeId}`,
      );
      return {
        prototypeId: targetPrototypeId,
        port: portNumber,
        status: "stopped",
        message: "Dev server stopped successfully by port number",
      };
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
