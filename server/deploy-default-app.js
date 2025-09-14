/**
 * Deploy Default App to S3
 * 
 * This script builds the React Native web app in build-workers/test/ and uploads
 * both the build files and raw source files to S3.
 * 
 * Prerequisites:
 * 1. AWS CLI configured with appropriate credentials
 * 2. Node.js and npm/expo installed
 * 3. Run `npm install` in this directory first
 * 
 * Usage:
 *   npm install
 *   node deploy-default-app.js
 * 
 * What this script does:
 * 1. Builds the React Native web app using "expo export --platform web"
 * 2. Uploads build files (dist/) to S3 under "default-app/" prefix
 * 3. Uploads raw source files to S3 under "default-app-raw-files/" prefix
 * 4. Excludes common files like node_modules, .git, etc.
 */

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUCKET = 'materialize-sites';
const BUILD_DIR = path.join(__dirname, 'build-workers/test');
const DIST_DIR = path.join(BUILD_DIR, 'dist');

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
});

// Files and directories to exclude from raw files upload
const EXCLUDED_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  '.expo',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.claude',
  '*.log',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  '.DS_Store',
  'Thumbs.db',
  '*.tmp',
  '*.temp',
];

/**
 * Get content type for file based on extension
 */
function getContentType(fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'js':
    case 'jsx':
      return 'application/javascript';
    case 'ts':
    case 'tsx':
      return 'application/typescript';
    case 'json':
      return 'application/json';
    case 'css':
      return 'text/css';
    case 'html':
      return 'text/html';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'ttf':
      return 'font/ttf';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'ico':
      return 'image/x-icon';
    default:
      return 'text/plain';
  }
}

/**
 * Check if file should be excluded based on patterns
 */
function shouldExcludeFile(filePath, basePath) {
  const relativePath = path.relative(basePath, filePath);

  return EXCLUDED_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      // Handle wildcard patterns
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(relativePath) || regex.test(path.basename(filePath));
    } else {
      // Handle exact matches and directory names
      return relativePath.includes(pattern) || path.basename(filePath) === pattern;
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

  const deletePromises = listResult.Contents.map(object => {
    if (!object.Key) return Promise.resolve();

    return s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: object.Key,
    }));
  });

  await Promise.all(deletePromises);
  console.log(`   ✅ Deleted ${listResult.Contents.length} objects`);
}

/**
 * Upload files to S3 with a given prefix
 */
async function uploadFilesToS3(files, basePath, s3Prefix) {
  console.log(`📤 Uploading ${files.length} files to S3 prefix: ${s3Prefix}`);

  let successCount = 0;
  let errorCount = 0;

  const uploadPromises = files.map(async (filePath) => {
    try {
      const relativePath = path.relative(basePath, filePath);
      const s3Key = `${s3Prefix}${relativePath.replace(/\\/g, '/')}`;

      const fileContent = fs.readFileSync(filePath);
      const contentType = getContentType(filePath);

      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: fileContent,
        ContentType: contentType,
      }));

      console.log(`   ✅ Uploaded: ${s3Key}`);
      successCount++;
    } catch (error) {
      console.error(`   ❌ Failed to upload ${filePath}:`, error.message);
      errorCount++;
    }
  });

  await Promise.all(uploadPromises);

  console.log(`📊 Upload summary: ${successCount} successful, ${errorCount} failed`);

  if (errorCount > 0) {
    throw new Error(`${errorCount} files failed to upload`);
  }
}

/**
 * Build the React Native web app
 */
function buildApp() {
  console.log('🏗️  Building React Native web app...');
  console.log(`   Working directory: ${BUILD_DIR}`);

  try {
    // First, ensure dependencies are installed
    console.log('   📦 Installing dependencies...');
    execSync('npm install', {
      cwd: BUILD_DIR,
      stdio: 'inherit'
    });

    // Change to build directory and run expo export using npx
    console.log('   🚀 Running expo export...');
    execSync('npx expo export --platform web', {
      cwd: BUILD_DIR,
      stdio: 'inherit'
    });

    console.log('   ✅ Build completed successfully');

    // Verify dist directory exists
    if (!fs.existsSync(DIST_DIR)) {
      throw new Error(`Build output directory not found: ${DIST_DIR}`);
    }

  } catch (error) {
    console.error('   ❌ Build failed:', error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Starting default app deployment to S3...');
  console.log(`   S3 Bucket: ${BUCKET}`);
  console.log(`   Build Directory: ${BUILD_DIR}`);
  console.log('');

  try {
    // Step 1: Build the app
    buildApp();
    console.log('');

    // Step 2: Clear existing S3 prefixes
    await clearS3Prefix('default-app/');
    await clearS3Prefix('default-app-raw-files/');
    console.log('');

    // Step 3: Upload build files
    console.log('📦 Uploading build files...');
    const buildFiles = getAllFiles(DIST_DIR, DIST_DIR, false);
    await uploadFilesToS3(buildFiles, DIST_DIR, 'default-app/');
    console.log('');

    // Step 4: Upload raw source files
    console.log('📁 Uploading raw source files...');
    const sourceFiles = getAllFiles(BUILD_DIR, BUILD_DIR, true);
    console.log(`   Found ${sourceFiles.length} source files (after exclusions)`);
    await uploadFilesToS3(sourceFiles, BUILD_DIR, 'default-app-raw-files/');
    console.log('');

    console.log('🎉 Deployment completed successfully!');
    console.log('');
    console.log('Deployed:');
    console.log(`   • Build files: s3://${BUCKET}/default-app/`);
    console.log(`   • Source files: s3://${BUCKET}/default-app-raw-files/`);

  } catch (error) {
    console.error('💥 Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run the deployment
main();