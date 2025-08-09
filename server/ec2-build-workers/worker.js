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
const PROTOTYPES_DIR = process.env.PROTOTYPES_DIR || './prototypes';


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
  const uploadResults = [];
  const failedUploads = [];

  for (const file of files) {
    const localFilePath = path.join(localPath, file.name);
    
    if (file.isDirectory()) {
      try {
        const subDirResults = await uploadDirectoryToS3(localFilePath, `${s3KeyPrefix}/${file.name}`);
        uploadResults.push(...subDirResults);
      } catch (error) {
        if (error.failedUploads) {
          failedUploads.push(...error.failedUploads);
        } else {
          failedUploads.push({
            path: localFilePath,
            error: error.message
          });
        }
      }
    } else {
      try {
        const fileBuffer = await fs.readFile(localFilePath);
        const s3Key = `${s3KeyPrefix}/${file.name}`;
        
        const result = await s3.upload({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: getContentType(file.name)
        }).promise();
        
        uploadResults.push(result);
      } catch (error) {
        console.error(`Failed to upload ${localFilePath} to S3:`, error.message);
        failedUploads.push({
          path: localFilePath,
          key: `${s3KeyPrefix}/${file.name}`,
          error: error.message
        });
      }
    }
  }

  if (failedUploads.length > 0) {
    const errorMessage = `Failed to upload ${failedUploads.length} files to S3`;
    const error = new Error(errorMessage);
    error.failedUploads = failedUploads;
    error.successfulUploads = uploadResults;
    throw error;
  }

  return uploadResults;
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

// Helper function to extract zip file for direct building (no S3 upload)
async function extractZipForBuilding(zipBuffer, prototypeId, writeToDisk = false) {
  const tempDir = path.join('/tmp', `extract-build-${uuidv4()}`);
  const zipPath = path.join(tempDir, 'upload.zip');
  
  console.log(`Extracting zip file for building to ${tempDir}`);
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
    
    // Save to disk if requested (source files)
    if (writeToDisk) {
      const savedFiles = [];
      await saveFilesToDisk(extractDir, '', prototypeId, savedFiles);
      console.log(`Successfully saved ${savedFiles.length} source files to local disk`);
    }
    
    // Return the extraction directory for building
    return { extractDir, tempDir };
  } catch (error) {
    console.error('extractZipForBuilding error:', error);
    await fs.remove(tempDir);
    throw error;
  }
}

// Helper function to extract zip file and upload contents to S3
async function extractAndUploadZip(zipBuffer, prototypeId, writeToDisk = false) {
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
    
    // Save to disk if requested
    if (writeToDisk) {
      const savedFiles = [];
      await saveFilesToDisk(extractDir, '', prototypeId, savedFiles);
      console.log(`Successfully saved ${savedFiles.length} files to local disk`);
      
      // Add local paths to uploaded files info
      for (let i = 0; i < uploadedFiles.length && i < savedFiles.length; i++) {
        uploadedFiles[i].localPath = savedFiles[i].localPath;
      }
    }
    
    // Cleanup
    await fs.remove(tempDir);
    
    return uploadedFiles;
  } catch (error) {
    console.error('extractAndUploadZip error:', error);
    await fs.remove(tempDir);
    throw error;
  }
}

// Utility function to save files to local disk
async function saveFilesToDisk(dirPath, relativePath, prototypeId, savedFiles) {
  const prototypesDir = path.resolve(PROTOTYPES_DIR, prototypeId, 'files');
  await fs.ensureDir(prototypesDir);
  
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    const currentRelativePath = relativePath ? path.join(relativePath, file.name) : file.name;
    
    if (file.isDirectory()) {
      await saveFilesToDisk(fullPath, currentRelativePath, prototypeId, savedFiles);
    } else {
      const localSavePath = path.join(prototypesDir, currentRelativePath);
      await fs.ensureDir(path.dirname(localSavePath));
      await fs.copy(fullPath, localSavePath);
      
      savedFiles.push({
        filename: currentRelativePath,
        localPath: localSavePath
      });
    }
  }
}

