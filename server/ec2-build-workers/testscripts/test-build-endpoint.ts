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
const PROTOTYPE_ID = `test-build-${Date.now()}`;

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
      // Skip certain file types that shouldn't be sent
      // if (item.endsWith('.png') || item.endsWith('.ttf') || item.endsWith('.jpg') || item.endsWith('.jpeg') || item.endsWith('.gif')) {
      //   console.log(`⏭️  Skipping binary file: ${itemRelativePath}`);
      //   continue;
      // }

      try {
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

async function testBuildEndpoint() {
  console.log("🧪 Testing /build endpoint...");
  console.log("📋 Server URL:", SERVER_URL);
  console.log("🆔 Prototype ID:", PROTOTYPE_ID);
  console.log("📁 Test directory:", TEST_DIR);
  console.log("🏠 Local mode:", isLocal ? "ON" : "OFF");

  try {
    // Read all files from test directory
    console.log("📂 Reading files from test directory...");
    const files = await readAllFiles(TEST_DIR);

    console.log(`📄 Found ${files.length} files:`);
    files.forEach((file) => console.log(`   - ${file.path}`));

    // Make request to build endpoint
    console.log("\n🚀 Sending build request...");
    const startTime = Date.now();

    const response = await fetch(`${SERVER_URL}/build`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prototypeId: PROTOTYPE_ID,
        files,
      }),
    });

    const responseTime = Date.now() - startTime;
    const result = await response.json();

    console.log("\n📊 Response Status:", response.status);
    console.log("⏱️  Total Time:", `${responseTime}ms`);
    console.log("📈 Response:", JSON.stringify(result, null, 2));

    if (response.ok && result.success) {
      console.log("✅ Build endpoint test completed successfully!");
      console.log("📁 Output path:", result.outputPath);
    } else {
      console.log("❌ Build endpoint test failed!");
      if (result.error) {
        console.log("💥 Error:", result.error);
      }
      if (result.buildLog) {
        console.log("📝 Build log:");
        result.buildLog.forEach((log: any) => {
          const status = log.success ? "✓" : "✗";
          console.log(`   ${status} ${log.step}: ${log.output || log.error}`);
        });
      }
    }
  } catch (error) {
    console.error("💥 Test failed with error:", error);
    process.exit(1);
  }
}

// Run the test
testBuildEndpoint().catch(console.error);
