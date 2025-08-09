import fastifyLib from 'fastify';
import fs from 'fs-extra';
import AWS from 'aws-sdk';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';

const fastify = fastifyLib({ logger: true });

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