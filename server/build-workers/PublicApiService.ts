import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { ExpoDevServerService } from "./ExpoDevServerService.js";
import { customlog } from "./logger.js";
import { PrototypeFileInput } from "./shared-utils.js";
import {
  CodeError,
  CodeWarning,
  PublicBuildAndDeployRequest,
  PublicBuildAndDeployResponse,
  PublicDevServerStartRequest,
  PublicDevServerStartResponse,
  PublicDevServerStopRequest,
  PublicDevServerStopResponse,
} from "./types/BuildWorkerTypes.js";
import { PrototypeAssetInputWithContent } from "./types/PublicAPITypes.js";

export class PublicApiService {
  private readonly expoDevServerService: ExpoDevServerService;
  private readonly workDir: string;

  constructor(expoDevServerService: ExpoDevServerService, workDir: string) {
    this.expoDevServerService = expoDevServerService;
    this.workDir = workDir;
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /dev-server
    app.post<{ Body: PublicDevServerStartRequest }>(
      "/dev-server",
      this.startDevServer.bind(this),
    );

    // GET /dev-server/status
    app.get("/dev-server/status", this.getDevServerStatus.bind(this));

    // DELETE /dev-server
    app.delete<{ Body: PublicDevServerStopRequest }>(
      "/dev-server",
      this.stopDevServer.bind(this),
    );

    // POST /build-and-deploy
    app.post<{ Body: PublicBuildAndDeployRequest }>(
      "/build-and-deploy",
      this.buildAndDeploy.bind(this),
    );
  }

