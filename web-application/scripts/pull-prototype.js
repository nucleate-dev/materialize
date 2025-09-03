#!/usr/bin/env node

/**
 * Script to pull prototype files from Supabase and save them locally for development
 * Usage: node scripts/pull-prototype.js [prototype-id] [output-directory]
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load environment variables
require("dotenv").config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function pullPrototypeFiles(prototypeId, outputDir = "./prototype-dev") {
  try {
    console.log(`🔍 Fetching files for prototype: ${prototypeId}`);

    // Get prototype files from Supabase
    const { data: files, error } = await supabase
      .from("prototype_files")
      .select("name, contents")
      .eq("prototype_id", prototypeId);

    if (error) {
      throw new Error(`Failed to fetch prototype files: ${error.message}`);
    }

    if (!files || files.length === 0) {
      console.log(`❌ No files found for prototype: ${prototypeId}`);
      return;
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`📁 Creating files in: ${outputDir}`);

    // Write each file to the local directory
    for (const file of files) {
      const filePath = path.join(outputDir, file.name);

      // Create directory if file is in a subdirectory
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file contents
      fs.writeFileSync(filePath, file.contents, "utf8");
      console.log(`✅ Created: ${file.name}`);
    }

    console.log(
      `\n🎉 Successfully pulled ${files.length} files from prototype ${prototypeId}`,
    );
    console.log(`📂 Files are available in: ${outputDir}`);
  } catch (error) {
    console.error("❌ Error pulling prototype files:", error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const prototypeId = args[0];
const outputDir = args[1];

if (!prototypeId) {
  console.log(
    "Usage: node scripts/pull-prototype.js [prototype-id] [output-directory]",
  );
  console.log("Example: node scripts/pull-prototype.js abc123 ./my-prototype");
  process.exit(1);
}

// Run the script
pullPrototypeFiles(prototypeId, outputDir);
