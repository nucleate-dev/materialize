import { Database } from "@/lib/types/database.types";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type PrototypeFileInsert =
  Database["public"]["Tables"]["prototype_files"]["Insert"];

/**
 * Saves files to the database using batch upsert.
 * Updates existing files or creates new ones as needed in a single operation.
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

  const fileEntries = Object.entries(updatedFiles);
  if (fileEntries.length === 0) {
    console.log("No files to save");
    return;
  }

  console.log(`Saving ${fileEntries.length} files to database using batch upsert...`);

  try {
    // Prepare data for upsert - convert to array format
    const filesToUpsert = fileEntries.map(([filePath, fileData]) => ({
      prototype_id: prototypeId,
      name: filePath,
      contents: fileData.contents,
      file_type: fileData.file_type || "text",
      storage_path: fileData.storage_path || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // Perform batch upsert using Supabase's upsert functionality
    // This will insert new records or update existing ones based on unique constraints
    const { data, error } = await supabaseClient
      .from("prototype_files")
      .upsert(filesToUpsert, {
        onConflict: "prototype_id,name", // Unique constraint on prototype_id + name
        ignoreDuplicates: false, // Update existing records instead of ignoring
      })
      .select("name");

    if (error) {
      console.error("Error during batch upsert:", error);
      throw new Error(`Failed to save files: ${error.message}`);
    }

    console.log(`✅ Successfully saved ${data?.length || fileEntries.length} files to database`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error saving files to database:", error);
    throw new Error(`Failed to save files: ${errorMessage}`);
  }
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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
