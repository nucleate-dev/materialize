import { Database } from "@/lib/types/database.types";
import {
  authenticatePrototypeUser,
  checkPrototypeLimit,
  getPrototypeFiles,
} from "@/lib/utils/prototypeAuth";
import {
  cleanupPrototypeS3Objects,
  copyAssetInSupabaseStorage,
  copyDefaultAppToPrototype,
  copyS3BucketContents,
  deletePrototypeAssetsFromStorage,
  getDefaultAppFilesFromS3,
  getPrototypeViewingUrl,
} from "@/lib/utils/s3";
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
        // For assets, we need to copy them in Supabase Storage and update storage_path
        const filesToInsert: Database["public"]["Tables"]["prototype_files"]["Insert"][] =
          [];

        console.log(`📁 Processing ${filesResult.files!.length} files for new prototype`);
        const sourceAssets = filesResult.files!.filter(f => f.file_type === "asset");
        const sourceTexts = filesResult.files!.filter(f => f.file_type === "text");
        console.log(`📊 Source files: ${sourceTexts.length} text, ${sourceAssets.length} assets`);
        console.log(`🔍 Source assets:`, sourceAssets.map(a => ({ name: a.name, storage_path: a.storage_path })));

        for (const file of filesResult.files!) {
          if (file.file_type === "asset") {
            console.log(`🔄 Copying asset: ${file.name} from ${file.storage_path}`);
            
            // Copy asset in Supabase Storage
            const copyResult = await copyAssetInSupabaseStorage(
              forkPrototypeId,
              newPrototypeId,
              file.name,
            );

            if (!copyResult.success) {
              console.error(`❌ Failed to copy asset ${file.name}:`, copyResult.error);
              throw new Error(
                `Failed to copy asset ${file.name}: ${copyResult.error}`,
              );
            }

            console.log(`✅ Asset copied: ${file.name} → ${copyResult.publicUrl}`);

            filesToInsert.push({
              prototype_id: newPrototypeId,
              name: file.name,
              contents: "", // Empty string for asset files since contents is required
              file_type: "asset",
              storage_path: copyResult.publicUrl!,
            });
          } else {
            // Text file - just copy contents
            console.log(`📝 Copying text file: ${file.name} (${file.contents?.length || 0} chars)`);
            filesToInsert.push({
              prototype_id: newPrototypeId,
              name: file.name,
              contents: file.contents,
              file_type: file.file_type,
              storage_path: file.storage_path,
            });
          }
        }
        
        console.log(`💾 Files to insert: ${filesToInsert.length} total`);
        const assetsToInsert = filesToInsert.filter(f => f.file_type === "asset");
        const textsToInsert = filesToInsert.filter(f => f.file_type === "text");
        console.log(`📋 Insert breakdown: ${textsToInsert.length} text, ${assetsToInsert.length} assets`);

        const { error: filesError } = await supabase
          .from("prototype_files")
          .insert(filesToInsert);

        if (filesError) {
          console.error("❌ Error inserting files:", filesError);
          throw new Error(
            `Failed to copy prototype files: ${filesError.message}`,
          );
        }

        console.log(`✅ Successfully inserted ${filesToInsert.length} files to database`);
        
        // Verify what got saved
        const { data: savedFiles, error: verifyError } = await supabase
          .from("prototype_files")
          .select("name, file_type, storage_path")
          .eq("prototype_id", newPrototypeId);
          
        if (!verifyError && savedFiles) {
          const savedAssets = savedFiles.filter(f => f.file_type === "asset");
          const savedTexts = savedFiles.filter(f => f.file_type === "text");
          console.log(`🔍 Verification: ${savedTexts.length} text, ${savedAssets.length} assets saved`);
          console.log(`📄 Saved assets:`, savedAssets.map(a => ({ name: a.name, has_storage_path: !!a.storage_path })));
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
        // NEW CREATION: Use default app files from S3 and copy to both Supabase and S3
        console.log(
          `Creating new prototype ${newPrototypeId} with default files from S3`,
        );

        // Get default app files from S3 raw files
        const defaultFilesResult =
          await getDefaultAppFilesFromS3(newPrototypeId);
        if (!defaultFilesResult.success) {
          throw new Error(
            `Failed to get default files from S3: ${defaultFilesResult.error}`,
          );
        }

        // Insert default prototype files into Supabase
        const { error: filesError } = await supabase
          .from("prototype_files")
          .insert(defaultFilesResult.files!);

        if (filesError) {
          throw new Error(
            `Failed to insert default files: ${filesError.message}`,
          );
        }

        // Copy default app files to S3 for new prototype (for hosting)
        const s3CopyResult = await copyDefaultAppToPrototype(newPrototypeId);
        if (!s3CopyResult.success) {
          throw new Error(
            `Failed to copy default app to S3: ${s3CopyResult.error}`,
          );
        }

        console.log(
          `Successfully created new prototype: ${defaultFilesResult.files!.length} files in DB, ${s3CopyResult.copiedObjects} files copied to S3`,
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

      // Clean up Supabase Storage assets
      await deletePrototypeAssetsFromStorage(newPrototypeId);

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
