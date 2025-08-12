import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

interface FileInput {
  path: string;
  content: string;
}

// Handle --local flag
const isLocal = process.argv.includes("--local");
const SERVER_URL =
  process.env.SERVER_URL ||
  (isLocal ? "http://localhost:3002" : "http://localhost:3002");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, "../test");
const PROTOTYPE_ID = `test-dev-server-${Date.now()}`;

async function readAllFiles(
  dir: string,
  relativePath = "",
): Promise<FileInput[]> {
  const files: FileInput[] = [];
  const items = await fs.readdir(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const itemRelativePath = path.join(relativePath, item);

    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      const subFiles = await readAllFiles(fullPath, itemRelativePath);
      files.push(...subFiles);
    } else if (stats.isFile()) {
      try {
        // Read all files as UTF-8 for dev server (no binary files needed)
        const content = await fs.readFile(fullPath, "utf8");
        files.push({
          path: itemRelativePath,
          content,
        });
      } catch (error) {
        console.warn(`⚠️  Could not read file ${itemRelativePath}:`, error);
      }
    }
  }

  return files;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeRequest(endpoint: string, method: string = "GET", body?: any) {
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${SERVER_URL}${endpoint}`, options);
  const result = await response.json();

  return { response, result };
}

async function testDevServerEndpoints() {
  console.log("🧪 Testing Expo Dev Server endpoints...");
  console.log("📋 Server URL:", SERVER_URL);
  console.log("🆔 Prototype ID:", PROTOTYPE_ID);
  console.log("📁 Test directory:", TEST_DIR);
  console.log("🏠 Local mode:", isLocal ? "ON" : "OFF");

  try {
    // Read all files from test directory
    console.log("\n📂 Reading files from test directory...");
    const files = await readAllFiles(TEST_DIR);

    console.log(`📄 Found ${files.length} files:`);
    files.forEach((file) => console.log(`   - ${file.path}`));

    // Test 1: Check initial status (should be stopped)
    console.log("\n🔍 Test 1: Checking initial status...");
    const { response: statusResponse1, result: statusResult1 } = await makeRequest("/dev-server/status");
    console.log("📊 Status Response:", statusResponse1.status);
    console.log("📈 Status Result:", JSON.stringify(statusResult1, null, 2));

    // Test 2: Start dev server
    console.log("\n🚀 Test 2: Starting dev server...");
    const startTime = Date.now();
    const { response: startResponse, result: startResult } = await makeRequest(
      "/dev-server/start",
      "POST",
      {
        prototypeId: PROTOTYPE_ID,
        files,
        port: 19006,
      }
    );

    const startResponseTime = Date.now() - startTime;
    console.log("📊 Start Response Status:", startResponse.status);
    console.log("⏱️  Start Time:", `${startResponseTime}ms`);
    console.log("📈 Start Result:", JSON.stringify(startResult, null, 2));

    if (!startResponse.ok || !startResult.success) {
      console.log("❌ Failed to start dev server!");
      return;
    }

    // Wait a bit for the server to fully start
    console.log("\n⏳ Waiting for server to fully initialize...");
    await sleep(5000);

    // Test 3: Check status after start
    console.log("\n🔍 Test 3: Checking status after start...");
    const { response: statusResponse2, result: statusResult2 } = await makeRequest("/dev-server/status");
    console.log("📊 Status Response:", statusResponse2.status);
    console.log("📈 Status Result:", JSON.stringify(statusResult2, null, 2));

    // Test 4: Update files (hot reload)
    console.log("\n🔄 Test 4: Testing hot reload...");
    const updatedFiles = [
      {
        path: "App.js",
        content: `
import React from 'react';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Hello World - UPDATED!</Text>
    </View>
  );
}
        `.trim(),
      },
    ];

    const { response: updateResponse, result: updateResult } = await makeRequest(
      "/dev-server/update-files",
      "POST",
      { files: updatedFiles }
    );

    console.log("📊 Update Response Status:", updateResponse.status);
    console.log("📈 Update Result:", JSON.stringify(updateResult, null, 2));

    // Test 5: Get logs
    console.log("\n📋 Test 5: Getting logs...");
    const { response: logsResponse, result: logsResult } = await makeRequest("/dev-server/logs?lines=20");
    console.log("📊 Logs Response Status:", logsResponse.status);
    console.log("📈 Logs Result:", JSON.stringify(logsResult, null, 2));

    // Wait a bit more to see if hot reload worked
    console.log("\n⏳ Waiting to observe hot reload...");
    await sleep(3000);

    // Test 6: Final status check
    console.log("\n🔍 Test 6: Final status check...");
    const { response: statusResponse3, result: statusResult3 } = await makeRequest("/dev-server/status");
    console.log("📊 Status Response:", statusResponse3.status);
    console.log("📈 Status Result:", JSON.stringify(statusResult3, null, 2));

    // Test 7: Stop dev server
    console.log("\n🛑 Test 7: Stopping dev server...");
    const { response: stopResponse, result: stopResult } = await makeRequest(
      "/dev-server/stop",
      "POST"
    );

    console.log("📊 Stop Response Status:", stopResponse.status);
    console.log("📈 Stop Result:", JSON.stringify(stopResult, null, 2));

    // Test 8: Check status after stop
    console.log("\n🔍 Test 8: Checking status after stop...");
    const { response: statusResponse4, result: statusResult4 } = await makeRequest("/dev-server/status");
    console.log("📊 Status Response:", statusResponse4.status);
    console.log("📈 Status Result:", JSON.stringify(statusResult4, null, 2));

    console.log("\n✅ All dev server endpoint tests completed!");

  } catch (error) {
    console.error("💥 Test failed with error:", error);
    
    // Try to stop the server if something went wrong
    try {
      console.log("\n🧹 Attempting to cleanup by stopping server...");
      await makeRequest("/dev-server/stop", "POST");
    } catch (cleanupError) {
      console.error("💥 Cleanup also failed:", cleanupError);
    }
    
    process.exit(1);
  }
}

// Add option to test individual endpoints
const testType = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];

if (testType) {
  console.log(`🎯 Running specific test: ${testType}`);
  // Add specific test handlers here if needed
} else {
  // Run the full test suite
  testDevServerEndpoints().catch(console.error);
}