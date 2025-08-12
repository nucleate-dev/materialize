import { Database } from "@/lib/types/database.types";
import {
  authenticatePrototypeUser,
  checkPrototypeLimit,
  getPrototypeFiles,
} from "@/lib/utils/prototypeAuth";
import {
  cleanupPrototypeS3Objects,
  copyDefaultAppToPrototype,
  copyS3BucketContents,
  getPrototypeViewingUrl,
} from "@/lib/utils/s3";
import { getDefaultPrototypeFiles } from "@/templates/defaultApp";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

export type PrototypeInsert =
  Database["public"]["Tables"]["prototypes"]["Insert"];

export type CreatePrototypeResult =
  | {
      success: true;
      data: {
        prototype_id: string;
        viewing_url: string;
      };
    }
  | {
      success: false;
      error:
        | "UNAUTHORIZED"
        | "PROTOTYPE_LIMIT_REACHED"
        | "DATABASE_ERROR"
        | "S3_ERROR"
        | "INVALID_REQUEST";
      message: string;
    };

export async function POST(request: NextRequest) {
  try {
    // ------------------------------------------------------------------------------------------------
    // 1. JWT Token validation and user authentication
    // ------------------------------------------------------------------------------------------------
    const token = request.headers.get("authorization")?.split(" ")[1];
    if (!token || !request.headers.get("authorization")?.startsWith("Bearer")) {
      console.error("No JWT token provided");
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHORIZED",
          message: "No authentication token provided",
        },
        { status: 401 },
      );
    }

    // Authenticate user and get subscription info
    const authResult = await authenticatePrototypeUser(supabase, token);
    if (!authResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHORIZED",
          message: authResult.message || "Authentication failed",
        },
        { status: 401 },
      );
    }

    const { userId, subscriptionPlan } = authResult;

    // ------------------------------------------------------------------------------------------------
    // 2. Check prototype limits for free users (5 max)
    // ------------------------------------------------------------------------------------------------
    const limitCheck = await checkPrototypeLimit(
      supabase,
      userId,
      subscriptionPlan,
    );
    if (!limitCheck.canCreate) {
      return NextResponse.json(
        {
          success: false,
          error: "PROTOTYPE_LIMIT_REACHED",
          message: limitCheck.message || "Prototype limit reached",
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------------------------------------
    // 3. Parse request body
    // ------------------------------------------------------------------------------------------------
    const body = await request.json();
    const {
      name,
      description,
      project_id,
      prototype_id: forkPrototypeId, // If provided, this is a fork
      visibility,
    } = body;

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          message: "Prototype name is required",
        },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------------------------------------
    // 4. Create prototype in database
    // ------------------------------------------------------------------------------------------------
    const prototypeData: PrototypeInsert = {
      name,
      description,
      owner_id: userId,
      project_id,
      visibility:
        visibility || (subscriptionPlan === "pro" ? "SELF" : "PUBLIC"),
    };

    const { data: newPrototype, error: prototypeError } = await supabase
      .from("prototypes")
      .insert(prototypeData)
      .select()
      .single();

    if (prototypeError) {
      console.error("Error creating prototype:", prototypeError);
      return NextResponse.json(
        {
          success: false,
          error: "DATABASE_ERROR",
          message: "Failed to create prototype in database",
        },
        { status: 500 },
      );
    }

    const newPrototypeId = newPrototype.id;

    try {
      // ------------------------------------------------------------------------------------------------
      // 5. Handle prototype files and S3 operations
      // ------------------------------------------------------------------------------------------------
      if (forkPrototypeId) {
        // FORK: Copy existing prototype files and S3 bucket
        console.log(
          `Forking prototype ${forkPrototypeId} to ${newPrototypeId}`,
        );

        // Get files from source prototype
        const filesResult = await getPrototypeFiles(supabase, forkPrototypeId);
        if (!filesResult.success) {
          throw new Error(
            filesResult.message || "Failed to get prototype files",
          );
        }

        // Copy files to new prototype (with new prototype_id)
        const filesToInsert: Database["public"]["Tables"]["prototype_files"]["Insert"][] =
          filesResult.files!.map((file) => ({
            prototype_id: newPrototypeId,
            name: file.name,
            contents: file.contents,
          }));

        const { error: filesError } = await supabase
          .from("prototype_files")
          .insert(filesToInsert);

        if (filesError) {
          throw new Error(
            `Failed to copy prototype files: ${filesError.message}`,
          );
        }

        // Copy S3 bucket contents
        const sourcePrefix = `prototypes/${forkPrototypeId}`;
        const destinationPrefix = `prototypes/${newPrototypeId}`;

        const s3CopyResult = await copyS3BucketContents(
          sourcePrefix,
          destinationPrefix,
        );
        if (!s3CopyResult.success) {
          throw new Error(`Failed to copy S3 bucket: ${s3CopyResult.error}`);
        }

        console.log(
          `Successfully forked prototype: ${s3CopyResult.copiedObjects} files copied`,
        );
      } else {
        // NEW CREATION: Use default app files and copy to S3
        console.log(
          `Creating new prototype ${newPrototypeId} with default files`,
        );

        // Insert default prototype files
        const defaultFiles = getDefaultPrototypeFiles(newPrototypeId);
        const { error: filesError } = await supabase
          .from("prototype_files")
          .insert(defaultFiles);

        if (filesError) {
          throw new Error(
            `Failed to insert default files: ${filesError.message}`,
          );
        }

        // Copy default app files to S3 for new prototype
        const s3CopyResult = await copyDefaultAppToPrototype(newPrototypeId);
        if (!s3CopyResult.success) {
          throw new Error(
            `Failed to copy default app to S3: ${s3CopyResult.error}`,
          );
        }

        console.log(
          `Successfully created new prototype: ${s3CopyResult.copiedObjects} files copied`,
        );
      }

      // ------------------------------------------------------------------------------------------------
      // 6. Get viewing URL and return success
      // ------------------------------------------------------------------------------------------------
      const viewingUrl = getPrototypeViewingUrl(newPrototypeId);

      return NextResponse.json({
        success: true,
        data: {
          prototype_id: newPrototypeId,
          viewing_url: viewingUrl,
        },
      });
    } catch (error) {
      // If anything fails after prototype creation, clean up
      console.error("Error during prototype setup:", error);

      // Clean up S3 objects
      await cleanupPrototypeS3Objects(newPrototypeId);

      // Clean up database entry
      await supabase.from("prototypes").delete().eq("id", newPrototypeId);

      return NextResponse.json(
        {
          success: false,
          error: "S3_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to set up prototype files and S3 storage",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Unexpected error in create-prototype:", error);
    return NextResponse.json(
      {
        success: false,
        error: "DATABASE_ERROR",
        message: "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
