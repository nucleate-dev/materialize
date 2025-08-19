import { Database } from "@/lib/types/database.types";
import { convertPrototypeFilesForBuildWorker } from "@/lib/utils/buildWorkerUtils";
import { saveFilesToDatabaseWithAuth } from "@/lib/utils/files/saveFilesToDatabase";
import { getPrototypeFiles } from "@/lib/utils/prototypeAuth";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Set max duration for Vercel serverless function to 3 minutes
export const maxDuration = 180;

// Request validation schema using Database Row types to match MaterializeRenderSection
const StartDevServerSchema = z.object({
  files: z.array(
    z.object({
      contents: z.string(),
      name: z.string(),
      file_type: z.enum(["text", "asset"]),
      prototype_id: z.string(),
      id: z.string().optional(),
      storage_path: z.string().nullable().optional(),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
    }),
  ),
  prototype_id: z.string(),
  file_scope: z.enum(["updates", "complete"]).optional().default("complete"),
});

// Dispatch precheck response types
interface PrecheckResponse {
  success: boolean;
  state: "dne" | "active_dev_server" | "active_build";
  status: "updating" | "error" | "stable" | "creating" | null;
  viewing_url: string;
}

// Dispatch response types
interface DispatchResponse {
  status: "success" | "error";
  viewing_url: string;
  build_errors: Array<{
    message: string;
    file?: string;
    line?: number;
    column?: number;
    type: "build" | "runtime" | "dependency" | "syntax";
  }>;
  build_warnings: Array<{
    message: string;
    file?: string;
    line?: number;
    column?: number;
    type: "build" | "deprecation" | "performance" | "unused";
  }>;
  error_message?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Validate JWT
    const token = request.headers.get("authorization")?.split(" ")[1];
    if (!token || !request.headers.get("authorization")?.startsWith("Bearer")) {
      console.error("No JWT token provided");
      return NextResponse.json(
        { error: "Unauthorized: No token provided" },
        { status: 401 },
      );
    }

