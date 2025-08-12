#!/usr/bin/env node

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
const PROTOTYPE_ID = `test-public-dev-server-${Date.now()}`;

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

async function makeRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
) {
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

async function testPublicDevServerEndpoints() {
  console.log("🧪 Testing Public Dev Server endpoints...");
  console.log("📋 Server URL:", SERVER_URL);
  console.log("🆔 Prototype ID:", PROTOTYPE_ID);
  console.log("📁 Test directory:", TEST_DIR);
  console.log("🏠 Local mode:", isLocal ? "ON" : "OFF");
  console.log("ℹ️  Assuming dev server is already running...");

  try {
    // Read all files from test directory
    console.log("\n📂 Reading files from test directory...");
    const files = await readAllFiles(TEST_DIR);

    console.log(`📄 Found ${files.length} files:`);
    files.forEach((file) => console.log(`   - ${file.path}`));

    // Test 1: Check if dev server is accessible
    console.log("\n🔍 Test 1: Checking dev server accessibility...");
    try {
      const { response: healthResponse } = await makeRequest("/health", "GET");
      console.log("📊 Health Check Response Status:", healthResponse.status);
      if (healthResponse.ok) {
        console.log("✅ Dev server is accessible");
      } else {
        console.log("⚠️  Dev server health check failed");
      }
    } catch (error) {
      console.log("⚠️  Could not reach dev server health endpoint");
    }

    // Test 2: Test file upload with complete scope
    console.log("\n📤 Test 2: Testing file upload (complete scope)...");

    // Convert FileInput[] to Record<string, string> as expected by the API
    const filesMap: Record<string, string> = {};
    files.forEach((file) => {
      filesMap[file.path] = file.content;
    });

    const { response: uploadResponse, result: uploadResult } =
      await makeRequest("/dev-server", "POST", {
        prototype_id: PROTOTYPE_ID,
        framework: "expo_react_native",
        files: filesMap,
        file_scope: "complete",
      });

    console.log("📊 Upload Response Status:", uploadResponse.status);
    console.log("📈 Upload Result:", JSON.stringify(uploadResult, null, 2));

    if (uploadResponse.ok && uploadResult.status === "success") {
      console.log("✅ File upload successful");
      if (uploadResult.tunnel_url) {
        console.log("🌐 Tunnel URL:", uploadResult.tunnel_url);
      }
    } else {
      console.log("❌ File upload failed");
      if (uploadResult.build_errors?.length > 0) {
        console.log("Build Errors:", uploadResult.build_errors);
      }
    }

    // Test 3: Test hot reload with updates scope
    console.log("\n🔄 Test 3: Testing hot reload (updates scope)...");
    const updatedFiles = [
      {
        path: "app/index.tsx",
        content: `import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello World - UPDATED!</Text>
      <Text style={styles.subtitle}>This app has been hot-reloaded</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
  },
});`,
      },
    ];

    // Convert to map format for the API
    const updatedFilesMap: Record<string, string> = {};
    updatedFiles.forEach((file) => {
      updatedFilesMap[file.path] = file.content;
    });

    const { response: updateResponse, result: updateResult } =
      await makeRequest("/dev-server", "POST", {
        prototype_id: PROTOTYPE_ID,
        framework: "expo_react_native",
        files: updatedFilesMap,
        file_scope: "updates",
      });

    console.log("📊 Update Response Status:", updateResponse.status);
    console.log("📈 Update Result:", JSON.stringify(updateResult, null, 2));

    if (updateResponse.ok && updateResult.status === "success") {
      console.log("✅ Hot reload update successful");
    } else {
      console.log("❌ Hot reload update failed");
    }

    // Test 4: Test build completion
    console.log("\n🏗️  Test 4: Testing build completion...");
    const { response: buildResponse, result: buildResult } = await makeRequest(
      "/dev-server",
      "DELETE",
      {
        prototype_id: PROTOTYPE_ID,
      },
    );

    console.log("📊 Build Response Status:", buildResponse.status);
    console.log("📈 Build Result:", JSON.stringify(buildResult, null, 2));

    if (buildResult.status === "success") {
      console.log("✅ Build completed successfully");
      if (buildResult.build_url) {
        console.log("🌐 Build URL:", buildResult.build_url);
      }
    } else {
      console.log("❌ Build failed");
      if (buildResult.build_errors?.length > 0) {
        console.log("Build Errors:", buildResult.build_errors);
      }
    }

    console.log("\n✅ All public dev server endpoint tests completed!");
  } catch (error) {
    console.error("💥 Test failed with error:", error);
    process.exit(1);
  }
}

// Test React framework support
async function testReactFramework() {
  console.log("\n🧪 Testing React Framework Support...");

  const reactFiles = [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "test-react-app",
          version: "1.0.0",
          scripts: {
            start: "react-scripts start",
            build: "react-scripts build",
          },
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0",
            "react-scripts": "5.0.1",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "public/index.html",
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Test React App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
    },
    {
      path: "src/index.js",
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);`,
    },
    {
      path: "src/App.js",
      content: `import React from 'react';

function App() {
  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Hello React!</h1>
      <p>This is a test React application.</p>
    </div>
  );
}

export default App;`,
    },
  ];

  const reactPrototypeId = `test-react-${Date.now()}`;

  try {
    // Convert FileInput[] to Record<string, string> for the API
    const reactFilesMap: Record<string, string> = {};
    reactFiles.forEach((file) => {
      reactFilesMap[file.path] = file.content;
    });

    const { response, result } = await makeRequest("/dev-server", "POST", {
      prototype_id: reactPrototypeId,
      framework: "react",
      files: reactFilesMap,
      file_scope: "complete",
    });

    console.log("📊 React Framework Response Status:", response.status);
    console.log(
      "📈 React Framework Response Body:",
      JSON.stringify(result, null, 2),
    );

    if (result.status === "success") {
      console.log("✅ React framework support working");
    } else {
      console.log("⚠️ React framework support needs improvement");
    }

    // Clean up React test
    try {
      await makeRequest("/dev-server", "DELETE", {
        prototype_id: reactPrototypeId,
      });
    } catch (cleanupError) {
      console.error("💥 React cleanup failed:", cleanupError);
    }
  } catch (error) {
    console.error("❌ React framework test failed:", error);
  }
}

// Add option to test individual endpoints
const testType = process.argv
  .find((arg) => arg.startsWith("--test="))
  ?.split("=")[1];

if (testType) {
  console.log(`🎯 Running specific test: ${testType}`);
  // Add specific test handlers here if needed
} else {
  // Run the full test suite
  testPublicDevServerEndpoints()
    .then(() => testReactFramework())
    .catch(console.error);
}
