import { saveFilesToDatabaseWithAuth } from "@/lib/utils/files/saveFilesToDatabase";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Set max duration for Vercel serverless function to 3 minutes
export const maxDuration = 180;

// Request validation schema using Database Insert types
const SaveAndBuildSchema = z.object({
  files: z.record(
    z.string(),
    z.object({
      contents: z.string(),
      name: z.string(),
      prototype_id: z.string().optional(),
      id: z.string().optional(),
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
    const validationResult = SaveAndBuildSchema.safeParse(body);

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

    // 3. Fetch dispatch-precheck to verify permissions and build status
    const precheckResponse = await fetch(
      `${process.env.SERVER_ENDPOINT!}/dispatch-precheck`,
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
    console.log("Dispatch precheck response:", precheckData);

    // 4. Check if build is already in progress
    if (
      precheckData.status === "updating" ||
      precheckData.status === "creating"
    ) {
      return NextResponse.json(
        {
          error: "Build already in progress",
          message:
            "A build is currently in progress for this prototype. Please wait for it to complete.",
        },
        { status: 409 },
      );
    }

    // 5. Save files to database using incremental approach
    console.log(
      `Saving ${Object.keys(files).length} files to database for prototype ${prototype_id}`,
    );

    // Add required file_type field to files
    const filesWithType = Object.fromEntries(
      Object.entries(files).map(([path, file]) => [
        path,
        { ...file, file_type: "text" as const },
      ]),
    );

    try {
      await saveFilesToDatabaseWithAuth(token, prototype_id, filesWithType);
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

    // 6. Transform files for dispatch API
    const filesForDispatch: Array<{
      path: string;
      content: string;
      isBase64?: boolean;
    }> = [];
    Object.entries(files).forEach(([filePath, file]) => {
      filesForDispatch.push({
        path: filePath,
        content: file.contents,
        isBase64: false, // Text files, not base64 encoded
      });
    });

    // 7. Dispatch build request
    console.log("Dispatching build request to server");

    const dispatchResponse = await fetch(
      `${process.env.SERVER_ENDPOINT!}/dispatch`,
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
        // Set timeout to 5 minutes for build operations
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
          error: "Build failed",
          message: dispatchError.error_message || "Unknown build error",
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
          message: "Server returned a successful status but response was not valid JSON.",
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
      message: "Files saved and build completed successfully",
    });
  } catch (error) {
    console.error("Save and build API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
