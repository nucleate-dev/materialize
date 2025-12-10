# Backfill CLI Guide

Complete guide for using the AsyncBackfillExecutor CLI.

## Overview

The backfill CLI provides a safe, powerful way to run database migrations and fixes with:
- **Dry run by default** - See what would change without making changes
- **Single-row testing** - Test your logic on one row before running on the full table
- **Detailed statistics** - Track processed rows, inconsistencies, and fixes
- **Type safety** - Full TypeScript support with auto-generated database types

## Command Syntax

```bash
npm run backfill <script-path> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--no-dry-run` | Run in LIVE mode (applies fixes) | DRY RUN mode |
| `--where-column <column>` | Column name to filter by | Process all rows |
| `--where-value <value>` | Value to match for filtering | Process all rows |

**Note:** `--where-column` and `--where-value` must be used together.

## Usage Examples

### 1. Dry Run on Full Table (Default)

```bash
npm run backfill backfills/fix-missing-slugs.ts
```

**What happens:**
- ✅ Reads all rows from the table
- ✅ Checks which rows are inconsistent
- ✅ Shows statistics
- ❌ Does NOT apply fixes
- ❌ Does NOT modify the database

**Output:**
```
🚀 Starting backfill on table: prototypes
   Mode: DRY RUN (no changes will be made)
   Target: All rows in table

📦 Processing batch #1 (250 rows) starting at offset 0
   👉 Found 45 inconsistent rows in batch #1
   ⏭️  Skipping fix for 45 rows (dry run mode)

======================================================================
📊 BACKFILL SUMMARY
======================================================================
Table:                    prototypes
Mode:                     DRY RUN
Total rows processed:     250
Inconsistent rows found:  45
Rows fixed:               0
Inconsistency rate:       18.00%

⚠️  This was a DRY RUN. No changes were made to the database.
   Run with --no-dry-run to apply fixes.
======================================================================
```

### 2. Live Run on Full Table

```bash
npm run backfill backfills/fix-missing-slugs.ts --no-dry-run
```

**What happens:**
- ✅ Reads all rows from the table
- ✅ Checks which rows are inconsistent
- ✅ Calls `genFixRow` for each inconsistent row
- ✅ Upserts fixed rows back to the database
- ✅ Shows statistics

**Use case:** After verifying with dry run, apply the fixes.

### 3. Test Single Row (Dry Run)

```bash
npm run backfill backfills/fix-missing-slugs.ts \
  --where-column id \
  --where-value "a070649e-91df-435c-b554-457cc8290f86"
```

**What happens:**
- ✅ Fetches only the specified row
- ✅ Shows the full row data (JSON)
- ✅ Checks if it's inconsistent
- ❌ Does NOT apply fixes

**Output:**
```
✅ Found row:
{
  "id": "a070649e-91df-435c-b554-457cc8290f86",
  "name": "My Project",
  "slug": null,
  ...
}

   ❌ Row is INCONSISTENT
   ⏭️  Skipping fix (dry run mode)
```

**Use case:** Test your backfill logic on a specific row before running on the full table.

### 4. Fix Single Row (Live)

```bash
npm run backfill backfills/fix-missing-slugs.ts \
  --where-column id \
  --where-value "a070649e-91df-435c-b554-457cc8290f86" \
  --no-dry-run
```

**What happens:**
- ✅ Fetches only the specified row
- ✅ Shows the original row data
- ✅ Checks if it's inconsistent
- ✅ Applies the fix
- ✅ Shows the fixed row data
- ✅ Upserts to database

**Output:**
```
   ❌ Row is INCONSISTENT
   🔧 Fixing row...
   💾 Upserted 1 rows back into "prototypes"

   Fixed row:
{
  "id": "a070649e-91df-435c-b554-457cc8290f86",
  "name": "My Project",
  "slug": "project-a070649e-91df-435c-b554-457cc8290f86",
  ...
}
```

**Use case:** Fix a single known problematic row, or verify your fix logic works correctly.

### 5. Filter by Different Columns

You can filter by any column in your table:

```bash
# By slug
npm run backfill backfills/my-backfill.ts \
  --where-column slug \
  --where-value "my-project"

# By name
npm run backfill backfills/my-backfill.ts \
  --where-column name \
  --where-value "Test Project"

# By numeric ID
npm run backfill backfills/my-backfill.ts \
  --where-column id \
  --where-value 12345
```

**Note:** The CLI automatically detects if the value is numeric and converts it appropriately.

## Recommended Workflow

### Step 1: Write Your Backfill

