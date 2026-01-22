#!/usr/bin/env node

/**
 * Script to list and count files in the prototype-thumbnails storage bucket
 *
 * This script:
 * 1. Loads environment variables from .env file
 * 2. Lists all files in the prototype-thumbnails bucket
 * 3. Provides statistics about the files (count, total size, file types, etc.)
 */

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Configuration
const BUCKET_NAME = "prototype-thumbnails";
const BATCH_SIZE = 1000; // Supabase storage list limit

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
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

// Format bytes to human-readable size
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Get file extension
function getFileExtension(filename) {
  const parts = filename.split(".");
  return parts.length > 1
    ? parts[parts.length - 1].toLowerCase()
    : "no-extension";
}

// List all files in the bucket recursively
async function listAllFiles(supabase, bucketName) {
  const allFiles = [];
  let hasMore = true;
  let offset = 0;

  console.log(`📦 Listing files in bucket: ${bucketName}\n`);

  while (hasMore) {
    const { data, error } = await supabase.storage.from(bucketName).list("", {
      limit: BATCH_SIZE,
      offset: offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      console.error(`❌ Error listing files at offset ${offset}:`, error);
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`   Fetched ${data.length} files (offset: ${offset})...`);
    allFiles.push(...data);

    offset += BATCH_SIZE;
    hasMore = data.length === BATCH_SIZE;
  }

  return allFiles;
}

// Analyze files and generate statistics
function analyzeFiles(files) {
  const stats = {
    totalCount: files.length,
    totalSize: 0,
    fileTypes: {},
    largestFile: null,
    smallestFile: null,
    averageSize: 0,
  };

  files.forEach((file) => {
    // Skip folders
    if (!file.metadata || typeof file.metadata.size === "undefined") {
      return;
    }

    const size = file.metadata.size || 0;
    stats.totalSize += size;

    // Track file types
    const ext = getFileExtension(file.name);
    if (!stats.fileTypes[ext]) {
      stats.fileTypes[ext] = { count: 0, totalSize: 0 };
    }
    stats.fileTypes[ext].count++;
    stats.fileTypes[ext].totalSize += size;

    // Track largest file
    if (!stats.largestFile || size > stats.largestFile.size) {
      stats.largestFile = { name: file.name, size };
    }

    // Track smallest file
    if (!stats.smallestFile || size < stats.smallestFile.size) {
      stats.smallestFile = { name: file.name, size };
    }
  });

  stats.averageSize =
    stats.totalCount > 0 ? stats.totalSize / stats.totalCount : 0;

  return stats;
}

// Display statistics
function displayStats(stats) {
  console.log("\n" + "=".repeat(70));
  console.log("📊 STORAGE BUCKET STATISTICS");
  console.log("=".repeat(70));

  console.log("\n📁 Overall Statistics:");
  console.log(`   Total Files: ${stats.totalCount.toLocaleString()}`);
  console.log(`   Total Size: ${formatBytes(stats.totalSize)}`);
  console.log(`   Average File Size: ${formatBytes(stats.averageSize)}`);

  if (stats.largestFile) {
    console.log(`\n📈 Largest File:`);
    console.log(`   Name: ${stats.largestFile.name}`);
    console.log(`   Size: ${formatBytes(stats.largestFile.size)}`);
  }

  if (stats.smallestFile) {
    console.log(`\n📉 Smallest File:`);
    console.log(`   Name: ${stats.smallestFile.name}`);
    console.log(`   Size: ${formatBytes(stats.smallestFile.size)}`);
  }

  console.log(`\n📝 File Types Breakdown:`);
  const sortedTypes = Object.entries(stats.fileTypes).sort(
    (a, b) => b[1].count - a[1].count,
  );

  sortedTypes.forEach(([ext, data]) => {
    const percentage = ((data.count / stats.totalCount) * 100).toFixed(1);
    console.log(
      `   .${ext.padEnd(15)} ${data.count.toString().padStart(6)} files  (${percentage.padStart(5)}%)  ${formatBytes(data.totalSize)}`,
    );
  });

  console.log("\n" + "=".repeat(70));
}

// Display sample files
function displaySampleFiles(files, count = 10) {
  console.log(`\n📄 Sample Files (first ${Math.min(count, files.length)}):`);
  console.log("-".repeat(70));

  files.slice(0, count).forEach((file, index) => {
    const size = file.metadata?.size || 0;
    console.log(`   ${(index + 1).toString().padStart(2)}. ${file.name}`);
    console.log(
      `       Size: ${formatBytes(size)} | Created: ${file.created_at || "N/A"}`,
    );
  });

  console.log("-".repeat(70));
}

// Main execution
async function main() {
  console.log("🚀 Starting storage bucket analysis...\n");

  // Validate environment
  validateEnv();
  console.log("✅ Environment variables validated\n");

  // Initialize Supabase
  const supabase = initSupabase();
  console.log("✅ Supabase client initialized\n");

  try {
    // List all files
    const files = await listAllFiles(supabase, BUCKET_NAME);

    if (files.length === 0) {
      console.log("\n📭 No files found in the bucket.");
      return;
    }

    console.log(`\n✅ Successfully retrieved ${files.length} files\n`);

    // Analyze files
    const stats = analyzeFiles(files);

    // Display results
    displayStats(stats);
    displaySampleFiles(files, 10);

    console.log("\n✅ Analysis complete!\n");
  } catch (error) {
    console.error("\n" + "=".repeat(70));
    console.error("❌ Script failed with error:", error);
    console.error("=".repeat(70));
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