    let userID: string;
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!,
      ) as jwt.JwtPayload;
      userID = decoded.sub as string;
    } catch (error) {
      console.error("Invalid JWT token: ", error);
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 },
      );
    }

    if (!userID) {
      console.error("User ID is null or undefined from JWT token");
      return NextResponse.json(
        { error: "Unauthorized: Invalid user ID" },
        { status: 401 },
      );
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const validationResult = StartDevServerSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.errors,
        },
        { status: 400 },
      );
    }

    const { files, prototype_id, file_scope } = validationResult.data;
    console.log("🔍 [start-dev-server] Files:", files.length);
    console.log("🔍 [start-dev-server] Prototype ID:", prototype_id);
    console.log("🔍 [start-dev-server] File scope:", file_scope);

    // 3. Fetch dispatch-precheck to verify permissions and build status
    const precheckResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/dispatch-precheck`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jwt: token,
          prototype_id: prototype_id,
        }),
      },
    );

    if (!precheckResponse.ok) {
      const precheckError = await precheckResponse.json();

      if (precheckResponse.status === 401) {
        return NextResponse.json(
          { error: "Unauthorized", message: precheckError.message },
          { status: 401 },
        );
      }

      if (precheckResponse.status === 404) {
        return NextResponse.json(
          { error: "Prototype not found", message: precheckError.message },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: "Precheck failed", message: precheckError.message },
        { status: 500 },
      );
    }

    const precheckData: PrecheckResponse = await precheckResponse.json();
    console.log(
      "🔍 [start-dev-server] Dispatch precheck response:",
      precheckData,
    );

    // 4. Check if build is already in progress
    if (
      precheckData.status === "updating" ||
      precheckData.status === "creating"
    ) {
      return NextResponse.json(
        {
          error: "Build already in progress",
          message:
            "A dev server is currently starting for this prototype. Please wait for it to complete.",
        },
        { status: 409 },
      );
    }

    // 5. Save only text files to database (don't overwrite existing assets)
    // Filter to only include text files from the editor - exclude asset files
    const textFilesOnly = Object.fromEntries(
      files
        .filter((file) => {
          // Only include files that are already text type or don't have a file_type yet
          // This prevents us from overwriting asset files that were loaded from database
          return !file.file_type || file.file_type === "text";
        })
        .map((file) => [file.name, file]),
    );

    console.log(
      `🔍 [start-dev-server] Saving ${Object.keys(textFilesOnly).length} text files to database for prototype ${prototype_id} (filtered from ${files.length} total files)`,
    );

    // Only save text files - these are the files that were changed in the editor
    const textFilesWithType = Object.fromEntries(
      Object.entries(textFilesOnly).map(([path, file]) => [
        path,
        {
          ...file,
          file_type: "text" as const,
          storage_path: null, // Text files don't have storage paths
        },
      ]),
    );

    try {
      await saveFilesToDatabaseWithAuth(token, prototype_id, textFilesWithType);
    } catch (saveError) {
      console.error("Error saving files to database:", saveError);
      return NextResponse.json(
        {
          error: "Failed to save files",
          message:
            saveError instanceof Error ? saveError.message : "Unknown error",
        },
        { status: 500 },
      );
    }

    // 6. Prepare files for dispatch API - merge changed text files with existing assets
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    );

    // Get existing files to find assets
    const prototypeFilesResult = await getPrototypeFiles(
      supabase,
      prototype_id,
    );

    if (!prototypeFilesResult.success || !prototypeFilesResult.files) {
      return NextResponse.json(
        {
          error: "Failed to fetch prototype files",
          message:
            prototypeFilesResult.message ||
            "Could not retrieve all files for dev server",
        },
        { status: 500 },
      );
    }

    // Separate assets from text files
    const existingAssets = prototypeFilesResult.files.filter(
      (file) => file.file_type === "asset",
    );
    console.log(
      `🔍 Found ${existingAssets.length} existing assets:`,
      existingAssets.map((a) => a.name),
    );

    // Convert existing assets to build worker format
    const assetFilesForDispatch =
      await convertPrototypeFilesForBuildWorker(existingAssets);
    console.log(
      `✅ Converted ${assetFilesForDispatch.length} assets for dispatch`,
    );

    // Convert changed text files to build worker format
    const textFilesForDispatch: Array<{
      path: string;
      content: string;
      isBase64: boolean;
    }> = [];

    files.forEach((file) => {
      textFilesForDispatch.push({
        path: file.name,
        content: file.contents,
        isBase64: false, // Text files from CodeEditor are never base64
      });
    });

    console.log(
      `📦 Dispatch summary: ${textFilesForDispatch.length} text files + ${assetFilesForDispatch.length} assets`,
    );

    // Merge text files + assets for dispatch (preserves hot reload + includes assets)
    const filesForDispatch = [
      ...textFilesForDispatch,
      ...assetFilesForDispatch,
    ];

    // 7. Dispatch dev server start request
    console.log("Dispatching dev server start request to server");

    const dispatchResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/dispatch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jwt: token,
          prototype_id: prototype_id,
          framework: "expo_react_native",
          files: filesForDispatch,
          file_scope: file_scope,
        }),
        // Set timeout to 5 minutes for dev server operations
        signal: AbortSignal.timeout(300000),
      },
    );

    if (!dispatchResponse.ok) {
      let dispatchError;
      try {
        dispatchError = await dispatchResponse.json();
      } catch (parseError) {
        // Handle case where server returns HTML error page instead of JSON
        const textResponse = await dispatchResponse.text();
        console.error("Dispatch response is not JSON:", textResponse);
        return NextResponse.json(
          {
            error: "Server error",
            message: `Server returned status ${dispatchResponse.status}. Response was not valid JSON.`,
          },
          { status: 500 },
        );
      }
      console.error("Dispatch request failed:", dispatchError);

      if (dispatchResponse.status === 401) {
        return NextResponse.json(
          { error: "Unauthorized", message: dispatchError.error_message },
          { status: 401 },
        );
      }

      if (dispatchResponse.status === 404) {
        return NextResponse.json(
          {
            error: "Prototype not found",
            message: dispatchError.error_message,
          },
          { status: 404 },
        );
      }

      return NextResponse.json(
        {
          error: "Dev server start failed",
          message: dispatchError.error_message || "Unknown dev server error",
          build_errors: dispatchError.build_errors || [],
          build_warnings: dispatchError.build_warnings || [],
        },
        { status: 500 },
      );
    }

    let dispatchData: DispatchResponse;
    try {
      dispatchData = await dispatchResponse.json();
    } catch (parseError) {
      // Handle case where successful response is not valid JSON
      const textResponse = await dispatchResponse.text();
      console.error("Successful dispatch response is not JSON:", textResponse);
      return NextResponse.json(
        {
          error: "Server response error",
          message:
            "Server returned a successful status but response was not valid JSON.",
        },
        { status: 500 },
      );
    }
    console.log("📦 Dispatch endpoint response:", dispatchData);

    // 8. Return success response with viewing URL
    return NextResponse.json({
      success: true,
      status: dispatchData.status,
      viewing_url: dispatchData.viewing_url,
      build_errors: dispatchData.build_errors,
      build_warnings: dispatchData.build_warnings,
      message: "Files saved and dev server started successfully",
    });
  } catch (error) {
    console.error("Start dev server API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
