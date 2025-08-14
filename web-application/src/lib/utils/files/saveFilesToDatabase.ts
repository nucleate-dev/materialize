import { Database } from "@/lib/types/database.types";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type PrototypeFileInsert =
  Database["public"]["Tables"]["prototype_files"]["Insert"];

/**
 * Saves files to the database using an incremental approach.
 * Updates existing files or creates new ones as needed.
 *
 * @param supabaseClient - Authenticated Supabase client
 * @param prototypeId - The prototype ID to save files for
 * @param updatedFiles - Record of files to save (key: file path, value: file data)
 * @returns Promise that resolves when all files are saved
 */
export async function saveFilesToDatabase(
  supabaseClient: SupabaseClient<Database>,
  prototypeId: string,
  updatedFiles: Record<string, PrototypeFileInsert>,
): Promise<void> {
  if (!prototypeId) {
    throw new Error("Prototype ID is required");
  }

  const saveResults: Array<{
    filePath: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const [filePath, fileData] of Object.entries(updatedFiles)) {
    try {
      // Check if file exists
      const { data: existingFile, error: selectError } = await supabaseClient
        .from("prototype_files")
        .select("id")
        .eq("prototype_id", prototypeId)
        .eq("name", filePath)
        .maybeSingle();

      if (selectError) {
        console.error(`Error checking existing file ${filePath}:`, selectError);
        saveResults.push({
          filePath,
          success: false,
          error: `Failed to check existing file: ${selectError.message}`,
        });
        continue;
      }

      if (existingFile) {
        // Update existing file
        const { error: updateError } = await supabaseClient
          .from("prototype_files")
          .update({
            contents: fileData.contents,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingFile.id);

        if (updateError) {
          console.error(`Error updating file ${filePath}:`, updateError);
          saveResults.push({
            filePath,
            success: false,
            error: `Failed to update file: ${updateError.message}`,
          });
        } else {
          console.log(`✅ Updated existing file: ${filePath}`);
          saveResults.push({ filePath, success: true });
        }
      } else {
        // Create new file
        const { error: insertError } = await supabaseClient
          .from("prototype_files")
          .insert({
            prototype_id: prototypeId,
            name: filePath,
            contents: fileData.contents,
            file_type: "text",
            storage_path: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error(`Error creating file ${filePath}:`, insertError);
          saveResults.push({
            filePath,
            success: false,
            error: `Failed to create file: ${insertError.message}`,
          });
        } else {
          console.log(`✅ Created new file: ${filePath}`);
          saveResults.push({ filePath, success: true });
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Error saving file ${filePath}:`, error);
      saveResults.push({
        filePath,
        success: false,
        error: `Unexpected error: ${errorMessage}`,
      });
    }
  }

  // Check if any saves failed
  const failedSaves = saveResults.filter((result) => !result.success);

  if (failedSaves.length > 0) {
    const errorMessage = `Failed to save ${failedSaves.length} file(s): ${failedSaves
      .map((result) => `${result.filePath} (${result.error})`)
      .join(", ")}`;

    throw new Error(errorMessage);
  }

  console.log(`✅ Successfully saved ${saveResults.length} files to database`);
}

/**
 * Convenience function that creates an authenticated Supabase client and saves files
 *
 * @param jwt - JWT token for authentication
 * @param prototypeId - The prototype ID to save files for
 * @param updatedFiles - Record of files to save (key: file path, value: file data)
 * @returns Promise that resolves when all files are saved
 */
export async function saveFilesToDatabaseWithAuth(
  jwt: string,
  prototypeId: string,
  updatedFiles: Record<string, PrototypeFileInsert>,
): Promise<void> {
  const authenticatedSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
    },
  );

  return saveFilesToDatabase(authenticatedSupabase, prototypeId, updatedFiles);
}
