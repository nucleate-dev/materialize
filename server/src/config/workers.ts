export interface WorkerConfig {
  endpoint: string;
  maxConcurrentBuilds: number;
}

// Worker pool configuration - modify these endpoints based on your EC2 instances
export const defaultWorkerConfig: WorkerConfig[] = [
  // Add your EC2 worker instances here
  // Example:
  // {
  //   endpoint: 'http://ec2-worker-1.amazonaws.com:3001',
  //   maxConcurrentBuilds: 3
  // },
  // {
  //   endpoint: 'http://ec2-worker-2.amazonaws.com:3001', 
  //   maxConcurrentBuilds: 3
  // }
];

// Environment-based worker configuration
export const getWorkerConfig = (): WorkerConfig[] => {
  // Check if workers are defined via environment variables
  const workersEnv = process.env.WORKER_ENDPOINTS;
  
  if (workersEnv) {
    try {
      const workers = workersEnv.split(',').map(endpoint => ({
        endpoint: endpoint.trim(),
        maxConcurrentBuilds: parseInt(process.env.MAX_CONCURRENT_BUILDS || '3')
      }));
      return workers;
    } catch (error) {
      console.warn('Failed to parse WORKER_ENDPOINTS from environment, using default config');
    }
  }
  
  return defaultWorkerConfig;
};