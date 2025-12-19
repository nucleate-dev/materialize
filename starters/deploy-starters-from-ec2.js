#!/usr/bin/env node
/**
 * Deploy Starter Apps to S3 from EC2
 *
 * This script packages the starters directory, transfers it to EC2, and runs
 * the deployment script there to upload starter apps to S3.
 *
 * useful when your internet connection is poor, like on an airplane
 *
 * Prerequisites:
 * 1. .env file in /server/scripts/ directory with HOST=<your-ec2-host>
 * 2. mat-ec2-key-1.pem SSH key in repository root
 * 3. AWS credentials configured on EC2 instance
 *
 * Usage:
 *   node deploy-starters-from-ec2.js                                    # Deploy all apps to development
 *   node deploy-starters-from-ec2.js --production                       # Deploy all apps to production
 *   node deploy-starters-from-ec2.js starter-app-nativewind             # Deploy single app to development
 *   node deploy-starters-from-ec2.js starter-app-nativewind --production # Deploy single app to production
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/scripts/.env
const envPath = path.join(__dirname, "..", "server", "scripts", ".env");

if (!fs.existsSync(envPath)) {
  console.error(`❌ Error: .env file not found at ${envPath}`);
  console.error(
    "Please create a .env file in /server/scripts/ with HOST=<your-ec2-host>",
  );
  process.exit(1);
}

dotenv.config({ path: envPath });

// SSH key is in repository root (one level up from starters/)
const KEY_PATH = path.join(__dirname, "..", "mat-ec2-key-1.pem");
const USER = "ec2-user";
const HOST = process.env.HOST;
const SSH_OPTS =
  "-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=~/.ssh/known_hosts";

if (!HOST) {
  console.error("❌ Error: HOST not defined in .env file");
  process.exit(1);
}

// Parse command line arguments
const isProduction = process.argv.includes("--production");
const appArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const appName = appArgs.length > 0 ? appArgs[0] : null;

// Build deploy flags
let deployArgs = "";
if (appName) {
  deployArgs += appName;
}
if (isProduction) {
  deployArgs += " --production";
}

const localBase = path.resolve(__dirname);
const localZip = "starters.zip";
const remoteHome = `/home/${USER}`;
const remoteZip = `${remoteHome}/starters.zip`;
const remoteBase = `${remoteHome}/starters`;

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: "/bin/bash" });
}

function sq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function runRemoteBash(script) {
  const cmd = `ssh ${SSH_OPTS} -i "${KEY_PATH}" ${USER}@${HOST} "bash -lc ${sq(script)}"`;
  run(cmd);
}

function ensureRemoteReady() {
  console.log("==> Ensuring remote directory is ready...");
  const script = `
    set -euxo pipefail
    mkdir -p ${remoteBase}
    echo "✅ Remote directory ready"
  `;
  runRemoteBash(script);
}

function deployStarters() {
  console.log("==> Full deploy: zipping starters directory...");
  console.log(`   Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`);

  if (!fs.existsSync(localBase)) {
    console.error(`❌ Not found: ${localBase}`);
    process.exit(1);
  }

  // Zip starters directory excluding node_modules, dist, .expo, .next, etc.
  console.log("==> Creating zip file (excluding node_modules, dist, etc.)...");
  run(
    `bash -lc 'cd ${sq(localBase).slice(1, -1)} && zip -r ${sq(
      path.resolve(localZip),
    ).slice(1, -1)} . ` +
      `-x "node_modules/*" ` +
      `-x "*/node_modules/*" ` +
      `-x "*/client/node_modules/*" ` +
      `-x "dist/*" ` +
      `-x "*/dist/*" ` +
      `-x "*/client/dist/*" ` +
      `-x ".expo/*" ` +
      `-x "*/.expo/*" ` +
      `-x "*/client/.expo/*" ` +
      `-x ".expo-shared/*" ` +
      `-x "*/.expo-shared/*" ` +
      `-x ".next/*" ` +
      `-x "*/.next/*" ` +
      `-x "*/client/.next/*" ` +
      `-x "out/*" ` +
      `-x "*/out/*" ` +
      `-x "*/client/out/*" ` +
      `-x "*.log" ` +
      `-x ".DS_Store" ` +
      `-x "starters.zip"'`,
  );

  console.log("==> Copying zip to EC2...");
  run(
    `scp ${SSH_OPTS} -i "${KEY_PATH}" ${localZip} ${USER}@${HOST}:${remoteZip}`,
  );

  console.log("==> Unzipping remotely & preparing for deployment...");
  const script = `
    set -euxo pipefail

    # Clean up old starters directory and create fresh one
    rm -rf ${remoteBase}
    mkdir -p ${remoteBase}

    # Unzip the starters package
    unzip -o ${remoteZip} -d ${remoteBase}
    rm -f ${remoteZip}

    cd ${remoteBase}

    # Install dependencies for the deploy script itself
    if [ -f package.json ]; then
      echo "📦 Installing deployment script dependencies..."
      unset NODE_ENV
      npm_config_production=false npm install --no-audit --no-fund -d || (unset NODE_ENV; npm_config_production=false npm install --no-audit --no-fund -d)
    fi

    echo "✅ Starters package ready for deployment"
  `;
  runRemoteBash(script);

  console.log("==> Running deployment script on EC2...");
  const appInfo = appName ? ` (${appName} only)` : " (all apps)";
  const deployScript = `
    set -euxo pipefail
    cd ${remoteBase}

    echo "🚀 Starting deployment of starter apps to S3..."
    echo "   Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}"
    echo "   Target: ${appName || "all apps"}"

    # Run the deployment script
    node deploy-default-apps.js ${deployArgs}

    echo "✅ Deployment complete!"
  `;
  runRemoteBash(deployScript);

  console.log("==> Cleaning up local zip...");
  try {
    fs.unlinkSync(localZip);
  } catch {}

  console.log("==> Cleaning up remote starters directory...");
  const cleanupScript = `
    set -euxo pipefail
    rm -rf ${remoteBase}
    echo "✅ Cleanup complete"
  `;
  runRemoteBash(cleanupScript);
}

(function main() {
  try {
    console.log("🚀 Starting starter apps deployment from EC2...");
    console.log(`   Target: ${HOST}`);
    console.log(
      `   Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`,
    );
    console.log(`   Apps: ${appName || "all apps"}`);
    console.log("");

    ensureRemoteReady();
    deployStarters();

    console.log("");
    console.log("🎉 All done! Starter apps deployed successfully.");
    console.log("");
  } catch (err) {
    console.error("❌ Deployment failed:", err?.message || err);
    process.exit(1);
  }
})();
