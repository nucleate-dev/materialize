#!/usr/bin/env ts-node
/**
 * CLI runner for executing backfill scripts
 *
 * Usage:
 *   npm run backfill -- backfills/my-backfill.ts [options]
 *
 * Options:
 *   --no-dry-run              Run in LIVE mode (applies fixes to database)
 *   --where-column <column>   Column name to filter by (processes ALL matching rows)
 *   --where-value <value>     Value to match (processes ALL matching rows)
 *
 * Examples:
 *   # Dry run on full table (default)
 *   npm run backfill -- backfills/my-backfill.ts
 *
 *   # Live run on full table
 *   npm run backfill -- backfills/my-backfill.ts --no-dry-run
 *
 *   # Dry run on all rows matching a condition
 *   npm run backfill -- backfills/my-backfill.ts --where-column prototype_id --where-value "abc-123"
 *
 *   # Live run on all rows matching a condition
 *   npm run backfill -- backfills/my-backfill.ts --no-dry-run --where-column prototype_id --where-value "abc-123"
 */

import * as path from "path"
import { runAsyncBackfill, BackfillOptions } from "./AsyncBackfillExecutor"
import type { NucleateBackfill, TableName } from "./nucleate-backfill"

interface CliArgs {
  scriptPath: string
  dryRun: boolean
  whereColumn?: string
  whereValue?: string | number
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error("Error: Missing backfill script path")
    console.error("")
    console.error("Usage: npm run backfill -- <script-path> [options]")
    console.error("")
    console.error("Options:")
    console.error("  --no-dry-run              Run in LIVE mode (applies fixes)")
    console.error("  --where-column <column>   Column name to filter by (processes ALL matching rows)")
    console.error("  --where-value <value>     Value to match (processes ALL matching rows)")
    console.error("")
    console.error("Examples:")
    console.error("  npm run backfill -- backfills/my-backfill.ts")
    console.error("  npm run backfill -- backfills/my-backfill.ts --no-dry-run")
    console.error("  npm run backfill -- backfills/my-backfill.ts --where-column prototype_id --where-value abc-123")
    process.exit(1)
  }

  const scriptPath = args[0]
  let dryRun = true
  let whereColumn: string | undefined
  let whereValue: string | number | undefined

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--no-dry-run") {
      dryRun = false
    } else if (arg === "--where-column") {
      whereColumn = args[++i]
      if (!whereColumn) {
        console.error("Error: --where-column requires a value")
        process.exit(1)
      }
    } else if (arg === "--where-value") {
      const value = args[++i]
      if (!value) {
        console.error("Error: --where-value requires a value")
        process.exit(1)
      }
      // Try to parse as number, otherwise keep as string
      whereValue = isNaN(Number(value)) ? value : Number(value)
    } else {
      console.error(`Error: Unknown option: ${arg}`)
      process.exit(1)
    }
  }

  // Validate that both whereColumn and whereValue are provided together
  if ((whereColumn && !whereValue) || (!whereColumn && whereValue !== undefined)) {
    console.error("Error: --where-column and --where-value must be used together")
    process.exit(1)
  }

  return { scriptPath, dryRun, whereColumn, whereValue }
}

async function loadBackfillScript(
  scriptPath: string,
): Promise<NucleateBackfill<TableName>> {
  // Resolve the script path relative to the current working directory
  const resolvedPath = path.resolve(process.cwd(), scriptPath)

  try {
    // Dynamically import the backfill script
    const module = await import(resolvedPath)

    // Look for the backfill export (try default export first, then named exports)
    const backfill =
      module.default ||
      module.backfill ||
      Object.values(module).find(
        (exp: any) =>
          exp && typeof exp === "object" && "table" in exp && "genIsInconsistent" in exp,
      )

    if (!backfill) {
      throw new Error(
        `Backfill script does not export a valid NucleateBackfill object.\n` +
          `Expected exports: default, backfill, or any object with { table, genIsInconsistent, genFixRow }`,
      )
    }

    // Validate the backfill object
    if (!backfill.table || typeof backfill.table !== "string") {
      throw new Error("Backfill object missing required 'table' property")
    }
    if (typeof backfill.genIsInconsistent !== "function") {
      throw new Error("Backfill object missing required 'genIsInconsistent' function")
    }
    if (typeof backfill.genFixRow !== "function") {
      throw new Error("Backfill object missing required 'genFixRow' function")
    }

    return backfill
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load backfill script: ${error.message}`)
    }
    throw error
  }
}

async function main() {
  const args = parseArgs()

  console.log("╔═══════════════════════════════════════════════════════════════╗")
  console.log("║                 ASYNC BACKFILL EXECUTOR                       ║")
  console.log("╚═══════════════════════════════════════════════════════════════╝")
  console.log("")
  console.log(`Script:     ${args.scriptPath}`)
  console.log(`Mode:       ${args.dryRun ? "DRY RUN" : "LIVE"}`)
  if (args.whereColumn && args.whereValue !== undefined) {
    console.log(`Filter:     ${args.whereColumn} = ${args.whereValue}`)
  }

  // Load the backfill script
  console.log("\n📂 Loading backfill script...")
  const backfill = await loadBackfillScript(args.scriptPath)
  console.log(`✅ Loaded backfill for table: ${backfill.table}`)

  // Prepare options
  const options: BackfillOptions = {
    dryRun: args.dryRun,
    whereColumn: args.whereColumn,
    whereValue: args.whereValue,
  }

  // Run the backfill
  const stats = await runAsyncBackfill(backfill, options)

  // Exit with appropriate code
  process.exit(0)
}

// Run the CLI
main().catch((error) => {
  console.error("\n❌ Backfill failed:")
  console.error(error.message || error)
  console.error("")
  if (error.stack) {
    console.error("Stack trace:")
    console.error(error.stack)
  }
  process.exit(1)
})
