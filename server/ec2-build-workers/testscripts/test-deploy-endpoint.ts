// Handle --local flag
const isLocal = process.argv.includes('--local');
const SERVER_URL = process.env.SERVER_URL || (isLocal ? 'http://localhost:3002' : 'http://localhost:3002');
const BUILD_PATH = process.env.BUILD_PATH;
const PROTOTYPE_ID = `test-deploy-${Date.now()}`;

async function testDeployEndpoint() {
  console.log('🧪 Testing /deploy endpoint...');
  console.log('📋 Server URL:', SERVER_URL);
  console.log('🆔 Prototype ID:', PROTOTYPE_ID);
  console.log('📁 Build Path:', BUILD_PATH);
  console.log('🏠 Local mode:', isLocal ? 'ON' : 'OFF');

  if (!BUILD_PATH) {
    console.error('❌ Error: BUILD_PATH environment variable must be set');
    console.error('💡 Example: BUILD_PATH=/tmp/some-build-output ts-node test-deploy-endpoint.ts');
    console.error('💡 Or run the build endpoint first and use its outputPath');
    process.exit(1);
  }

  try {
    // Check if build path exists
    const fs = await import('fs/promises');
    try {
      const stats = await fs.stat(BUILD_PATH);
      if (!stats.isDirectory()) {
        throw new Error('BUILD_PATH must be a directory');
      }
    } catch (error) {
      console.error(`❌ Build path does not exist or is not accessible: ${BUILD_PATH}`);
      process.exit(1);
    }

    // List contents of build directory
    console.log('📂 Contents of build directory:');
    const contents = await fs.readdir(BUILD_PATH);
    contents.forEach(item => console.log(`   - ${item}`));

    // Make request to deploy endpoint
    console.log('\n🚀 Sending deploy request...');
    const startTime = Date.now();
    
    const response = await fetch(`${SERVER_URL}/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prototypeId: PROTOTYPE_ID,
        buildPath: BUILD_PATH
      })
    });

    const responseTime = Date.now() - startTime;
    const result = await response.json();

    console.log('\n📊 Response Status:', response.status);
    console.log('⏱️  Total Time:', `${responseTime}ms`);
    console.log('📈 Response:', JSON.stringify(result, null, 2));

    if (response.ok && result.success) {
      console.log('✅ Deploy endpoint test completed successfully!');
      console.log('🌐 App URL:', result.buildUrl);
      console.log(`📤 Uploaded ${result.uploadedFiles?.length || 0} files to S3`);
    } else {
      console.log('❌ Deploy endpoint test failed!');
      if (result.error) {
        console.log('💥 Error:', result.error);
      }
    }

  } catch (error) {
    console.error('💥 Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
testDeployEndpoint().catch(console.error);