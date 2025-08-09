const fastify = require('fastify')({ logger: true });
const fs = require('fs-extra');
const AWS = require('aws-sdk');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3002;

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
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