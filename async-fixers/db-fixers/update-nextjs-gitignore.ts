/**
 * Fixer to update .gitignore files for web_nextjs_react prototypes
 *
 * This script checks each prototype with framework === "web_nextjs_react"
 * and updates the .gitignore file in the prototype_files table to match
 * the content from the web-starter-app-nextjs starter template.
 *
 * Run with:
 *   npm run backfill -- fixers/update-nextjs-gitignore.ts                    # Dry run
 *   npm run backfill -- fixers/update-nextjs-gitignore.ts --no-dry-run       # Apply changes
 */

import { createClient } from "@supabase/supabase-js";
import type { NucleateDBFixer } from "../nucleate-db-fixer";
import type { Database } from "../types/supabase";

// Initialize Supabase client for database operations
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const fixer: NucleateDBFixer<"prototypes"> = {
  table: "prototypes",

  async genIsInconsistent(row) {
    // Only check web_nextjs_react prototypes
    if (row.framework !== "web_nextjs_react") {
      return false;
    }

    const { data, error } = await supabase
      .from("prototype_files")
      .select("contents")
      .eq("prototype_id", row.id)
      .eq("name", ".gitignore")
      .maybeSingle();

    if (error) {
      console.error(
        `Failed to check .gitignore for prototype ${row.id}: ${error.message}`,
      );
      return false;
    }

    // If .gitignore doesn't exist or has different content, it's inconsistent
    if (data === null) {
      console.log(`   ⚠️  Prototype ${row.id} has no .gitignore file`);
      return false; // We can't update what doesn't exist
    }

    return data.contents !== NEXTJS_GITIGNORE_CONTENT;
  },

  async genFixRow(row) {
    // Update the .gitignore file in prototype_files
    const { error } = await supabase
      .from("prototype_files")
      .update({
        contents: NEXTJS_GITIGNORE_CONTENT,
      })
      .eq("prototype_id", row.id)
      .eq("name", ".gitignore");

    if (error) {
      console.error(
        `Failed to update .gitignore for prototype ${row.id}: ${error.message}`,
      );
    } else {
      console.log(`   ✅ Updated .gitignore file for prototype ${row.id}`);
    }

    // Return the row unchanged (we're modifying a related table, not this row)
    return row;
  },
};

export default fixer;

// .gitignore content from web-starter-app-nextjs
const NEXTJS_GITIGNORE_CONTENT = `# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
node_modules/
.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
coverage/

# next.js
client/.next/
client/out/

# production
build/

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

.npm-cache/

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
`;
