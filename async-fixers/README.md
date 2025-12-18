# Async Backfills

Database backfill scripts for Nucleate with TypeScript support and zero-compilation execution.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
```

## Quick Start

### Running a Backfill

```bash
# Dry run (safe - no changes made)
npm run fixer -- db-fixers/your-fixer.ts

# Live run (applies fixes)
npm run fixer -- db-fixers/your-fixer.ts --no-dry-run

# Test on single row
npm run fixer -- db-fixers/your-fixer.ts --where-column id --where-value "abc-123"
```

### Creating a New Backfill

1. **Create the file:**

```typescript
// backfills/fix-missing-slugs.ts
import type { NucleateBackfill } from "../nucleate-backfill";

export const backfill: NucleateBackfill<"prototypes"> = {
  table: "prototypes",

  async genIsInconsistent(row) {
    // Return true if row needs fixing
    return !row.slug;
  },

  async genFixRow(row) {
    // Return the fixed row
    return {
      ...row,
      slug: `project-${row.id}`,
    };
  },
};

export default backfill;
```

2. **Test it:**

```bash
# Test on single row first
npm run fixer -- db-fixers/fix-missing-slugs.ts --where-column id --where-value "abc-123"

# Dry run on full table
npm run fixer -- db-fixers/fix-missing-slugs.ts

# Apply fixes
npm run fixer -- db-fixers/fix-missing-slugs.ts --no-dry-run
```

## CLI Options

| Option                    | Description             | Default          |
| ------------------------- | ----------------------- | ---------------- |
| `--no-dry-run`            | Apply fixes to database | DRY RUN mode     |
| `--where-column <column>` | Filter by column        | Process all rows |
| `--where-value <value>`   | Value to match          | Process all rows |

## NucleateBackfill Interface

```typescript
interface NucleateBackfill<TName extends TableName> {
  // The table to process
  table: TName;

  // Check if a row needs fixing
  genIsInconsistent: (row: TableRow<TName>) => Promise<boolean> | boolean;

  // Return the fixed row
  genFixRow: (
    row: TableRow<TName>,
  ) => Promise<TableRow<TName>> | TableRow<TName>;
}
```

**Available tables:** See `types/supabase.ts` for all table names with full TypeScript autocomplete.

## How It Works

The backfill executor automatically:

- Streams rows in batches of 250
- Checks inconsistencies with 10 concurrent workers
- Fixes rows with 10 concurrent workers
- Upserts in batches of 100
- Provides detailed statistics

## Examples

- `backfills/example-backfill.ts` - Full backfill example
- `backfills/example-simple-script.ts` - Custom script example

## Other Commands

```bash
npm run exec backfills/your-script.ts  # Run any TypeScript file
npm run check                          # Type-check all files
npm run gen:supabase:types             # Regenerate database types
```

## Safety Features

✅ **Dry run by default** - Must explicitly use `--no-dry-run` to make changes
✅ **Single-row testing** - Test logic on one row before running on full table
✅ **Clear mode indicators** - Always shows DRY RUN vs LIVE
✅ **Detailed statistics** - See exactly what will be changed

## Workflow

1. Write your backfill implementing `NucleateBackfill<"table_name">`
2. Test on single row: `npm run backfill backfills/my-script.ts --where-column id --where-value "123"`
3. Dry run on full table: `npm run backfill backfills/my-script.ts`
4. Apply fixes: `npm run backfill backfills/my-script.ts --no-dry-run`
