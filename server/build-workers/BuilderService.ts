import AWS from "aws-sdk";
import { execSync, spawn, SpawnOptions } from "child_process";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  BuildAndDeployRequest,
  BuildAndDeployResponse,
  BuildLogEntry,
  BuildRequest,
  BuildResponse,
  DeployRequest,
  DeployResponse,
  FileInput,
} from "./build-worker-api-types.js";
import { installDependencies } from "./shared-utils.js";

export class BuilderService {
  private readonly WORK_DIR: string;
  private readonly S3_BUCKET: string;
  private readonly s3: AWS.S3;

  constructor(workDir: string, s3Bucket: string, s3Instance: AWS.S3) {
    this.WORK_DIR = workDir;
    this.S3_BUCKET = s3Bucket;
    this.s3 = s3Instance;
  }

  async checkSystemResources(): Promise<{
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

  createLogger(buildId: string) {
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
        if (output)
          console.log(`[${timestamp}] [${buildId}] Output: ${output}`);
        if (error) console.error(`[${timestamp}] [${buildId}] Error: ${error}`);
      },
      getBuildLog: () => buildLog,
      getElapsedTime: () => Date.now() - startTime,
    };
  }

  private isBinaryFile(filename: string): boolean {
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

  private getContentType(filename: string): string {
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

  private async uploadDirectoryToS3(
    localPath: string,
    s3KeyPrefix: string,
  ): Promise<Array<{ key: string; location: string }>> {
    const uploadResults: Array<{ key: string; location: string }> = [];

    const uploadDirectory = async (dirPath: string, prefix: string) => {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const s3Key = `${prefix}/${item}`;

        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          await uploadDirectory(fullPath, s3Key);
        } else if (stats.isFile()) {
          const fileContent = await fs.readFile(fullPath);

          if (!fileContent || fileContent.length === 0) {
            console.warn(`Skipping empty file: ${s3Key}`);
            continue;
          }

          const uploadParams = {
            Bucket: this.S3_BUCKET,
            Key: s3Key,
            Body: fileContent,
            ContentType: this.getContentType(item),
          };

          const result = await this.s3.upload(uploadParams).promise();
          uploadResults.push({
            key: result.Key,
            location: result.Location,
          });
        }
      }
    };

    await uploadDirectory(localPath, s3KeyPrefix);
    return uploadResults;
  }

  async buildProject(
    request: FastifyRequest<{ Body: BuildRequest }>,
    reply: FastifyReply,
  ): Promise<BuildResponse> {
    const buildId = uuidv4();
    const { prototypeId, files } = request.body;
    const logger = this.createLogger(buildId);

    logger.log(
      "Starting build",
      true,
      `Build ID: ${buildId}, Prototype: ${prototypeId}, Files: ${files.length}`,
    );

    if (!prototypeId || !files || !Array.isArray(files) || files.length === 0) {
      reply.code(400);
      return {
        success: false,
        error: "prototypeId and files array are required",
        buildLog: logger.getBuildLog(),
      };
    }

    const buildDir = path.join(this.WORK_DIR, buildId);

    try {
      logger.log("Checking system resources");
      try {
        const resources = await this.checkSystemResources();
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

      logger.log("Writing project files");
      await this.writeProjectFiles(files, buildDir);
      logger.log("Project files written", true, `Build directory: ${buildDir}`);

      logger.log("Starting dependency installation");
      const installStartTime = Date.now();
      await installDependencies(buildDir, logger);
      const installDuration = Date.now() - installStartTime;
      logger.log(
        "Dependency installation completed",
        true,
        `Duration: ${Math.floor(installDuration / 1000)}s`,
      );

      logger.log("Starting Expo build");
      const buildStartTime = Date.now();
      const outputPath = await this.buildExpoProject(buildDir, logger);
      const buildDuration = Date.now() - buildStartTime;
      logger.log(
        "Expo build completed",
        true,
        `Duration: ${Math.floor(buildDuration / 1000)}s`,
      );

      logger.log("Build completed", true, `Output available at: ${outputPath}`);

      return {
        success: true,
        buildLog: logger.getBuildLog(),
        outputPath,
      };
    } catch (error: any) {
      logger.log("Build failed", false, "", error.message);
      reply.code(500);
      return {
        success: false,
        error: error.message,
        buildLog: logger.getBuildLog(),
      };
    }
  }

  async deployProject(
    request: FastifyRequest<{ Body: DeployRequest }>,
    reply: FastifyReply,
  ): Promise<DeployResponse> {
    const deployId = uuidv4();
    const { prototypeId, buildPath } = request.body;
    const logger = this.createLogger(deployId);

    logger.log(
      "Starting deploy",
      true,
      `Deploy ID: ${deployId}, Prototype: ${prototypeId}, Build path: ${buildPath}`,
    );

    if (!prototypeId || !buildPath) {
      reply.code(400);
      return {
        success: false,
        error: "prototypeId and buildPath are required",
      };
    }

    try {
      await fs.stat(buildPath);

      logger.log("Uploading to S3");
      const s3KeyPrefix = `${prototypeId}/dist`;
      const uploadedFiles = await this.uploadDirectoryToS3(
        buildPath,
        s3KeyPrefix,
      );

      const buildUrl = `https://${prototypeId}.render.materializeui.com`;

      logger.log(
        "Deploy completed",
        true,
        `Uploaded ${uploadedFiles.length} files. URL: ${buildUrl}`,
      );

      return {
        success: true,
        buildUrl,
        uploadedFiles,
      };
    } catch (error: any) {
      logger.log("Deploy failed", false, "", error.message);
      reply.code(500);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async buildAndDeployProject(
    request: FastifyRequest<{ Body: BuildAndDeployRequest }>,
    reply: FastifyReply,
  ): Promise<BuildAndDeployResponse> {
    const jobId = uuidv4();
    const { prototypeId, files } = request.body;
    const logger = this.createLogger(jobId);

    logger.log(
      "Starting build and deploy",
      true,
      `Job ID: ${jobId}, Prototype: ${prototypeId}, Files: ${files.length}`,
    );

    if (!prototypeId || !files || !Array.isArray(files) || files.length === 0) {
      reply.code(400);
      return {
        success: false,
        error: "prototypeId and files array are required",
        buildLog: logger.getBuildLog(),
      };
    }

    const buildDir = path.join(this.WORK_DIR, jobId);

    try {
      logger.log("Writing project files");
      await this.writeProjectFiles(files, buildDir);

      await installDependencies(buildDir, logger);
      const outputPath = await this.buildExpoProject(buildDir, logger);

      logger.log("Starting deploy phase");
      const s3KeyPrefix = `${prototypeId}/dist`;
      const uploadedFiles = await this.uploadDirectoryToS3(
        outputPath,
        s3KeyPrefix,
      );

      const buildUrl = `https://${prototypeId}.render.materializeui.com`;

      logger.log(
        "Build and deploy completed",
        true,
        `Uploaded ${uploadedFiles.length} files. URL: ${buildUrl}`,
      );

      return {
        success: true,
        buildUrl,
        buildLog: logger.getBuildLog(),
        uploadedFiles,
      };
    } catch (error: any) {
      logger.log("Build and deploy failed", false, "", error.message);
      reply.code(500);
      return {
        success: false,
        error: error.message,
        buildLog: logger.getBuildLog(),
      };
    } finally {
      try {
        await fs.rm(buildDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(
          `Failed to cleanup build directory ${buildDir}:`,
          cleanupError,
        );
      }
    }
  }

  registerRoutes(app: FastifyInstance): void {
    app.post<{ Body: BuildRequest }>("/build", async (request, reply) => {
      return this.buildProject(request, reply);
    });

    app.post<{ Body: DeployRequest }>("/deploy", async (request, reply) => {
      return this.deployProject(request, reply);
    });

    app.post<{ Body: BuildAndDeployRequest }>(
      "/build-and-deploy",
      async (request, reply) => {
        return this.buildAndDeployProject(request, reply);
      },
    );
  }

  private async writeProjectFiles(
    files: FileInput[],
    projectDir: string,
  ): Promise<void> {
    await fs.mkdir(projectDir, { recursive: true });

    for (const file of files) {
      const filePath = path.join(projectDir, file.path);
      const fileDir = path.dirname(filePath);

      await fs.mkdir(fileDir, { recursive: true });

      if (file.isBase64) {
        const binaryContent = Buffer.from(file.content, "base64");
        await fs.writeFile(filePath, binaryContent);
      } else {
        await fs.writeFile(filePath, file.content, "utf8");
      }
    }
  }

  private runCommand(
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

  private async buildExpoProject(
    projectDir: string,
    logger: any,
  ): Promise<string> {
    logger.log(
      "Building Expo project",
      true,
      `Starting build in ${projectDir}`,
    );

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

    const result = await this.runCommand(
      "npx",
      ["expo", "export", "--platform", "web"],
      projectDir,
      {
        EXPO_NO_TELEMETRY: "1",
        NODE_OPTIONS: "--max-old-space-size=2048",
      },
      900000,
    );

    if (result.code !== 0) {
      logger.log("Build Expo project", false, result.stdout, result.stderr);
      throw new Error(`Expo build failed with exit code ${result.code}`);
    }

    const distPath = path.join(projectDir, "dist");

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
}
