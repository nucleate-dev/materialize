import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrototypeFileInput } from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';

type PrototypeFileInsert =
  Database['public']['Tables']['prototype_files']['Insert'];

/**
 * Convert filtered text files to database format with proper typing
 */
export function convertTextFilesToDatabaseFormat(
  textFiles: PrototypeFileInput[],
): Record<string, PrototypeFileInsert> {
  return Object.fromEntries(
    textFiles.map((file) => [
      file.name,
      {
        ...file,
        file_type: 'text' as const,
        storage_path: null, // Text files don't have storage paths
      },
    ]),
  );
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Saves files to the database using batch upsert.
 * Updates existing files or creates new ones as needed in a single operation.
 */
export async function saveFilesToDatabase(
  supabaseClient: SupabaseClient<Database>,
  prototypeId: string,
  updatedFiles: PrototypeFileInsert[],
): Promise<void> {
  if (!prototypeId) {
    throw new Error('Prototype ID is required');
  }

  const fileEntries = Object.entries(updatedFiles);
  if (fileEntries.length === 0) {
    console.log('No files to save');
    return;
  }

  console.log(
    `💾 Saving ${fileEntries.length} files to database for prototype ${prototypeId}`,
  );

  const { error } = await supabaseClient
    .from('prototype_files')
    .upsert(updatedFiles, {
      onConflict: 'prototype_id,name',
      ignoreDuplicates: false, // Update existing files
    });

  if (error) {
    console.error('❌ Error saving files to database:', error);
    throw new Error(`Failed to save files: ${error.message}`);
  }

  console.log(`✅ Successfully saved ${updatedFiles.length} files to database`);
}

/**
 * Version that uses JWT token to create authenticated Supabase client
 */
export async function saveFilesToDatabaseWithAuth(
  jwtToken: string,
  prototypeId: string,
  updatedFiles: PrototypeFileInsert[],
): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      },
    },
  );

  return saveFilesToDatabase(supabaseClient, prototypeId, updatedFiles);
}
