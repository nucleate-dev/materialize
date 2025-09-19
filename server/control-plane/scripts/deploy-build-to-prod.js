// /control-plane/scripts/deploy-build-to-prod.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const REGION = 'us-east-2';
const BUCKET = 'materialize-control-plane';
const KEY = 'dist/control-plane-dist.zip';

async function main() {
  const projectRoot = process.cwd();
  const distDir = path.join(projectRoot, 'dist');
  const infraSrc = path.join(projectRoot, 'infra', 'ec2');
  const infraDest = path.join(distDir, 'infra', 'ec2');
  const outZip = path.join(projectRoot, 'control-plane-dist.zip');

  console.log('🚀 Building project...');
  execSync('npm run build', {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  console.log('📂 Copying infra scripts into dist...');
  fs.mkdirSync(infraDest, { recursive: true });
  execSync(`cp -R ${infraSrc}/* ${infraDest}`, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  console.log('📦 Creating zip archive...');
  await zipBundle({ distDir, projectRoot, outPath: outZip });

  console.log('☁️ Uploading to S3...');
  const client = new S3Client({ region: REGION });
  const body = fs.createReadStream(outZip);

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: body,
      ContentType: 'application/zip',
    }),
  );

  console.log(`✅ Successfully uploaded to s3://${BUCKET}/${KEY}`);
}

// Utility to zip dist + package.json
async function zipBundle({ distDir, projectRoot, outPath }) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    // Include compiled code + infra scripts
    archive.directory(distDir, 'dist');

    // Include package.json
    archive.file(path.join(projectRoot, 'package.json'), {
      name: 'package.json',
    });

    archive.finalize();
  });
}

main().catch((err) => {
  console.error('❌ Deployment failed:', err);
  process.exit(1);
});
