import AWS from 'aws-sdk';
import fastifyLib from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

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

const PORT = process.env.PORT || 3002;

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

        const key = `${prototypeId}/${part.filename}`;

        const uploadParams = {
          Bucket: BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: part.mimetype
        };

        const result = await s3.upload(uploadParams).promise();
        uploadedFiles.push({
          filename: part.filename,
          s3Location: result.Location,
          key: result.Key
        });
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

// Build endpoint placeholder
fastify.post('/build', async (request, reply) => {
  const jobId = uuidv4();

  return {
    jobId,
    status: 'received',
    message: 'Build job received and queued'
  };
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