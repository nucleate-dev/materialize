/**
 * Fixer to ensure all prototypes have a .gitignore file
 *
 * This script checks each prototype to see if it has a .gitignore file
 * in the prototype_files table, and creates one if it doesn't exist.
 *
 * Run with:
 *   npm run backfill -- fixers/ensure-gitignore.ts                    # Dry run
 *   npm run backfill -- fixers/ensure-gitignore.ts --no-dry-run       # Apply changes
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
    const { data, error } = await supabase
      .from("prototype_files")
      .select("id")
      .eq("prototype_id", row.id)
      .eq("name", ".gitignore")
      .maybeSingle();

    if (error) {
      console.error(
        `Failed to check for .gitignore in prototype ${row.id}: ${error.message}`,
      );
    }

    // If .gitignore doesn't exist, the row is inconsistent
    return data === null;
  },

  async genFixRow(row) {
    // Create the .gitignore file in prototype_files
    const { error } = await supabase.from("prototype_files").insert({
      prototype_id: row.id,
      name: ".gitignore",
      contents: GITIGNORE_CONTENT,
    });

    if (error) {
      console.error(
        `Failed to create .gitignore for prototype ${row.id}: ${error.message}`,
      );
    }

    console.log(`   ✅ Created .gitignore file for prototype ${row.id}`);

    // Return the row unchanged (we're modifying a related table, not this row)
    return row;
  },
};

export default fixer;

// Default .gitignore content from starter-app-stylesheets
const GITIGNORE_CONTENT = `# Learn more https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files

# dependencies
node_modules/

# Expo
.expo/
dist/
web-build/
expo-env.d.ts

# Native
.kotlin/
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision

# Metro
.metro-health-check*

# debug
npm-debug.*
yarn-debug.*
yarn-error.*

# macOS
.DS_Store
*.pem

# local env files
.env
.env*.local

# typescript
*.tsbuildinfo

# Claude Code
.claude/

# NPM cache
.npm-cache/

# iOS
ios/Pods/
ios/build/
*.xcworkspace
!default.xcworkspace
*.xcuserstate
*.moved-aside
DerivedData/
*.hmap
*.ipa

# Android
android/app/build/
android/app/release/
android/build/
android/.gradle/
android/local.properties
*.apk

# Logs
*.log
logs/

# Testing
coverage/
.nyc_output/

# Editor directories and files
.idea/
.vscode/
*.swp
*.swo
*~
.project
.classpath
.settings/
*.sublime-workspace

# OS
Thumbs.db
`;
