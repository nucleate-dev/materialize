/**
 * Backfill to nest mobile app files into mobile/ directory
 *
 * This script moves all files into a mobile/ subdirectory except for
 * specific root-level files (.gitignore, .env.example, README.md).
 *
 * Run with:
 *   npm run backfill backfills/nest-mobile-files.ts                    # Dry run
 *   npm run backfill backfills/nest-mobile-files.ts --no-dry-run       # Apply changes
 */

import type { NucleateBackfill } from "../nucleate-backfill";

// Files/directories that should stay in root (not be moved to mobile/)
const ROOT_FILES = new Set([".gitignore"]);

/**
 * Check if a file path is already in the mobile/ directory
 */
function isInMobileDir(path: string): boolean {
  return path.startsWith("mobile");
}

/**
 * Check if a file should stay in root
 */
function shouldStayInRoot(path: string): boolean {
  return ROOT_FILES.has(path);
}

export const backfill: NucleateBackfill<"prototype_files"> = {
  table: "prototype_files",

  async genIsInconsistent(row) {
    // Check if the file needs to be moved to mobile/
    // Already in mobile/? Don't move
    if (isInMobileDir(row.name)) {
      return false;
    }

    // Root file that should stay in root? Don't move
    if (shouldStayInRoot(row.name)) {
      return false;
    }

    // Everything else should be moved to mobile/
    return true;
  },

  async genFixRow(row) {
    // Move the file to mobile/
    const newPath = `mobile/${row.name}`;

    return {
      ...row,
      name: newPath,
    };
  },
};

export default backfill;
