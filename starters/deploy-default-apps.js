/**
 * Deploy Default Apps to S3
 *
 * This script builds multiple React Native web apps from the starters/ directory and uploads
 * both the build files and raw source files to S3.
 *
 * Prerequisites:
 * 1. AWS CLI configured with appropriate credentials
 * 2. Node.js and npm/expo installed
 *
 * Usage:
 *   node deploy-default-apps.js                                    # Deploy all apps to development
 *   node deploy-default-apps.js --production                       # Deploy all apps to production
 *   node deploy-default-apps.js starter-app-nativewind             # Deploy single app to development
 *   node deploy-default-apps.js starter-app-nativewind --production # Deploy single app to production
 *
 * What this script does:
 * For each starter app in starters/:
 * 1. Builds the React Native web app using "expo export --platform web"
 * 2. Uploads build files (dist/) to S3 under "[ENV_PREFIX]starter-app-{name}/" prefix
 * 3. Uploads raw source files to S3 under "[ENV_PREFIX]starter-app-{name}-raw-files/" prefix
 * 4. Excludes common files like node_modules, .git, etc.
 *
 * Environment:
 * - Without --production flag: Uploads to development-starter-app-{name}/
 * - With --production flag: Uploads to starter-app-{name}/
 */

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUCKET = "materialize-sites";
const STARTERS_DIR = __dirname;

// Check for --production flag
const isProduction = process.argv.includes("--production");
const ENV_PREFIX = isProduction ? "" : "development-";

// All available starter apps
const ALL_STARTER_APPS = [
  "starter-app-nativewind",
  "starter-app-stylesheets",
  "starter-app-tamagui",
];

// Check for specific app argument (non-flag arguments)
const appArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
let STARTER_APPS;

if (appArgs.length > 0) {
  // Deploy only the specified app
  const requestedApp = appArgs[0];
  if (!ALL_STARTER_APPS.includes(requestedApp)) {
    console.error(`❌ Error: Unknown starter app "${requestedApp}"`);
    console.error(`Available apps: ${ALL_STARTER_APPS.join(", ")}`);
    process.exit(1);
  }
  STARTER_APPS = [requestedApp];
  console.log(`📱 Deploying single app: ${requestedApp}`);
} else {
  // Deploy all apps
  STARTER_APPS = ALL_STARTER_APPS;
  console.log(`📱 Deploying all apps`);
}

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-2",
});

// Files and directories to exclude from raw files upload
const EXCLUDED_PATTERNS = [
  "node_modules",
  "dist",
  ".git",
  ".expo",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".claude",
  "*.log",
  "npm-debug.log*",
  "yarn-debug.log*",
  "yarn-error.log*",
  ".DS_Store",
  "Thumbs.db",
  "*.tmp",
  "*.temp",
];

/**
 * Get content type for file based on extension
 */
function getContentType(fileName) {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "js":
    case "jsx":
      return "application/javascript";
    case "ts":
    case "tsx":
      return "application/typescript";
    case "json":
      return "application/json";
    case "css":
      return "text/css";
    case "html":
      return "text/html";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "ttf":
      return "font/ttf";
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    case "ico":
      return "image/x-icon";
    default:
      return "text/plain";
  }
}

/**
 * Check if file should be excluded based on patterns
 */
function shouldExcludeFile(filePath, basePath) {
  const relativePath = path.relative(basePath, filePath);
  const pathSegments = relativePath.split(path.sep);
  const basename = path.basename(filePath);

  return EXCLUDED_PATTERNS.some((pattern) => {
    if (pattern.includes("*")) {
      // Handle wildcard patterns
      // Escape special regex characters except *, then replace * with proper glob pattern
      const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      const regexPattern = "^" + escapedPattern.replace(/\*/g, "[^/]*") + "$";
      const regex = new RegExp(regexPattern);
      return regex.test(relativePath) || regex.test(basename);
    } else {
      // Handle exact matches: check if pattern matches any path segment or the basename exactly
      return pathSegments.includes(pattern) || basename === pattern;
    }
  });
}

/**
 * Get all files recursively from a directory
 */
function getAllFiles(dirPath, basePath = dirPath, excludePatterns = true) {
  const files = [];

  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (excludePatterns && shouldExcludeFile(fullPath, basePath)) {
        continue;
      }

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  traverse(dirPath);
  return files;
}

/**
 * Delete all objects with a given prefix from S3
 */
async function clearS3Prefix(prefix) {
  console.log(`🧹 Clearing S3 prefix: ${prefix}`);

  const listCommand = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
  });

  const listResult = await s3Client.send(listCommand);

  if (!listResult.Contents || listResult.Contents.length === 0) {
    console.log(`   No objects found with prefix: ${prefix}`);
    return;
  }

  console.log(`   Found ${listResult.Contents.length} objects to delete`);

  const deletePromises = listResult.Contents.map((object) => {
    if (!object.Key) return Promise.resolve();

    return s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: object.Key,
      }),
    );
  });

  await Promise.all(deletePromises);
  console.log(`   ✅ Deleted ${listResult.Contents.length} objects`);
}

/**
 * Upload files to S3 with a given prefix, batched for better performance
 */
