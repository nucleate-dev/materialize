/**
 * Backfill to nest mobile app assets into client/ directory
 *
 * This script moves all assets into a client/ subdirectory both in the database
 * and in Supabase Storage (prototype-assets bucket).
 *
 * Run with:
 *   npm run backfill -- backfills/nest-mobile-assets.ts                    # Dry run
 *   npm run backfill -- backfills/nest-mobile-assets.ts --no-dry-run       # Apply changes
 */

import { createClient } from "@supabase/supabase-js";
import type { NucleateDBFixer } from "../nucleate-db-fixer";
import type { Database } from "../types/supabase";

// Initialize Supabase client for storage operations
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STORAGE_BUCKET = "prototype-assets";

// Files/directories that should stay in root (not be moved to client/)
const ROOT_FILES = new Set([".gitignore"]);

/**
 * Check if a file path is already in the client/ directory
 */
function isInClientDir(path: string): boolean {
  return path.startsWith("client/");
}

/**
 * Check if a file should stay in root
 */
function shouldStayInRoot(path: string): boolean {
  return ROOT_FILES.has(path);
}

/**
 * Move a file in Supabase Storage
 */
async function moveFileInStorage(
  prototypeId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const oldPath = `${prototypeId}/${oldName}`;
  const newPath = `${prototypeId}/${newName}`;

  // First, copy the file to the new location
  const { data: copyData, error: copyError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .copy(oldPath, newPath);

  if (copyError) {
    throw new Error(
      `Failed to copy asset from ${oldPath} to ${newPath}: ${copyError.message}`,
    );
  }

  // Then, delete the old file
  const { error: deleteError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([oldPath]);

  if (deleteError) {
    // If delete fails, try to clean up the copied file
    await supabase.storage.from(STORAGE_BUCKET).remove([newPath]);
    throw new Error(
      `Failed to delete old asset at ${oldPath}: ${deleteError.message}`,
    );
  }

  console.log(`   📦 Moved storage file: ${oldPath} → ${newPath}`);
}

export const backfill: NucleateDBFixer<"prototype_assets"> = {
  table: "prototype_assets",

  async genIsInconsistent(row) {
    // Check if the asset needs to be moved to client/
    // Already in client/? Don't move
    if (isInClientDir(row.name)) {
      return false;
    }

    // Root file that should stay in root? Don't move
    if (shouldStayInRoot(row.name)) {
      return false;
    }

    // Everything else should be moved to client/
    return true;
  },

  async genFixRow(row) {
    if (!row.prototype_id) {
      throw new Error(
        `Asset ${row.id} has no prototype_id - cannot move in storage`,
      );
    }

    // Move the file to client/
    const newPath = `client/${row.name}`;

    // Move the file in Supabase Storage
    await moveFileInStorage(row.prototype_id, row.name, newPath);

    // Return updated row with new name
    return {
      ...row,
      name: newPath,
    };
  },
};

export default backfill;