```typescript
// backfills/fix-missing-slugs.ts
import type { NucleateBackfill } from "../types/nucleate-backfill"

export const backfill: NucleateBackfill<"prototypes"> = {
  table: "prototypes",

  async genIsInconsistent(row) {
    // Check if the row needs fixing
    return !row.slug
  },

  async genFixRow(row) {
    // Return the fixed row
    return {
      ...row,
      slug: `project-${row.id}`,
    }
  },
}

export default backfill
```

### Step 2: Test on a Single Row (Dry Run)

```bash
npm run backfill backfills/fix-missing-slugs.ts \
  --where-column id \
  --where-value "abc-123"
```

Review the output to ensure:
- ✅ The row is correctly identified as inconsistent (or not)
- ✅ The logic makes sense

### Step 3: Fix the Single Row (Live)

```bash
npm run backfill backfills/fix-missing-slugs.ts \
  --where-column id \
  --where-value "abc-123" \
  --no-dry-run
```

Review the output to ensure:
- ✅ The fixed row looks correct
- ✅ The fix was applied successfully

### Step 4: Dry Run on Full Table

```bash
npm run backfill backfills/fix-missing-slugs.ts
```

Review the statistics:
- ✅ Total rows processed
- ✅ Number of inconsistent rows
- ✅ Inconsistency rate

### Step 5: Apply Fixes to Full Table

```bash
npm run backfill backfills/fix-missing-slugs.ts --no-dry-run
```

Monitor the progress:
- ✅ Watch batches being processed
- ✅ Confirm rows are being fixed
- ✅ Review final statistics

## Safety Features

### Dry Run by Default
The CLI runs in DRY RUN mode by default, meaning:
- ❌ No changes are made to the database
- ✅ You can safely run it anytime to see what would happen
- ✅ You must explicitly opt-in to make changes with `--no-dry-run`

### Clear Mode Indicators
The CLI always shows you which mode you're in:
```
Mode: DRY RUN (no changes will be made)
Mode: LIVE (will fix rows)
```

### Detailed Statistics
After every run, you get a summary:
```
Total rows processed:     250
Inconsistent rows found:  45
Rows fixed:               0 (or actual count in live mode)
Inconsistency rate:       18.00%
```

## Troubleshooting

### "No row found where..."
```
❌ No row found where id = abc-123
```

**Cause:** The row doesn't exist in the table, or the column/value don't match.

**Solution:**
- Verify the column name is correct
- Verify the value exists in the database
- Check for typos

### "Missing required environment variables"
```
Error: Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

**Solution:** Ensure your `.env` file exists and contains:
```
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### "Failed to load backfill script"
```
Error: Failed to load backfill script: Backfill object missing required 'table' property
```

**Cause:** Your backfill script doesn't export a valid `NucleateBackfill` object.

**Solution:** Ensure your script exports the backfill:
```typescript
export const backfill: NucleateBackfill<"your_table"> = { ... }
export default backfill
```

## Advanced Usage

### Programmatic Usage

You can also use the `AsyncBackfillExecutor` directly in code:

```typescript
import { runAsyncBackfill } from "./AsyncBackfillExecutor"
import type { NucleateBackfill } from "../types/nucleate-backfill"

const backfill: NucleateBackfill<"prototypes"> = {
  table: "prototypes",
  async genIsInconsistent(row) { return !row.slug },
  async genFixRow(row) { return { ...row, slug: `project-${row.id}` } },
}

// Run with options
const stats = await runAsyncBackfill(backfill, {
  dryRun: false,
  whereColumn: "id",
  whereValue: "abc-123",
})

console.log(`Fixed ${stats.rowsFixed} rows`)
```

### Custom Batch Sizes

The executor uses these defaults (configured in `AsyncBackfillExecutor.ts`):
- `ROW_FETCH_BATCH_SIZE = 250` - Rows fetched per query
- `CONSISTENCY_CONCURRENCY = 10` - Concurrent consistency checks
- `FIX_CONCURRENCY = 10` - Concurrent fix operations
- `UPSERT_BATCH_SIZE = 100` - Rows upserted per query

To customize, modify these constants in the executor.

## Best Practices

1. **Always dry run first** - Never skip the dry run step
2. **Test on single rows** - Verify your logic before running on the full table
3. **Monitor the output** - Watch for unexpected patterns or errors
4. **Start small** - If unsure, fix a few rows manually first
5. **Document your backfills** - Add comments explaining what and why
6. **Keep backfills simple** - One clear purpose per backfill script
7. **Version control** - Commit your backfill scripts to git
