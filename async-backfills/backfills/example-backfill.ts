/**
 * Example TypeScript backfill script
 *
 * This demonstrates how to use the AsyncBackfillExecutor to create
 * a backfill that processes database rows in batches.
 *
 * Run with: npm run exec backfills/example-backfill.ts
 */

import type { NucleateBackfill } from "../types/nucleate-backfill"
import { runAsyncBackfill } from "./AsyncBackfillExecutor"

// Example: Fix prototypes that have inconsistent data
const exampleBackfill: NucleateBackfill<"prototypes"> = {
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

// Run the backfill
async function main() {
  console.log("🚀 Starting example backfill...")
  console.log("⚠️  This is an EXAMPLE script - modify it for your use case")
  console.log("")

  // Uncomment the line below to actually run the backfill
  // await runAsyncBackfill(exampleBackfill)

  console.log("")
  console.log("✅ Example backfill setup complete!")
  console.log("📝 Edit this file to implement your actual backfill logic")
}

main().catch((error) => {
  console.error("❌ Backfill failed:", error)
  process.exit(1)
})
