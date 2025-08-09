import AWS from 'aws-sdk';
import fastifyLib from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import unzipper from 'unzipper';

dotenv.config();

const fastify = fastifyLib({ logger: true });

// Register multipart plugin
await fastify.register(import('@fastify/multipart'));

// Configure AWS S3
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();
const BUCKET_NAME = 'materialize-sites';
const execAsync = promisify(exec);

const PORT = process.env.PORT || 3002;


// Utility function to build the project using Expo export
async function buildProject(projectPath, prototypeId) {
  const tempDir = path.join('/tmp', `build-${prototypeId}`);

  try {
    // Ensure directories exist
    await fs.ensureDir(tempDir);

    // Copy project files to temp directory
    await fs.copy(projectPath, tempDir);

    // Install dependencies
    console.log(`Installing dependencies for build ${prototypeId}...`);
    await execAsync('npm install', { cwd: tempDir });

    // Install Expo CLI globally if not present (in temp environment)
    console.log('Installing Expo CLI...');
    await execAsync('npm install -g @expo/cli', { cwd: tempDir });

    // Run Expo export for web platform
    console.log(`Building Expo project for web platform...`);
    await execAsync('npx expo export --platform web', { cwd: tempDir });

    // The Expo export creates a 'dist' folder by default
    const expoDistPath = path.join(tempDir, 'dist');
    
    // Verify the dist folder was created
    if (!(await fs.pathExists(expoDistPath))) {
      throw new Error('Expo export did not create dist folder');
    }

    console.log(`Expo build completed successfully for ${prototypeId}`);
    return expoDistPath;

  } catch (error) {
    console.error(`Build error for ${prototypeId}:`, error.message);
    // Cleanup on error
    await fs.remove(tempDir);
    throw error;
  }
}

// Utility function to upload directory to S3
async function uploadDirectoryToS3(localPath, s3KeyPrefix) {
  const files = await fs.readdir(localPath, { withFileTypes: true });
  const uploadPromises = [];

  for (const file of files) {
    const localFilePath = path.join(localPath, file.name);
    
    if (file.isDirectory()) {
      const subDirUploads = await uploadDirectoryToS3(localFilePath, `${s3KeyPrefix}/${file.name}`);
      uploadPromises.push(...subDirUploads);
    } else {
      const fileBuffer = await fs.readFile(localFilePath);
      const s3Key = `${s3KeyPrefix}/${file.name}`;
      
      const uploadPromise = s3.upload({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: getContentType(file.name)
      }).promise();
      
      uploadPromises.push(uploadPromise);
    }
  }

  return Promise.all(uploadPromises);
}

// Helper function to determine content type
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

// Helper function to extract zip file and upload contents to S3
async function extractAndUploadZip(zipBuffer, prototypeId) {
  const tempDir = path.join('/tmp', `extract-${uuidv4()}`);
  const zipPath = path.join(tempDir, 'upload.zip');
  
  console.log(`Extracting zip file to ${tempDir}`);
  console.log(`Zip buffer size: ${zipBuffer.length} bytes`);
  
  try {
    await fs.ensureDir(tempDir);
    await fs.writeFile(zipPath, zipBuffer);
    
    const extractDir = path.join(tempDir, 'extracted');
    await fs.ensureDir(extractDir);
    
    console.log(`Created extract directory: ${extractDir}`);
    
    // Extract zip file
    await new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractDir }))
        .on('close', () => {
          console.log('Zip extraction completed');
          resolve();
        })
        .on('error', (error) => {
          console.error('Zip extraction error:', error);
          reject(error);
        });
    });
    
    // Check what was extracted
    const extractedContents = await fs.readdir(extractDir, { withFileTypes: true });
    console.log(`Extracted ${extractedContents.length} items:`, extractedContents.map(f => f.name));
    
    // Upload all extracted files to S3
    const uploadedFiles = [];
    await uploadExtractedFiles(extractDir, '', prototypeId, uploadedFiles);
    
    console.log(`Successfully uploaded ${uploadedFiles.length} files to S3`);
    
    // Cleanup
    await fs.remove(tempDir);
    
    return uploadedFiles;
  } catch (error) {
    console.error('extractAndUploadZip error:', error);
    await fs.remove(tempDir);
    throw error;
  }
}

