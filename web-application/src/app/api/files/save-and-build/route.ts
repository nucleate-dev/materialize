import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Database } from "@/lib/types/database.types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

// Request validation schema
const SaveAndBuildSchema = z.object({
  files: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    contents: z.string(),
    prototype_id: z.string().nullable(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })),
  prototype_id: z.string(),
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
          details: validationResult.error.errors 
        },
        { status: 400 },
      );
    }

    const { files, prototype_id } = validationResult.data;

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
    if (precheckData.status === "updating" || precheckData.status === "creating") {
      return NextResponse.json(
        { 
          error: "Build already in progress", 
          message: "A build is currently in progress for this prototype. Please wait for it to complete." 
        },
        { status: 409 },
      );
    }

    // 5. Instantiate authenticated Supabase client
    const authenticatedSupabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // 6. Save files to database
    console.log(`Saving ${files.length} files to database for prototype ${prototype_id}`);

    // Delete existing files for this prototype
    const { error: deleteError } = await authenticatedSupabase
      .from("prototype_files")
      .delete()
      .eq("prototype_id", prototype_id);

    if (deleteError) {
      console.error("Error deleting existing files:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete existing files", message: deleteError.message },
        { status: 500 },
      );
    }

    // Insert new files
    const filesToInsert = files.map((file) => ({
      name: file.name,
      contents: file.contents,
      prototype_id: prototype_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: insertError } = await authenticatedSupabase
      .from("prototype_files")
      .insert(filesToInsert);

    if (insertError) {
      console.error("Error inserting files:", insertError);
      return NextResponse.json(
        { error: "Failed to save files", message: insertError.message },
        { status: 500 },
      );
    }

    console.log("Successfully saved files to database");

    // 7. Transform files for dispatch API
    const filesForDispatch: Record<string, string> = {};
    files.forEach((file) => {
      filesForDispatch[file.name] = file.contents;
    });

    // 8. Dispatch build request
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
          file_scope: "complete",
          hot_reload: false,
        }),
      },
    );

    if (!dispatchResponse.ok) {
      const dispatchError = await dispatchResponse.json();
      console.error("Dispatch request failed:", dispatchError);
      
      if (dispatchResponse.status === 401) {
        return NextResponse.json(
          { error: "Unauthorized", message: dispatchError.error_message },
          { status: 401 },
        );
      }
      
      if (dispatchResponse.status === 404) {
        return NextResponse.json(
          { error: "Prototype not found", message: dispatchError.error_message },
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

    const dispatchData: DispatchResponse = await dispatchResponse.json();
    console.log("=æ Dispatch endpoint response:", dispatchData);

    // 9. Return success response with viewing URL
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