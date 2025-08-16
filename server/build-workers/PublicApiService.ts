import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { BuilderService } from "./BuilderService.js";
import { ExpoDevServerService } from "./ExpoDevServerService.js";
import { customlog } from "./logger.js";
import { installDependencies } from "./shared-utils.js";
import {
  CodeError,
  CodeWarning,
  FileInput,
  PublicDevServerStartRequest,
  PublicDevServerStartResponse,
  PublicDevServerStopRequest,
  PublicDevServerStopResponse,
} from "./types.js";

export class PublicApiService {
  private readonly builderService: BuilderService;
  private readonly expoDevServerService: ExpoDevServerService;
  private readonly workDir: string;

  constructor(
    builderService: BuilderService,
    expoDevServerService: ExpoDevServerService,
    workDir: string,
  ) {
    this.builderService = builderService;
    this.expoDevServerService = expoDevServerService;
    this.workDir = workDir;
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /dev-server
    app.post<{ Body: PublicDevServerStartRequest }>(
      "/dev-server",
      this.startDevServer.bind(this),
    );

    // DELETE /dev-server
    app.delete<{ Body: PublicDevServerStopRequest }>(
      "/dev-server",
      this.stopDevServer.bind(this),
    );
  }

  private async startDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStartRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStartResponse> {
    const { prototype_id, framework, files, file_scope } = request.body;

    if (!prototype_id || !framework || !files || !file_scope) {
      customlog("error", "Missing required parameters:", { prototype_id, framework, files: files?.length, file_scope });
      reply.code(400);
      return {
        status: "error",
        build_errors: [
          {
            message: "prototype_id, framework, files, and file_scope are required",
            type: "build",
          },
        ],
        build_warnings: [],
      };
    }

    try {
      const buildErrors: CodeError[] = [];
      const buildWarnings: CodeWarning[] = [];

      // Files are now already in FileInput format
      const fileInputs: FileInput[] = files;

      // Handle file scope
      const projectDir = path.join(this.workDir, prototype_id);
      
      if (file_scope === "complete") {
        // Remove existing directory if it exists
        try {
          await fs.rm(projectDir, { recursive: true, force: true });
        } catch (error: any) {
          customlog("debug", "Directory removal failed (expected for new projects):", error.message);
        }
        // Create new directory and write all files
        await fs.mkdir(projectDir, { recursive: true });
        await this.writeProjectFiles(fileInputs, projectDir);
        
        // Install dependencies for new project
        try {
          await this.installDependenciesWithErrorParsing(projectDir, buildErrors, buildWarnings);
        } catch (error: any) {
          customlog("error", "Dependency installation failed for complete scope:", error.message, error.stack);
          buildErrors.push({
            message: `Dependency installation failed: ${error.message}`,
            type: "dependency",
          });
        }
      } else if (file_scope === "updates") {
        // Check if project directory exists
        try {
          await fs.stat(projectDir);
          // Update only the provided files
          await this.writeProjectFiles(fileInputs, projectDir);
          
          // Check if package.json was updated and reinstall if needed
          const packageJsonUpdated = fileInputs.some(file => file.path === "package.json");
          if (packageJsonUpdated) {
            try {
              await this.installDependenciesWithErrorParsing(projectDir, buildErrors, buildWarnings);
            } catch (error: any) {
              customlog("error", "Dependency update failed for package.json change:", error.message, error.stack);
              buildErrors.push({
                message: `Dependency update failed: ${error.message}`,
                type: "dependency",
              });
            }
          }
        } catch (error: any) {
          customlog("info", "Project directory doesn't exist, treating as complete scope:", error.message);
          await fs.mkdir(projectDir, { recursive: true });
          await this.writeProjectFiles(fileInputs, projectDir);
          try {
            await this.installDependenciesWithErrorParsing(projectDir, buildErrors, buildWarnings);
          } catch (error: any) {
            customlog("error", "Dependency installation failed for new project directory:", error.message, error.stack);
            buildErrors.push({
              message: `Dependency installation failed: ${error.message}`,
              type: "dependency",
            });
          }
        }
      }

      // Start the dev server using ExpoDevServerService
      let tunnelUrl: string | undefined;
      
      try {
        // Check if dev server is already running for this prototype
        const mockRequest = {
          body: {
            prototypeId: prototype_id,
            files: fileInputs,
          },
        } as FastifyRequest<{ Body: any }>;

        const mockReply = {
          code: () => mockReply,
          send: (data: any) => data,
        } as any;

        // Use the existing ExpoDevServerService start logic
        const startResponse = await (this.expoDevServerService as any).startDevServer(mockRequest, mockReply);
        
        if (startResponse.success && startResponse.tunnelUrl) {
          tunnelUrl = startResponse.tunnelUrl;
        } else if (startResponse.error) {
          customlog("error", "Dev server start failed:", startResponse.error, startResponse);
          buildErrors.push({
            message: `Dev server start failed: ${startResponse.error}`,
            type: "runtime",
          });
        }
      } catch (error: any) {
        customlog("error", "Failed to start dev server:", error.message, error.stack);
        buildErrors.push({
          message: `Failed to start dev server: ${error.message}`,
          type: "runtime",
        });
      }

      return {
        status: buildErrors.length > 0 ? "error" : "success",
        tunnel_url: tunnelUrl,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    } catch (error: any) {
      customlog("error", "Internal server error in startDevServer:", error.message, error.stack);
      reply.code(500);
      return {
        status: "error",
        build_errors: [
          {
            message: `Internal server error: ${error.message}`,
            type: "build",
          },
        ],
        build_warnings: [],
      };
    }
  }

  private async stopDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStopRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStopResponse> {
    const { prototype_id } = request.body;

    if (!prototype_id) {
      customlog("error", "Missing prototype_id in stopDevServer request");
      reply.code(400);
      return {
        status: "error",
        build_errors: [
          {
            message: "prototype_id is required",
            type: "build",
          },
        ],
        build_warnings: [],
      };
    }

    try {
      const buildErrors: CodeError[] = [];
      const buildWarnings: CodeWarning[] = [];

      // Stop the dev server using ExpoDevServerService
      try {
        const mockRequest = {} as FastifyRequest;
        const mockReply = {
          code: () => mockReply,
          send: (data: any) => data,
        } as any;

        await (this.expoDevServerService as any).stopDevServer(mockRequest, mockReply);
      } catch (error: any) {
        customlog("warn", "Failed to stop dev server:", error.message, error.stack);
        buildWarnings.push({
          message: `Failed to stop dev server: ${error.message}`,
          type: "build",
        });
      }

      // Generate build using BuilderService
      const projectDir = path.join(this.workDir, prototype_id);
      let buildUrl: string | undefined;

      try {
        // Read all files from the project directory
        const files = await this.readAllFilesFromDirectory(projectDir);
        
        if (files.length === 0) {
          customlog("error", "No files found in project directory:", projectDir);
          buildErrors.push({
            message: "No files found in project directory",
            type: "build",
          });
        } else {
          // Use BuilderService to build and deploy
          const mockBuildRequest = {
            body: {
              prototypeId: prototype_id,
              files: files,
            },
          } as FastifyRequest<{ Body: any }>;

          const mockReply = {
            code: () => mockReply,
            send: (data: any) => data,
          } as any;

          const buildResponse = await this.builderService.buildAndDeployProject(
            mockBuildRequest,
            mockReply,
          );

          if (buildResponse.success && buildResponse.buildUrl) {
            buildUrl = buildResponse.buildUrl;
            
            // Parse build log for errors and warnings
            if (buildResponse.buildLog) {
              this.parseBuildLogForErrors(buildResponse.buildLog, buildErrors, buildWarnings);
            }
          } else if (buildResponse.error) {
            customlog("error", "Build failed:", buildResponse.error, buildResponse.buildLog);
            buildErrors.push({
              message: `Build failed: ${buildResponse.error}`,
              type: "build",
            });
            
            // Parse build log for additional context
            if (buildResponse.buildLog) {
              this.parseBuildLogForErrors(buildResponse.buildLog, buildErrors, buildWarnings);
            }
          }
        }
      } catch (error: any) {
        customlog("error", "Build process failed:", error.message, error.stack);
        buildErrors.push({
          message: `Build process failed: ${error.message}`,
          type: "build",
        });
      }

      return {
        status: buildErrors.length > 0 ? "error" : "success",
        build_url: buildUrl,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    } catch (error: any) {
      customlog("error", "Internal server error in stopDevServer:", error.message, error.stack);
      reply.code(500);
      return {
        status: "error",
        build_errors: [
          {
            message: `Internal server error: ${error.message}`,
            type: "build",
          },
        ],
        build_warnings: [],
      };
    }
  }

  // Helper methods
  private async writeProjectFiles(
    files: FileInput[],
    projectDir: string,
  ): Promise<void> {
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

  private async readAllFilesFromDirectory(directoryPath: string): Promise<FileInput[]> {
    const files: FileInput[] = [];

    const readDirectory = async (currentPath: string, relativePath: string = "") => {
      try {
        const items = await fs.readdir(currentPath);

        for (const item of items) {
          // Skip node_modules and other build artifacts
          if (["node_modules", "dist", ".expo", ".git", ".next"].includes(item)) {
            continue;
          }

          const fullPath = path.join(currentPath, item);
          const itemRelativePath = path.join(relativePath, item);
          const stats = await fs.stat(fullPath);

          if (stats.isDirectory()) {
            await readDirectory(fullPath, itemRelativePath);
          } else if (stats.isFile()) {
            // Detect if file is binary and handle accordingly
            const isBinary = this.detectBinaryFile(fullPath, item);
            
            if (isBinary) {
              const binaryContent = await fs.readFile(fullPath);
              files.push({
                path: itemRelativePath,
                content: binaryContent.toString('base64'),
                isBase64: true,
              });
            } else {
              const content = await fs.readFile(fullPath, "utf8");
              files.push({
                path: itemRelativePath,
                content: content,
                isBase64: false,
              });
            }
          }
        }
      } catch (error: any) {
        customlog("warn", "Failed to read directory:", currentPath, error.message);
      }
    };

    await readDirectory(directoryPath);
    return files;
  }

  private async installDependenciesWithErrorParsing(
    projectDir: string,
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
  ): Promise<void> {
    // Create a simple logger that captures output
    const logger = {
      log: (message: string, success: boolean = true, output: string = "", error: string = "") => {
        if (!success) {
          const outputToProcess = error || output || '';
          this.parseNpmOutput(outputToProcess, buildErrors, buildWarnings);
        }
      },
      getBuildLog: () => [],
      getElapsedTime: () => 0,
    };

    // Use shared installDependencies function
    await installDependencies(projectDir, logger);
  }

  private parseNpmOutput(
    output: string,
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
  ): void {
    if (!output || typeof output !== 'string') {
      return;
    }
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Parse npm errors
      if (trimmedLine.includes('npm ERR!') || trimmedLine.includes('ERROR')) {
        buildErrors.push({
          message: trimmedLine.replace(/^npm ERR!\s*/, ''),
          type: 'dependency',
        });
      }
      
      // Parse npm warnings
      if (trimmedLine.includes('npm WARN') || trimmedLine.includes('WARNING')) {
        buildWarnings.push({
          message: trimmedLine.replace(/^npm WARN\s*/, ''),
          type: 'deprecation',
        });
      }
    }
  }

  private parseBuildLogForErrors(
    buildLog: any[],
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
  ): void {
    for (const entry of buildLog) {
      if (!entry.success && entry.error) {
        // Try to parse TypeScript/JavaScript errors
        const errorMatch = entry.error.match(/(.+\.tsx?):(\d+):(\d+)\s*-\s*error\s*TS(\d+):\s*(.+)/);
        if (errorMatch) {
          buildErrors.push({
            message: errorMatch[5],
            file: errorMatch[1],
            line: parseInt(errorMatch[2]),
            column: parseInt(errorMatch[3]),
            type: 'syntax',
          });
        } else {
          buildErrors.push({
            message: entry.error,
            type: 'build',
          });
        }
      }
      
      // Parse warnings from output
      if (entry.output && entry.output.includes('warning')) {
        const lines = entry.output.split('\n');
        for (const line of lines) {
          if (line.toLowerCase().includes('warning')) {
            buildWarnings.push({
              message: line.trim(),
              type: 'build',
            });
          }
        }
      }
    }
  }

  private detectBinaryFile(_filePath: string, fileName: string): boolean {
    // Define common binary file extensions
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp', '.tiff',
      '.woff', '.woff2', '.ttf', '.otf', '.eot',
      '.mp4', '.webm', '.mov', '.avi', '.mkv',
      '.mp3', '.wav', '.ogg', '.m4a', '.flac',
      '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
      '.exe', '.dll', '.so', '.dylib',
      '.bin', '.dat', '.db', '.sqlite'
    ];
    
    const ext = path.extname(fileName).toLowerCase();
    return binaryExtensions.includes(ext);
  }
}