// Recursive function to upload extracted files maintaining directory structure
async function uploadExtractedFiles(dirPath, relativePath, prototypeId, uploadedFiles) {
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  console.log(`Processing ${files.length} items in ${dirPath}`);
  
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    const currentRelativePath = relativePath ? path.join(relativePath, file.name) : file.name;
    
    if (file.isDirectory()) {
      console.log(`  Directory: ${currentRelativePath}`);
      await uploadExtractedFiles(fullPath, currentRelativePath, prototypeId, uploadedFiles);
    } else {
      console.log(`  Uploading file: ${currentRelativePath}`);
      try {
        const fileBuffer = await fs.readFile(fullPath);
        const key = `${prototypeId}/${currentRelativePath}`;
        
        const uploadParams = {
          Bucket: BUCKET_NAME,
          Key: key,
          Body: fileBuffer,
          ContentType: getContentType(file.name)
        };
        
        const result = await s3.upload(uploadParams).promise();
        uploadedFiles.push({
          filename: currentRelativePath,
          s3Location: result.Location,
          key: result.Key
        });
        console.log(`    ✓ Uploaded: ${key}`);
      } catch (error) {
        console.error(`    ✗ Failed to upload ${currentRelativePath}:`, error.message);
        throw error;
      }
    }
  }
}

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// File upload endpoint
fastify.post('/upload', async (request, reply) => {
  try {
    const uploadedFiles = [];
    let prototypeId = null;

    // Handle multiple files and form fields
    const parts = request.parts();

    for await (const part of parts) {
      if (part.file) {
        // This is a file part
        const buffer = await part.toBuffer();

        if (!prototypeId) {
          return reply.code(400).send({
            error: 'prototypeId must be provided before file uploads'
          });
        }

        // Check if this is a zip file
        if (part.mimetype === 'application/zip' || (part.filename && part.filename.toLowerCase().endsWith('.zip'))) {
          fastify.log.info(`Processing zip file: ${part.filename || 'unknown'}`);
          
          // Extract zip and upload all contents
          const extractedFiles = await extractAndUploadZip(buffer, prototypeId);
          uploadedFiles.push(...extractedFiles);
          
          fastify.log.info(`Extracted and uploaded ${extractedFiles.length} files from ${part.filename || 'zip file'}`);
        } else {
          // Handle individual file upload
          const filename = part.filename || 'unnamed-file';
          const key = `${prototypeId}/${filename}`;

          const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: part.mimetype
          };

          const result = await s3.upload(uploadParams).promise();
          uploadedFiles.push({
            filename: filename,
            s3Location: result.Location,
            key: result.Key
          });
        }
      } else if (part.fieldname === 'prototypeId') {
        // This is the prototypeId field
        prototypeId = part.value;
      }
    }

    if (!prototypeId) {
      return reply.code(400).send({ error: 'prototypeId is required' });
    }

    if (uploadedFiles.length === 0) {
      return reply.code(400).send({ error: 'No files provided' });
    }

    return {
      prototypeId,
      uploadedFiles,
      message: `Successfully uploaded ${uploadedFiles.length} files to S3`
    };

  } catch (error) {
    fastify.log.error('Upload error:', error);
    return reply.code(500).send({
      error: 'Failed to upload files to S3',
      details: error.message
    });
  }
});

// Build endpoint - downloads files from S3, builds them, uploads result
fastify.post('/build', async (request, reply) => {
  const jobId = uuidv4();
  const { prototypeId } = request.body;

  if (!prototypeId) {
    return reply.code(400).send({ error: 'prototypeId is required' });
  }

  try {
    // Create temporary directory for this build
    const tempProjectPath = path.join('/tmp', `project-${jobId}`);
    await fs.ensureDir(tempProjectPath);

    fastify.log.info(`Starting build for prototype ${prototypeId}, job ${jobId}`);

    // Download files from S3 to temporary directory
    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: `${prototypeId}/`
    };

    const objects = await s3.listObjectsV2(listParams).promise();
    
    if (!objects.Contents || objects.Contents.length === 0) {
      await fs.remove(tempProjectPath);
      return reply.code(404).send({ 
        error: `No files found for prototype ${prototypeId}` 
      });
    }

    // Download each file
    const downloadPromises = objects.Contents.map(async (object) => {
      const downloadParams = {
        Bucket: BUCKET_NAME,
        Key: object.Key
      };
      
      const data = await s3.getObject(downloadParams).promise();
      const relativePath = object.Key.replace(`${prototypeId}/`, '');
      const localPath = path.join(tempProjectPath, relativePath);
      
      await fs.ensureDir(path.dirname(localPath));
      await fs.writeFile(localPath, data.Body);
    });

    await Promise.all(downloadPromises);

    fastify.log.info(`Downloaded ${objects.Contents.length} files for build ${jobId}`);

    // Build the project
    const outputPath = await buildProject(tempProjectPath, prototypeId);

    fastify.log.info(`Build completed successfully for job ${jobId}`);

    // Upload build output to S3
    const buildS3Prefix = `${prototypeId}/dist`;
    const uploadResults = await uploadDirectoryToS3(outputPath, buildS3Prefix);

    fastify.log.info(`Uploaded ${uploadResults.length} built files for job ${jobId}`);

    // Cleanup temporary files
    await fs.remove(tempProjectPath);
    await fs.remove(path.dirname(outputPath)); // Remove the entire temp build directory

    return {
      jobId,
      prototypeId,
      status: 'completed',
      message: `Build completed successfully. ${uploadResults.length} files uploaded to S3.`,
      buildUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${buildS3Prefix}/index.html`,
      uploadedFiles: uploadResults.map(result => ({
        key: result.Key,
        location: result.Location
      }))
    };

  } catch (error) {
    fastify.log.error(`Build failed for job ${jobId}:`, error);
    
    // Cleanup on error
    try {
      const tempProjectPath = path.join('/tmp', `project-${jobId}`);
      await fs.remove(tempProjectPath);
    } catch (cleanupError) {
      fastify.log.error('Cleanup failed:', cleanupError);
    }

    return reply.code(500).send({
      jobId,
      prototypeId,
      status: 'failed',
      error: 'Build failed',
      details: error.message
    });
  }
});

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Build worker server listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();