  private async startDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStartRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStartResponse> {
    try {
      if (request.body.file_scope === "complete") {
        const startResponse = await this.expoDevServerService.startDevServer(
          request,
          reply,
        );

        // Convert response format from ExpoDevServerService to PublicApiService format
        return {
          status: startResponse.success ? "success" : "error",
          tunnel_url: startResponse.tunnelUrl,
          build_errors: startResponse.build_errors || [],
          build_warnings: startResponse.build_warnings || [],
        };
      } else if (request.body.file_scope === "updates") {
        const startResponse =
          await this.expoDevServerService.updateDevServerFiles(
            request.body.files,
            request.body.assets,
          );
        return {
          status: startResponse.success ? "success" : "error",
          tunnel_url: startResponse.tunnelUrl,
          build_errors: startResponse.build_errors || [],
          build_warnings: startResponse.build_warnings || [],
        };
      }
      // Direct call to ExpoDevServerService with the same request
      return {
        status: "error",
        build_errors: [
          {
            message: "Invalid file scope",
            type: "build",
          },
        ],
        build_warnings: [],
      };
    } catch (error: any) {
      customlog(
        "error",
        "Internal server error in startDevServer:",
        error.message,
        error.stack,
      );
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

  private async getDevServerStatus(
    _request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      // Access the private getStatus method through the service
      const status = await (this.expoDevServerService as any).getStatus(
        _request,
        reply,
      );
      return status;
    } catch (error: any) {
      customlog("error", "Failed to get dev server status:", error.message);
      return reply.code(500).send({
        status: "error",
        message: `Failed to get status: ${error.message}`,
      });
    }
  }

  private async stopDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStopRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStopResponse> {
    const { prototype_id } = request.body;

    // If no prototype_id provided, try to stop any running dev server
    if (!prototype_id) {
      customlog(
        "info",
        "No prototype_id provided, attempting to stop any running dev server",
      );
      try {
        const result = await (this.expoDevServerService as any).stopDevServer(
          request,
          reply,
        );
        return result;
      } catch (error: any) {
        customlog("error", "Failed to stop dev server:", error.message);
        return {
          status: "error",
          build_errors: [
            {
              message: `Failed to stop dev server: ${error.message}`,
              type: "build",
            },
          ],
          build_warnings: [],
        };
      }
    }

    try {
      const buildErrors: CodeError[] = [];
      const buildWarnings: CodeWarning[] = [];

      const projectDir = path.join(this.workDir, prototype_id);
      let buildUrl: string | undefined;

      try {
        // Read all files from the project directory
        const { files, assets } =
          await this.readAllFilesFromDirectory(projectDir);

        if (files.length === 0) {
          customlog(
            "error",
            "No files found in project directory:",
            projectDir,
          );
          buildErrors.push({
            message: "No files found in project directory",
            type: "build",
          });
        } else {
          // Use ExpoDevServerService to build and deploy
          const buildResponse =
            await this.expoDevServerService.buildAndDeployProjectCore(
              prototype_id,
            );

          if (buildResponse.success && buildResponse.buildUrl) {
            buildUrl = buildResponse.buildUrl;

            // Parse build log for errors and warnings
            if (buildResponse.buildLog) {
              this.parseBuildLogForErrors(
                buildResponse.buildLog,
                buildErrors,
                buildWarnings,
              );
            }
          } else if (buildResponse.error) {
            customlog(
              "error",
              "Build failed:",
              buildResponse.error,
              buildResponse.buildLog,
            );
            buildErrors.push({
              message: `Build failed: ${buildResponse.error}`,
              type: "build",
            });

            // Parse build log for additional context
            if (buildResponse.buildLog) {
              this.parseBuildLogForErrors(
                buildResponse.buildLog,
                buildErrors,
                buildWarnings,
              );
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

      // Stop the dev server using ExpoDevServerService
      try {
        await this.expoDevServerService.shutdown();
      } catch (error: any) {
        customlog(
          "warn",
          "Failed to stop dev server:",
          error.message,
          error.stack,
        );
        buildWarnings.push({
          message: `Failed to stop dev server: ${error.message}`,
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
      customlog(
        "error",
        "Internal server error in stopDevServer:",
        error.message,
        error.stack,
      );
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

  private async buildAndDeploy(
    request: FastifyRequest<{ Body: PublicBuildAndDeployRequest }>,
    reply: FastifyReply,
  ): Promise<PublicBuildAndDeployResponse> {
    const { prototype_id, framework } = request.body;

    customlog("info", "POST /build-and-deploy request:", {
      prototype_id,
      framework,
    });

    if (!prototype_id || !framework) {
      customlog("error", "Missing required parameters:", {
        prototype_id,
        framework,
      });
      reply.code(400);
      return {
        status: "error",
        build_errors: [
          {
            message: "prototype_id and framework are required",
            type: "build",
          },
        ],
        build_warnings: [],
      };
    }

    try {
      const buildErrors: CodeError[] = [];
      const buildWarnings: CodeWarning[] = [];

      // Check if project directory exists and read files from disk
      const projectDir = path.join(this.workDir, prototype_id);

      try {
        await fs.stat(projectDir);
      } catch (error: any) {
        customlog("error", "Project directory not found:", {
          projectDir,
          error: error.message,
        });
        return reply.code(404).send({
          status: "error",
          build_errors: [
            {
              message:
                "Project not found. Please start dev server first to create project files.",
              type: "build",
            },
          ],
          build_warnings: [],
        });
      }

      // Read all files from the project directory
      const { files, assets } =
        await this.readAllFilesFromDirectory(projectDir);

      if (files.length === 0) {
        customlog("error", "No files found in project directory:", projectDir);
        return reply.code(400).send({
          status: "error",
          build_errors: [
            {
              message: "No files found in project directory",
              type: "build",
            },
          ],
          build_warnings: [],
        });
      }

      // Use ExpoDevServerService to build and deploy
      let buildUrl: string | undefined;

      try {
        const buildResponse =
          await this.expoDevServerService.buildAndDeployProjectCore(
            prototype_id,
          );

        if (buildResponse.success && buildResponse.buildUrl) {
          buildUrl = buildResponse.buildUrl;

          // Parse build log for errors and warnings
          if (buildResponse.buildLog) {
            this.parseBuildLogForErrors(
              buildResponse.buildLog,
              buildErrors,
              buildWarnings,
            );
          }
        } else if (buildResponse.error) {
          customlog(
            "error",
            "Build and deploy failed:",
            buildResponse.error,
            buildResponse.buildLog,
          );
          buildErrors.push({
            message: `Build and deploy failed: ${buildResponse.error}`,
            type: "build",
          });

          // Parse build log for additional context
          if (buildResponse.buildLog) {
            this.parseBuildLogForErrors(
              buildResponse.buildLog,
              buildErrors,
              buildWarnings,
            );
          }
        }
      } catch (error: any) {
        customlog(
          "error",
          "Build and deploy process failed:",
          error.message,
          error.stack,
        );
        buildErrors.push({
          message: `Build and deploy process failed: ${error.message}`,
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
      customlog(
        "error",
        "Internal server error in buildAndDeploy:",
        error.message,
        error.stack,
      );
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
  private async readAllFilesFromDirectory(directoryPath: string): Promise<{
    assets: PrototypeAssetInputWithContent[];
    files: PrototypeFileInput[];
  }> {
    const assets: PrototypeAssetInputWithContent[] = [];
    const files: PrototypeFileInput[] = [];

    const readDirectory = async (
      currentPath: string,
      relativePath: string = "",
    ) => {
      try {
        const items = await fs.readdir(currentPath);

        for (const item of items) {
          // Skip node_modules and other build artifacts
          if (
            ["node_modules", "dist", ".expo", ".git", ".next"].includes(item)
          ) {
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
              assets.push({
                name: itemRelativePath,
                contents: binaryContent.toString("base64"),
                storage_url: "",
                prototype_id: "",
                created_at: "",
                updated_at: "",
                id: "",
              });
            } else {
              const content = await fs.readFile(fullPath, "utf8");
              files.push({
                name: itemRelativePath,
                contents: content,
              });
            }
          }
        }
      } catch (error: any) {
        customlog(
          "warn",
          "Failed to read directory:",
          currentPath,
          error.message,
        );
      }
    };

    await readDirectory(directoryPath);
    return {
      files,
      assets,
    };
  }

  private parseBuildLogForErrors(
    buildLog: any[],
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
  ): void {
    for (const entry of buildLog) {
      if (!entry.success && entry.error) {
        // Try to parse TypeScript/JavaScript errors
        const errorMatch = entry.error.match(
          /(.+\.tsx?):(\d+):(\d+)\s*-\s*error\s*TS(\d+):\s*(.+)/,
        );
        if (errorMatch) {
          buildErrors.push({
            message: errorMatch[5],
            file: errorMatch[1],
            line: parseInt(errorMatch[2]),
            column: parseInt(errorMatch[3]),
            type: "syntax",
          });
        } else {
          buildErrors.push({
            message: entry.error,
            type: "build",
          });
        }
      }

      // Parse warnings from output
      if (entry.output && entry.output.includes("warning")) {
        const lines = entry.output.split("\n");
        for (const line of lines) {
          if (line.toLowerCase().includes("warning")) {
            buildWarnings.push({
              message: line.trim(),
              type: "build",
            });
          }
        }
      }
    }
  }

  private detectBinaryFile(_filePath: string, fileName: string): boolean {
    // Define common binary file extensions
    const binaryExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".ico",
      ".svg",
      ".webp",
      ".bmp",
      ".tiff",
      ".woff",
      ".woff2",
      ".ttf",
      ".otf",
      ".eot",
      ".mp4",
      ".webm",
      ".mov",
      ".avi",
      ".mkv",
      ".mp3",
      ".wav",
      ".ogg",
      ".m4a",
      ".flac",
      ".pdf",
      ".zip",
      ".tar",
      ".gz",
      ".7z",
      ".rar",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".bin",
      ".dat",
      ".db",
      ".sqlite",
    ];

    const ext = path.extname(fileName).toLowerCase();
    return binaryExtensions.includes(ext);
  }
}
