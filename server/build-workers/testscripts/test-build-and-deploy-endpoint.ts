import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

interface FileInput {
  path: string;
  content: string;
  isBase64?: boolean;
}

// Handle --local flag
const isLocal = process.argv.includes('--local');
const SERVER_URL = process.env.SERVER_URL || (isLocal ? 'http://localhost:3002' : 'http://localhost:3002');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, '../test');
const PROTOTYPE_ID = `test-full-${Date.now()}`;

function isBinaryFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg',
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
    '.mp4', '.mp3', '.wav', '.ogg', '.webm',
    '.pdf', '.zip', '.tar', '.gz', '.rar',
    '.exe', '.dmg', '.app', '.deb', '.rpm'
  ];
  return binaryExtensions.includes(ext);
}

async function readAllFiles(dir: string, relativePath = ''): Promise<FileInput[]> {
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
        if (isBinaryFile(item)) {
          // Read binary file as base64
          const binaryContent = await fs.readFile(fullPath);
          const base64Content = binaryContent.toString('base64');
          console.log(`📦 Reading binary file as base64: ${itemRelativePath}`);
          files.push({
            path: itemRelativePath,
            content: base64Content,
            isBase64: true,
          });
        } else {
          // Read text file as UTF-8
          const content = await fs.readFile(fullPath, 'utf8');
          files.push({
            path: itemRelativePath,
            content,
            isBase64: false,
          });
        }
      } catch (error) {
        console.warn(`⚠️  Could not read file ${itemRelativePath}:`, error);
      }
    }
  }

  return files;
}

async function testBuildAndDeployEndpoint() {
  console.log('🧪 Testing /build-and-deploy endpoint...');
  console.log('📋 Server URL:', SERVER_URL);
  console.log('🆔 Prototype ID:', PROTOTYPE_ID);
  console.log('📁 Test directory:', TEST_DIR);
  console.log('☁️  S3 Bucket: materialize-sites');
  console.log('🏠 Local mode:', isLocal ? 'ON' : 'OFF');

  try {
    // Read all files from test directory
    console.log('📂 Reading files from test directory...');
    const files = await readAllFiles(TEST_DIR);
    
    console.log(`📄 Found ${files.length} files:`);
    files.forEach(file => console.log(`   - ${file.path}`));

    // Make request to build-and-deploy endpoint
    console.log('\n🚀 Sending build-and-deploy request...');
    const startTime = Date.now();
    
    const response = await fetch(`${SERVER_URL}/build-and-deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prototypeId: PROTOTYPE_ID,
        files
      })
    });

    const responseTime = Date.now() - startTime;
    const result = await response.json();

    console.log('\n📊 Response Status:', response.status);
    console.log('⏱️  Total Time:', `${responseTime}ms`);
    console.log('📈 Response:', JSON.stringify(result, null, 2));

    if (response.ok && result.success) {
      console.log('✅ Build and deploy endpoint test completed successfully!');
      console.log('🌐 App URL:', result.buildUrl);
      console.log(`📤 Uploaded ${result.uploadedFiles?.length || 0} files to S3`);
      console.log('\n💡 Your React Native app should now be live and accessible!');
      
      if (result.buildLog) {
        console.log('\n📝 Build log summary:');
        result.buildLog.forEach((log: any) => {
          const status = log.success ? '✓' : '✗';
          console.log(`   ${status} ${log.step}`);
        });
      }
    } else {
      console.log('❌ Build and deploy endpoint test failed!');
      if (result.error) {
        console.log('💥 Error:', result.error);
      }
      if (result.buildLog) {
        console.log('📝 Build log:');
        result.buildLog.forEach((log: any) => {
          const status = log.success ? '✓' : '✗';
          console.log(`   ${status} ${log.step}: ${log.output || log.error}`);
        });
      }
    }

  } catch (error) {
    console.error('💥 Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
testBuildAndDeployEndpoint().catch(console.error);