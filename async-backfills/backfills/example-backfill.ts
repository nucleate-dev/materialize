/**
 * Example TypeScript backfill script
 *
 * This demonstrates how to use the AsyncBackfillExecutor to create
 * a backfill that processes database rows in batches.
 *
 * Run with:
 *   npm run backfill backfills/example-backfill.ts                    # Dry run on all rows
 *   npm run backfill backfills/example-backfill.ts --no-dry-run       # Live run on all rows
 *   npm run backfill backfills/example-backfill.ts --where-column id --where-value 123  # Single row
 */

import type { NucleateBackfill } from "../nucleate-backfill"

// Example: Fix prototypes that have inconsistent data
export const backfill: NucleateBackfill<"prototypes"> = {
  table: "prototypes",

  // Check if a row needs fixing
  async genIsInconsistent(row) {
    // Example: Check if the slug is missing or invalid
    // Replace this with your actual consistency check logic
    if (!row.slug) {
      return true
    }

    // You can add more complex checks here
    return false
  },

  // Fix the row
  async genFixRow(row) {
    // Example: Generate a slug from the ID if missing
    // Replace this with your actual fix logic
    if (!row.slug) {
      return {
        ...row,
        slug: `project-${row.id}`,
      }
    }

    return row
  },
}

// Export as default as well for convenience
export default backfill
