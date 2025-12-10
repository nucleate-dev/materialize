# Quick Start Guide

## Running Backfills

The async-backfills directory is fully configured for writing and running TypeScript backfills with zero compilation steps.

### Basic Usage (CLI - Recommended)

```bash
# Dry run (safe - no changes made)
npm run backfill backfills/your-backfill.ts

# Live run (applies fixes)
npm run backfill backfills/your-backfill.ts --no-dry-run

# Test single row
npm run backfill backfills/your-backfill.ts --where-column id --where-value "abc-123"

# Type-check all scripts
npm run check
```

### Creating a New Script

**Option 1: Table Backfill (Use CLI - Recommended)**

```bash
# Create a new file
touch backfills/my-backfill.ts
```

```typescript
import type { NucleateBackfill } from "../types/nucleate-backfill"

export const backfill: NucleateBackfill<"prototypes"> = {
  table: "prototypes",

  async genIsInconsistent(row) {
    // Return true if row needs fixing
    return !row.slug
  },

  async genFixRow(row) {
    // Return the fixed row
    return {
      ...row,
      slug: row.slug || `project-${row.id}`,
    }
  },
}

export default backfill
```

Then run it:
```bash
# Dry run first (safe)
npm run backfill backfills/my-backfill.ts

# If results look good, run live
npm run backfill backfills/my-backfill.ts --no-dry-run
```

**Option 2: Custom Script**

```typescript
import path from "path"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../types/supabase"

dotenv.config({ path: path.join(__dirname, "../.env") })

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Your logic here
  const { data, error } = await supabase
    .from("prototypes")
    .select("*")
    .limit(10)

  console.log("Data:", data)
}

main().catch(console.error)
```

### Available Tables (Type-Safe)

All Supabase tables are available with full TypeScript autocomplete:

- `prototypes`
- `prototype_files`
- `users`
- `api_usage`
- `credit_grants`
- And more... (see `types/supabase.ts` for complete list)

### TypeScript Features

✅ Full type safety with Supabase generated types
✅ Auto-import support for all types
✅ IntelliSense/autocomplete for database schema
✅ Runtime type checking with strict mode
✅ No build step required - run TypeScript directly

### Examples

Check out these example scripts:
- `backfills/example-backfill.ts` - Table backfill pattern
- `backfills/example-simple-script.ts` - Custom script pattern

### Troubleshooting

**Import errors?**
- Make sure you're using `import` not `require`
- Use `import type` for type-only imports

**Type errors?**
- Run `npm run check` to see all errors
- Check `types/supabase.ts` for available types

**Environment variables not loading?**
- Ensure `.env` exists (copy from `.env.example`)
- Add `dotenv.config({ path: path.join(__dirname, "../.env") })` at top of file
