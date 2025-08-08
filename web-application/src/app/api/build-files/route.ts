import { NextRequest, NextResponse } from "next/server";
import { PostHog } from "posthog-node";
import {
  LoggingEventSource,
  ExceptionEvents,
  SuccessEvents,
} from "@/LoggingEvents";
import jwt from "jsonwebtoken";
import { supabase } from "@/ClientConstants";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const execAsync = promisify(exec);

const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
});

/**
 * API Route to build prototype files for React Native web and upload to Supabase bucket.
 *
 * This serverless function handles HTTP POST requests to:
 * 1. Accept prototype files from the client
 * 2. Use Bun to build the files for React Native web
 * 3. Upload the built files to Supabase bucket "prototype-builds"
 *
 * @param {NextRequest} req - The incoming request object. It expects a JSON body with:
 *  - files (Record<string, string>): Object containing file paths as keys and file content as values
 *  - prototypeId (string): The ID of the prototype being built
 *
 * @returns {NextResponse} - The outgoing response object. It returns:
 *  - 200 with the build result and upload URL
 *  - 401 for authentication errors
 *  - 400 for build or upload errors
 *  - 405 for non-POST requests
 */
export async function POST(req: NextRequest) {
  // JWT Token Validation
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.split(" ")[1];
  if (!token || !authHeader?.startsWith("Bearer")) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.NO_JWT_TOKEN_PROVIDED,
      properties: {
        source: LoggingEventSource.API_BUILD_FILES,
      },
    });
    await posthog.shutdown();
    console.error("No token provided");
    return NextResponse.json(
      { error: "Unauthorized: No token provided" },
      { status: 401 },
    );
  }

  let userID;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    userID = decoded.sub;

    // Validate that userID is present and valid
    if (!userID || typeof userID !== "string") {
      console.error("Invalid or missing user ID from JWT token:", {
        userID,
        decodedPayload: decoded,
      });
      posthog.capture({
        distinctId: "unknown",
        event: ExceptionEvents.INVALID_JWT_TOKEN,
        properties: {
          source: LoggingEventSource.API_BUILD_FILES,
        },
      });
      await posthog.shutdown();
      return NextResponse.json(
        { error: "Unauthorized: Invalid user ID in token" },
        { status: 401 },
      );
    }
  } catch (error) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.INVALID_JWT_TOKEN,
      properties: {
        source: LoggingEventSource.API_BUILD_FILES,
        error: error,
      },
    });
    await posthog.shutdown();
    console.error("Invalid token: ", error);
    return NextResponse.json(
      { error: "Unauthorized: Invalid token" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json();
    const { files, prototypeId } = body;

    if (!files || !prototypeId) {
      return NextResponse.json(
        { error: "Missing files or prototypeId" },
        { status: 400 },
      );
    }

    // Create temporary directory for build
    const buildId = randomBytes(16).toString("hex");
    const tempDir = path.join("/tmp", `build-${buildId}`);
    const srcDir = path.join(tempDir, "src");
    const distDir = path.join(tempDir, "dist");

    await fs.mkdir(srcDir, { recursive: true });
    await fs.mkdir(distDir, { recursive: true });

    // Write files to temporary directory
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(srcDir, filePath);
      const dirPath = path.dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, content as string);
    }

    // Create package.json for React Native Web build
    const packageJson = {
      name: `prototype-${prototypeId}`,
      version: "1.0.0",
      private: true,
      scripts: {
        build: "bun build src/App.tsx --outdir dist --target web",
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0",
        "react-native": "^0.72.0",
        "react-native-web": "^0.19.0",
      },
      devDependencies: {
        "@types/react": "^18.0.0",
        "@types/react-dom": "^18.0.0",
        typescript: "^5.0.0",
      },
    };

    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );

    // Create basic HTML template
    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prototype ${prototypeId}</title>
    <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; }
        #root { width: 100%; height: 100vh; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script src="./App.js"></script>
