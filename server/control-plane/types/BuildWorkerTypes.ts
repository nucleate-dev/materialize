// After making changes to this file, run:
// npm run sync-build-worker-types

export interface BuildLogEntry {
  step: string;
  success: boolean;
  timestamp: string;
  output: string;
  error: string;
}

export interface FileInput {
  path: string;
  content: string;
  isBase64?: boolean;
}

export interface BuildRequest {
  prototypeId: string;
  files: FileInput[];
}

export interface BuildResponse {
  success: boolean;
  buildLog: BuildLogEntry[];
  outputPath?: string;
  error?: string;
}

export interface DeployRequest {
  prototypeId: string;
  buildPath: string;
}

export interface DeployResponse {
  success: boolean;
  buildUrl?: string;
  uploadedFiles?: Array<{ key: string; location: string }>;
  error?: string;
}

export interface BuildAndDeployRequest {
  prototypeId: string;
  files: FileInput[];
}

export interface BuildAndDeployResponse {
  success: boolean;
  buildUrl?: string;
  buildLog: BuildLogEntry[];
  uploadedFiles?: Array<{ key: string; location: string }>;
  error?: string;
}

// New types for public API
export interface CodeError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  type: 'build' | 'runtime' | 'dependency' | 'syntax';
}

export interface CodeWarning {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  type: 'build' | 'deprecation' | 'performance' | 'unused';
}

export interface PublicDevServerStartRequest {
  prototype_id: string;
  framework: 'expo_react_native' | 'react';
  files: FileInput[]; // Changed to support binary files with isBase64 flag
  file_scope: 'updates' | 'complete';
}

export interface PublicDevServerStartResponse {
  status: 'success' | 'error';
  tunnel_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}

export interface PublicDevServerStopRequest {
  prototype_id: string;
  s3_scoped_token?: string;
}

export interface PublicDevServerStopResponse {
  status: 'success' | 'error';
  build_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}

export interface PublicBuildAndDeployRequest {
  prototype_id: string;
  framework: 'expo_react_native' | 'react';
  files: FileInput[];
}

export interface PublicBuildAndDeployResponse {
  status: 'success' | 'error';
  build_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}