// Recursive function to upload extracted files maintaining directory structure
async function uploadExtractedFiles(dirPath, relativePath, prototypeId, uploadedFiles, failedFiles = []) {
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  console.log(`Processing ${files.length} items in ${dirPath}`);
  
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    const currentRelativePath = relativePath ? path.join(relativePath, file.name) : file.name;
    
    if (file.isDirectory()) {
      console.log(`  Directory: ${currentRelativePath}`);
      await uploadExtractedFiles(fullPath, currentRelativePath, prototypeId, uploadedFiles, failedFiles);
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
        failedFiles.push({
          filename: currentRelativePath,
          error: error.message
        });
      }
    }
  }
  
  if (failedFiles.length > 0) {
    const errorMessage = `Failed to upload ${failedFiles.length} files: ${failedFiles.map(f => f.filename).join(', ')}`;
    const error = new Error(errorMessage);
    error.failedFiles = failedFiles;
    throw error;
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
    let writeToDisk = false;

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
          try {
            const extractedFiles = await extractAndUploadZip(buffer, prototypeId, writeToDisk);
            uploadedFiles.push(...extractedFiles);
          } catch (error) {
            // If there are failed files but some succeeded, include partial results
            if (error.failedFiles) {
              return reply.code(207).send({
                prototypeId,
                uploadedFiles,
                partialSuccess: true,
                error: 'Some files failed to upload to S3',
                failedFiles: error.failedFiles,
                message: `Partially successful: ${uploadedFiles.length} files uploaded, ${error.failedFiles.length} failed`
              });
            }
            throw error;
          }
          
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

          let result;
          try {
            result = await s3.upload(uploadParams).promise();
          } catch (error) {
            fastify.log.error(`Failed to upload individual file ${filename} to S3:`, error.message);
            return reply.code(500).send({
              error: 'Failed to upload file to S3',
              filename: filename,
              details: error.message
            });
          }
          
          const fileInfo = {
            filename: filename,
            s3Location: result.Location,
            key: result.Key
          };
          
          // Save to disk if requested
          if (writeToDisk) {
            const localPath = path.resolve(PROTOTYPES_DIR, prototypeId, 'files', filename);
            await fs.ensureDir(path.dirname(localPath));
            await fs.writeFile(localPath, buffer);
            fileInfo.localPath = localPath;
          }
          
          uploadedFiles.push(fileInfo);
        }
      } else if (part.fieldname === 'prototypeId') {
        // This is the prototypeId field
        prototypeId = part.value;
      } else if (part.fieldname === 'write_to_disk') {
        // This is the write_to_disk field
        writeToDisk = part.value === 'true' || part.value === true;
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
  const { prototypeId, write_to_disk = false } = request.body;

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
    let uploadResults;
    try {
      uploadResults = await uploadDirectoryToS3(outputPath, buildS3Prefix);
    } catch (error) {
      fastify.log.error(`S3 upload failed for job ${jobId}:`, error);
      
      // If there were some successful uploads, include them in the response
      if (error.successfulUploads && error.successfulUploads.length > 0) {
        return reply.code(207).send({
          jobId,
          prototypeId,
          status: 'partial_success',
          error: 'Some files failed to upload to S3',
          failedUploads: error.failedUploads,
          uploadedFiles: error.successfulUploads.map(result => ({
            key: result.Key,
            location: result.Location
          })),
          message: `Build completed but S3 upload partially failed: ${error.successfulUploads.length} files uploaded, ${error.failedUploads.length} failed`,
          buildUrl: error.successfulUploads.some(f => f.Key.endsWith('index.html')) 
            ? `https://${BUCKET_NAME}.s3.amazonaws.com/${buildS3Prefix}/index.html` 
            : null
        });
      }
      
      // Complete failure
      throw new Error(`S3 upload failed: ${error.message}`);
    }

    fastify.log.info(`Uploaded ${uploadResults.length} built files for job ${jobId}`);
    
    // Save build output to disk if requested
    let localBuildPath = null;
    if (write_to_disk) {
      localBuildPath = path.resolve(PROTOTYPES_DIR, prototypeId, 'build');
      await fs.ensureDir(localBuildPath);
      await fs.copy(outputPath, localBuildPath);
      fastify.log.info(`Saved build output to local disk: ${localBuildPath}`);
    }

    // Cleanup temporary files
    await fs.remove(tempProjectPath);
    await fs.remove(path.dirname(outputPath)); // Remove the entire temp build directory

    const response = {
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
    
    if (write_to_disk && localBuildPath) {
      response.localBuildPath = localBuildPath;
      response.localBuildUrl = `file://${localBuildPath}/index.html`;
    }
    
    return response;

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

// Build and deploy endpoint - takes files, builds them, uploads only built files to S3
fastify.post('/build-and-deploy', async (request, reply) => {
  const jobId = uuidv4();
  let prototypeId = null;
  let writeToDisk = false;
  let projectDir = null;
  let tempDir = null;

  try {
    fastify.log.info(`Starting build-and-deploy job ${jobId}`);
    const parts = request.parts();

    for await (const part of parts) {
      if (part.file) {
        if (!prototypeId) {
          return reply.code(400).send({
            error: 'prototypeId must be provided before file uploads'
          });
        }

        const buffer = await part.toBuffer();

        // Check if this is a zip file
        const filename = part.filename || 'unknown';
        const mimetype = part.mimetype || '';
        const isZip = mimetype === 'application/zip' || filename.toLowerCase().endsWith('.zip');
        
        if (isZip) {
          fastify.log.info(`Processing zip file for build-and-deploy: ${filename}`);
          
          // Extract zip for building (no S3 upload)
          const { extractDir, tempDir: extractTempDir } = await extractZipForBuilding(buffer, prototypeId, writeToDisk);
          projectDir = extractDir;
          tempDir = extractTempDir;
          
          fastify.log.info(`Extracted project files for building`);
          break; // Only process first zip file
        } else {
          return reply.code(400).send({
            error: 'build-and-deploy endpoint only supports zip files'
          });
        }
      } else if (part.fieldname === 'prototypeId') {
        prototypeId = part.value;
      } else if (part.fieldname === 'write_to_disk') {
        writeToDisk = part.value === 'true' || part.value === true;
      }
    }

    if (!prototypeId) {
      return reply.code(400).send({ error: 'prototypeId is required' });
    }

    if (!projectDir) {
      return reply.code(400).send({ error: 'No valid zip file provided' });
    }

    fastify.log.info(`Starting build-and-deploy for prototype ${prototypeId}, job ${jobId}`);

    // Build the project directly from extracted files
    const outputPath = await buildProject(projectDir, prototypeId);

    fastify.log.info(`Build completed successfully for job ${jobId}`);
    fastify.log.info(`Build output path: ${outputPath}`);
    
    // Check what files were built
    const builtFiles = await fs.readdir(outputPath, { withFileTypes: true });
    fastify.log.info(`Built files found: ${builtFiles.map(f => f.name).join(', ')}`);

    // Upload only the built files to S3
    const buildS3Prefix = `${prototypeId}/dist`;
    fastify.log.info(`Starting S3 upload with prefix: ${buildS3Prefix}`);
    let uploadResults;
    try {
      uploadResults = await uploadDirectoryToS3(outputPath, buildS3Prefix);
    } catch (error) {
      fastify.log.error(`S3 upload failed for build-and-deploy job ${jobId}:`, error);
      
      // If there were some successful uploads, include them in the response
      if (error.successfulUploads && error.successfulUploads.length > 0) {
        return reply.code(207).send({
          jobId,
          prototypeId,
          status: 'partial_success',
          error: 'Some files failed to upload to S3',
          failedUploads: error.failedUploads,
          uploadedFiles: error.successfulUploads.map(result => ({
            key: result.Key,
            location: result.Location
          })),
          message: `Build completed but S3 upload partially failed: ${error.successfulUploads.length} files uploaded, ${error.failedUploads.length} failed`,
          buildUrl: error.successfulUploads.some(f => f.Key.endsWith('index.html')) 
            ? `https://${BUCKET_NAME}.s3.amazonaws.com/${buildS3Prefix}/index.html` 
            : null
        });
      }
      
      // Complete failure
      throw new Error(`S3 upload failed: ${error.message}`);
    }

    fastify.log.info(`Uploaded ${uploadResults.length} built files to S3 for job ${jobId}`);
    if (uploadResults.length > 0) {
      fastify.log.info(`Sample uploaded file: ${uploadResults[0].Key}`);
    }
    
    // Save build output to disk if requested
    let localBuildPath = null;
    if (writeToDisk) {
      localBuildPath = path.resolve(PROTOTYPES_DIR, prototypeId, 'build');
      await fs.ensureDir(localBuildPath);
      await fs.copy(outputPath, localBuildPath);
      fastify.log.info(`Saved build output to local disk: ${localBuildPath}`);
    }

    // Cleanup temporary files
    if (tempDir) {
      await fs.remove(tempDir);
    }
    await fs.remove(path.dirname(outputPath)); // Remove the build temp directory

    const response = {
      jobId,
      prototypeId,
      status: 'completed',
      message: `Build and deploy completed successfully. ${uploadResults.length} files uploaded to S3.`,
      buildUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${buildS3Prefix}/index.html`,
      uploadedFiles: uploadResults.map(result => ({
        key: result.Key,
        location: result.Location
      }))
    };
    
    if (writeToDisk && localBuildPath) {
      response.localBuildPath = localBuildPath;
      response.localBuildUrl = `file://${localBuildPath}/index.html`;
    }
    
    return response;

  } catch (error) {
    fastify.log.error(`Build-and-deploy failed for job ${jobId}:`, error);
    fastify.log.error(`Error stack:`, error.stack);
    
    // Cleanup on error
    try {
      if (tempDir) {
        await fs.remove(tempDir);
      }
    } catch (cleanupError) {
      fastify.log.error('Cleanup failed:', cleanupError);
    }

    return reply.code(500).send({
      jobId,
      prototypeId: prototypeId || 'unknown',
      status: 'failed',
      error: 'Build and deploy failed',
      details: error.message,
      stack: error.stack
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