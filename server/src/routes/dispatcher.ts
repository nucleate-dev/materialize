import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BuildRequest, WorkerNode, DispatchResponse } from '../types/build';
import { getWorkerConfig } from '../config/workers';
import { buildRequestSchema, workerAddSchema } from '../schemas/build';
import { v4 as uuidv4 } from 'uuid';

// Initialize worker nodes from configuration
const initializeWorkers = (): WorkerNode[] => {
  const config = getWorkerConfig();
  return config.map(workerConfig => ({
    id: uuidv4(),
    endpoint: workerConfig.endpoint,
    isHealthy: false,
    currentBuilds: 0,
    maxConcurrentBuilds: workerConfig.maxConcurrentBuilds,
    lastHealthCheck: new Date()
  }));
};

// In-memory worker pool management (in production, this could be moved to Redis/DB)
const workerNodes: WorkerNode[] = initializeWorkers();

// Health check interval (5 minutes)
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;

export default async function dispatcherRoutes(fastify: FastifyInstance) {
  // Health check for workers
  const performHealthCheck = async (worker: WorkerNode): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${worker.endpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      fastify.log.warn(`Health check failed for worker ${worker.id}: ${error}`);
      return false;
    }
  };

  // Select best available worker
  const selectWorker = async (): Promise<WorkerNode | null> => {
    // Update health status for all workers
    await Promise.all(
      workerNodes.map(async (worker) => {
        const isHealthy = await performHealthCheck(worker);
        worker.isHealthy = isHealthy;
        worker.lastHealthCheck = new Date();
      })
    );

    // Find available healthy worker with lowest load
    const availableWorkers = workerNodes.filter(
      (worker) => worker.isHealthy && worker.currentBuilds < worker.maxConcurrentBuilds
    );

    if (availableWorkers.length === 0) {
      return null;
    }

    // Sort by current load (ascending) and return the least loaded worker
    availableWorkers.sort((a, b) => a.currentBuilds - b.currentBuilds);
    return availableWorkers[0];
  };

  // Dispatcher route
  fastify.post<{
    Body: BuildRequest;
  }>('/dispatcher', {
    schema: {
      body: buildRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            workerId: { type: 'string' },
            buildId: { type: 'string' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: BuildRequest }>, reply: FastifyReply) => {
    const { prototype_id, files } = request.body;

    try {
      // Validate request
      if (!prototype_id) {
        return reply.status(400).send({
          success: false,
          error: 'prototype_id is required'
        });
      }

      if (!files || Object.keys(files).length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'files are required'
        });
      }

      // Select available worker
      const selectedWorker = await selectWorker();
      
      if (!selectedWorker) {
        return reply.status(503).send({
          success: false,
          error: 'No healthy workers available'
        });
      }

      // Generate unique build ID
      const buildId = uuidv4();

      // Increment worker's current build count
      selectedWorker.currentBuilds += 1;

      fastify.log.info(`Dispatching build ${buildId} for prototype ${prototype_id} to worker ${selectedWorker.id}`);

      // Forward build request to selected worker
      try {
        const workerResponse = await fetch(`${selectedWorker.endpoint}/build`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prototype_id,
            files,
            buildId
          }),
        });

        if (!workerResponse.ok) {
          throw new Error(`Worker responded with status ${workerResponse.status}`);
        }

        const workerResult = await workerResponse.json();

        const response: DispatchResponse = {
          success: true,
          workerId: selectedWorker.id,
          buildId,
          message: `Build dispatched successfully to worker ${selectedWorker.id}`
        };

        return reply.send(response);

      } catch (workerError) {
        // Decrement worker's build count on failure
        selectedWorker.currentBuilds = Math.max(0, selectedWorker.currentBuilds - 1);
        
        fastify.log.error(`Failed to dispatch to worker ${selectedWorker.id}: ${workerError}`);
        
        return reply.status(502).send({
          success: false,
          error: `Failed to dispatch build to worker: ${workerError}`
        });
      }

    } catch (error) {
      fastify.log.error(`Dispatcher error: ${error}`);
      return reply.status(500).send({
        success: false,
        error: 'Internal dispatcher error'
      });
    }
  });

  // Get worker status
  fastify.get('/dispatcher/status', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      totalWorkers: workerNodes.length,
      healthyWorkers: workerNodes.filter(w => w.isHealthy).length,
      totalCurrentBuilds: workerNodes.reduce((sum, w) => sum + w.currentBuilds, 0),
      workers: workerNodes.map(worker => ({
        id: worker.id,
        endpoint: worker.endpoint,
        isHealthy: worker.isHealthy,
        currentBuilds: worker.currentBuilds,
        maxConcurrentBuilds: worker.maxConcurrentBuilds,
        lastHealthCheck: worker.lastHealthCheck
      }))
    };
  });

  // Add worker to pool
  fastify.post<{
    Body: { endpoint: string; maxConcurrentBuilds?: number }
  }>('/dispatcher/workers', {
    schema: {
      body: workerAddSchema
    }
  }, async (request, reply) => {
    const { endpoint, maxConcurrentBuilds = 3 } = request.body;
    
    if (!endpoint) {
      return reply.status(400).send({ error: 'endpoint is required' });
    }

    const workerId = uuidv4();
    const newWorker: WorkerNode = {
      id: workerId,
      endpoint,
      isHealthy: false,
      currentBuilds: 0,
      maxConcurrentBuilds,
      lastHealthCheck: new Date()
    };

    // Test health before adding
    newWorker.isHealthy = await performHealthCheck(newWorker);
    workerNodes.push(newWorker);

    fastify.log.info(`Added worker ${workerId} with endpoint ${endpoint}`);
    
    return {
      success: true,
      workerId,
      message: `Worker added successfully`
    };
  });

  // Remove worker from pool
  fastify.delete<{
    Params: { workerId: string }
  }>('/dispatcher/workers/:workerId', async (request, reply) => {
    const { workerId } = request.params;
    
    const workerIndex = workerNodes.findIndex(w => w.id === workerId);
    if (workerIndex === -1) {
      return reply.status(404).send({ error: 'Worker not found' });
    }

    workerNodes.splice(workerIndex, 1);
    fastify.log.info(`Removed worker ${workerId}`);
    
    return {
      success: true,
      message: `Worker ${workerId} removed successfully`
    };
  });
}