</body>
</html>`;

    await fs.writeFile(path.join(distDir, "index.html"), htmlTemplate);

    // Install dependencies and build with Bun or fallback to npm/npx
    try {
      let buildCommand = "";
      let installCommand = "";

      // Check if bun is available, otherwise fallback to npm
      try {
        await execAsync("which bun", { cwd: tempDir });
        installCommand = "bun install";
        buildCommand = "bun build src/App.tsx --outdir dist --target web";
      } catch {
        // Fallback to npm with esbuild
        installCommand = "npm install";
        buildCommand =
          "npx esbuild src/App.tsx --bundle --outdir=dist --target=es2020 --platform=browser --format=iife --global-name=App";

        // Update package.json for npm fallback
        const updatedPackageJson = {
          ...packageJson,
          dependencies: {
            ...packageJson.dependencies,
            esbuild: "^0.19.0",
          },
          scripts: {
            build: buildCommand,
          },
        };

        await fs.writeFile(
          path.join(tempDir, "package.json"),
          JSON.stringify(updatedPackageJson, null, 2),
        );
      }

      // Install dependencies
      await execAsync(installCommand, { cwd: tempDir });

      // Build the project
      await execAsync(buildCommand, { cwd: tempDir });
    } catch (buildError) {
      console.error("Build error:", buildError);

      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      posthog.capture({
        distinctId: userID as string,
        event: ExceptionEvents.BUILD_FAILED,
        properties: {
          source: LoggingEventSource.API_BUILD_FILES,
          prototypeId,
          error: buildError,
        },
      });
      await posthog.shutdown();

      return NextResponse.json(
        { error: "Build failed", details: buildError },
        { status: 400 },
      );
    }

    // Read built files
    const builtFiles: Record<string, Buffer> = {};
    const distFiles = await fs.readdir(distDir);

    for (const file of distFiles) {
      const filePath = path.join(distDir, file);
      const stat = await fs.stat(filePath);

      if (stat.isFile()) {
        builtFiles[file] = await fs.readFile(filePath);
      }
    }

    // Upload files to Supabase bucket
    const uploadResults: string[] = [];

    for (const [fileName, fileContent] of Object.entries(builtFiles)) {
      const bucketPath = `${prototypeId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from("sites")
        .upload(bucketPath, fileContent, {
          contentType: fileName.endsWith(".html")
            ? "text/html"
            : fileName.endsWith(".js")
              ? "application/javascript"
              : fileName.endsWith(".css")
                ? "text/css"
                : "application/octet-stream",
          upsert: true,
        });

      if (error) {
        console.error("Upload error:", error);
        // Cleanup temp directory
        await fs.rm(tempDir, { recursive: true, force: true });

        posthog.capture({
          distinctId: userID as string,
          event: ExceptionEvents.UPLOAD_FAILED,
          properties: {
            source: LoggingEventSource.API_BUILD_FILES,
            prototypeId,
            error: error,
          },
        });
        await posthog.shutdown();

        return NextResponse.json(
          { error: "Upload failed", details: error },
          { status: 400 },
        );
      }

      uploadResults.push(data.path);
    }

    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    // Get public URL for the main index.html
    const { data: urlData } = supabase.storage
      .from("prototype-builds")
      .getPublicUrl(`${userID}/${prototypeId}/${buildId}/index.html`);

    posthog.capture({
      distinctId: userID as string,
      event: SuccessEvents.PROTOTYPE_BUILD_SUCCESS,
      properties: {
        source: LoggingEventSource.API_BUILD_FILES,
        prototypeId,
        buildId,
        filesCount: Object.keys(files).length,
        uploadedFiles: uploadResults.length,
      },
    });
    await posthog.shutdown();

    return NextResponse.json(
      {
        success: true,
        buildId,
        publicUrl: urlData.publicUrl,
        uploadedFiles: uploadResults,
      },
      { status: 200 },
    );
  } catch (error) {
    posthog.capture({
      distinctId: userID as string,
      event: ExceptionEvents.BUILD_FILES_GENERIC_ERROR,
      properties: {
        source: LoggingEventSource.API_BUILD_FILES,
        error: error,
      },
    });
    await posthog.shutdown();
    console.error("Exception in build-files API: ", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
