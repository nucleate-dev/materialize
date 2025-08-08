export interface PrototypeFile {
  path: string;
  content: string;
}

export interface PrototypeFiles {
  [key: string]: PrototypeFile;
}

export interface BuildRequest {
  prototype_id: string;
  files: PrototypeFiles;
}

export interface WorkerNode {
  id: string;
  endpoint: string;
  isHealthy: boolean;
  currentBuilds: number;
  maxConcurrentBuilds: number;
  lastHealthCheck: Date;
}

export interface BuildResponse {
  success: boolean;
  prototype_id: string;
  buildId?: string;
  message?: string;
  error?: string;
  buildOutput?: string;
}

export interface DispatchResponse {
  success: boolean;
  workerId: string;
  buildId: string;
  message?: string;
  error?: string;
}