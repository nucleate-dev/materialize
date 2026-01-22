#!/usr/bin/env node

/**
 * Script to update .gitignore files in prototype_files table
 *
 * This script:
 * 1. Loads environment variables from .env file
 * 2. Fetches all prototypes in batches
 * 3. For each batch, upserts the .gitignore file into prototype_files
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Configuration
const BATCH_SIZE = 100; // Process 100 prototypes at a time
const GITIGNORE_PATH = path.join(
  __dirname,
  "../../starters/starter-app-stylesheets/.gitignore",
);

// Validate environment variables
function validateEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `❌ Missing required environment variables: ${missing.join(", ")}`,
    );
    console.error("Please ensure .env file exists with all required variables");
    process.exit(1);
  }
}

// Initialize Supabase client
function initSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// Read the .gitignore file
function readGitignoreFile() {
  try {
    const contents = fs.readFileSync(GITIGNORE_PATH, "utf8");
    console.log(
      `✅ Successfully read .gitignore file (${contents.length} bytes)`,
    );
    return contents;
  } catch (error) {
    console.error(
      `❌ Failed to read .gitignore file at ${GITIGNORE_PATH}:`,
      error.message,
    );
    process.exit(1);
  }
}

// Fetch all prototype IDs in batches
async function* fetchPrototypeBatches(supabase) {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("prototypes")
      .select("id")
      .range(offset, offset + BATCH_SIZE - 1)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(`❌ Error fetching prototypes at offset ${offset}:`, error);
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    console.log(
      `📦 Fetched batch: ${data.length} prototypes (offset: ${offset})`,
    );
    yield data;

    offset += BATCH_SIZE;
    hasMore = data.length === BATCH_SIZE;
  }
}

// Upsert .gitignore file for a batch of prototypes
async function upsertGitignoreForBatch(
  supabase,
  prototypeIds,
  gitignoreContents,
) {
  const upsertData = prototypeIds.map((prototypeId) => ({
    prototype_id: prototypeId,
    name: ".gitignore",
    contents: gitignoreContents,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("prototype_files")
    .upsert(upsertData, {
      onConflict: "prototype_id,name",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("❌ Error upserting .gitignore files:", error);
    throw error;
  }

  return upsertData.length;
}

// Main execution
async function main() {
  console.log("🚀 Starting .gitignore update script...\n");

  // Validate environment
  validateEnv();
  console.log("✅ Environment variables validated\n");

  // Initialize Supabase
  const supabase = initSupabase();
  console.log("✅ Supabase client initialized\n");

  // Read .gitignore file
  const gitignoreContents = readGitignoreFile();
  console.log("");

  // Process prototypes in batches
  let totalProcessed = 0;
  let batchNumber = 0;

  try {
    for await (const batch of fetchPrototypeBatches(supabase)) {
      batchNumber++;
      const prototypeIds = batch.map((p) => p.id);

      console.log(
        `\n📝 Processing batch ${batchNumber} (${prototypeIds.length} prototypes)...`,
      );

      const upserted = await upsertGitignoreForBatch(
        supabase,
        prototypeIds,
        gitignoreContents,
      );
      totalProcessed += upserted;

      console.log(
        `✅ Batch ${batchNumber} complete: ${upserted} files upserted`,
      );
      console.log(`   Total processed so far: ${totalProcessed}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log(`🎉 Update complete!`);
    console.log(`   Total prototypes processed: ${totalProcessed}`);
    console.log(`   All .gitignore files have been updated successfully`);
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ Script failed with error:", error);
    console.error("=".repeat(60));
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

module.exports = { main };