async function uploadFilesToS3(files, basePath, s3Prefix) {
  console.log(`📤 Uploading ${files.length} files to S3 prefix: ${s3Prefix}`);

  let successCount = 0;
  let errorCount = 0;

  const BATCH_SIZE = 10;

  // Process files in batches
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(files.length / BATCH_SIZE);

    console.log(
      `   📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)`,
    );

    const uploadPromises = batch.map(async (filePath) => {
      try {
        const relativePath = path.relative(basePath, filePath);
        const s3Key = `${s3Prefix}${relativePath.replace(/\\/g, "/")}`;

        const fileContent = fs.readFileSync(filePath);
        const contentType = getContentType(filePath);

        await s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: s3Key,
            Body: fileContent,
            ContentType: contentType,
          }),
        );

        console.log(`   ✅ Uploaded: ${s3Key}`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed to upload ${filePath}:`, error.message);
        errorCount++;
      }
    });

    await Promise.all(uploadPromises);
  }

  console.log(
    `📊 Upload summary: ${successCount} successful, ${errorCount} failed`,
  );

  if (errorCount > 0) {
    throw new Error(`${errorCount} files failed to upload`);
  }
}

/**
 * Build a React Native web app
 */
function buildApp(appDir, appName) {
  console.log(`🏗️  Building ${appName}...`);

  // React Native app is now in the client/ subdirectory
  const clientDir = path.join(appDir, "client");
  console.log(`   Working directory: ${clientDir}`);

  try {
    // First, ensure dependencies are installed
    console.log("   📦 Installing dependencies...");
    execSync("npm install", {
      cwd: clientDir,
      stdio: "inherit",
    });

    // Run expo export using npx
    console.log("   🚀 Running expo export...");
    execSync("npx expo export --platform web", {
      cwd: clientDir,
      stdio: "inherit",
    });

    console.log(`   ✅ Build completed successfully for ${appName}`);

    // Verify dist directory exists
    const distDir = path.join(clientDir, "dist");
    if (!fs.existsSync(distDir)) {
      throw new Error(`Build output directory not found: ${distDir}`);
    }

    return distDir;
  } catch (error) {
    console.error(`   ❌ Build failed for ${appName}:`, error.message);
    throw error;
  }
}

/**
 * Deploy a single starter app
 */
async function deployApp(appName) {
  const appDir = path.join(STARTERS_DIR, appName);

  console.log("");
  console.log("=".repeat(60));
  console.log(`🚀 Deploying ${appName}...`);
  console.log("=".repeat(60));
  console.log("");

  // Verify app directory exists
  if (!fs.existsSync(appDir)) {
    throw new Error(`App directory not found: ${appDir}`);
  }

  try {
    // Step 1: Build the app
    const distDir = buildApp(appDir, appName);
    console.log("");

    // Apply environment prefix to S3 paths
    const s3AppName = `${ENV_PREFIX}${appName}`;

    // Step 2: Clear existing S3 prefixes
    await clearS3Prefix(`${s3AppName}/`);
    await clearS3Prefix(`${s3AppName}-raw-files/`);
    console.log("");

    // Step 3: Upload build files
    console.log("📦 Uploading build files...");
    const buildFiles = getAllFiles(distDir, distDir, false);
    await uploadFilesToS3(buildFiles, distDir, `${s3AppName}/`);
    console.log("");

    // Step 4: Upload raw source files
    console.log("📁 Uploading raw source files...");
    const sourceFiles = getAllFiles(appDir, appDir, true);
    console.log(
      `   Found ${sourceFiles.length} source files (after exclusions)`,
    );
    await uploadFilesToS3(sourceFiles, appDir, `${s3AppName}-raw-files/`);
    console.log("");

    console.log(`🎉 ${appName} deployed successfully!`);
    console.log("");
    console.log("Deployed:");
    console.log(`   • Build files: s3://${BUCKET}/${s3AppName}/`);
    console.log(`   • Source files: s3://${BUCKET}/${s3AppName}-raw-files/`);
  } catch (error) {
    console.error(`💥 Deployment failed for ${appName}:`, error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log("🚀 Starting deployment of all starter apps to S3...");
  console.log(`   Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(`   S3 Bucket: ${BUCKET}`);
  console.log(`   S3 Prefix: ${ENV_PREFIX || "(none)"}`);
  console.log(`   Starters Directory: ${STARTERS_DIR}`);
  console.log(`   Apps to deploy: ${STARTER_APPS.join(", ")}`);
  console.log("");

  const startTime = Date.now();
  const results = {
    successful: [],
    failed: [],
  };

  // Deploy each app sequentially
  for (const appName of STARTER_APPS) {
    try {
      await deployApp(appName);
      results.successful.push(appName);
    } catch (error) {
      results.failed.push({ appName, error: error.message });
      // Continue with next app even if one fails
      console.error(`\n⚠️  Continuing with next app despite failure...\n`);
    }
  }

  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);

  console.log("");
  console.log("=".repeat(60));
  console.log("📊 DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("");
  console.log(
    `✅ Successful: ${results.successful.length}/${STARTER_APPS.length}`,
  );
  results.successful.forEach((app) => console.log(`   • ${app}`));
  console.log("");

  if (results.failed.length > 0) {
    console.log(`❌ Failed: ${results.failed.length}/${STARTER_APPS.length}`);
    results.failed.forEach(({ appName, error }) => {
      console.log(`   • ${appName}: ${error}`);
    });
    console.log("");
  }

  console.log(`⏱️  Total time: ${duration}s`);
  console.log("");

  if (results.failed.length > 0) {
    console.error("💥 Some deployments failed. See errors above.");
    process.exit(1);
  } else {
    console.log("🎉 All deployments completed successfully!");
  }
}

// Run the deployment
main();
