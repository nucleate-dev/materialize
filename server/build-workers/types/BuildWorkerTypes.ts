import { Database } from "./supabase.js";

export type PrototypeFileInput =
  Database["public"]["Tables"]["prototype_files"]["Row"];
export type PrototypeAssetInput =
  Database["public"]["Tables"]["prototype_assets"]["Row"];
export type PrototypeAssetInputWithContent = PrototypeAssetInput & {
  contents: string;
};

// Operation Status Enum
export enum OperationStatus {
  IDLE = "idle",
  STARTING_DEV_SERVER = "starting_dev_server",
  UPDATING_FILES = "updating_files",
  BUILDING = "building",
  DEPLOYING = "deploying",
  BUILDING_AND_DEPLOYING = "building_and_deploying",
  STOPPING = "stopping",
}

// Dev Server Status Enum
export enum DevServerStatus {
  STOPPED = "stopped",
  STARTING = "starting",
  RUNNING = "running",
  ERROR = "error",
}

export interface BuildLogEntry {
  step: string;
  success: boolean;
  timestamp: string;
  output: string;
  error: string;
}

export interface BuildRequest {
  prototype_id: string;
  files: PrototypeFileInput[];
  assets: PrototypeAssetInputWithContent[];
}

export interface BuildResponse {
  success: boolean;
  buildLog: BuildLogEntry[];
  outputPath?: string;
  error?: string;
}

export interface DeployRequest {
  prototype_id: string;
  buildPath: string;
}

export interface DeployResponse {
  success: boolean;
  buildUrl?: string;
  uploadedFiles?: Array<{ key: string; location: string }>;
  error?: string;
}

export interface BuildAndDeployRequest {
  prototype_id: string;
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
  type: "build" | "runtime" | "dependency" | "syntax";
}

export interface CodeWarning {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  type: "build" | "deprecation" | "performance" | "unused";
}

export interface PublicDevServerStartRequest {
  prototype_id: string;
  framework: "expo_react_native" | "react";
  files: PrototypeFileInput[];
  assets: PrototypeAssetInputWithContent[];
  deleted_files?: string[];
  file_scope: "updates" | "complete";
}

export interface PublicDevServerStartResponse {
  status: "success" | "error";
  tunnel_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}

export interface PublicDevServerStopRequest {
  prototype_id?: string;
  s3_scoped_token?: string;
}

export interface PublicDevServerStopResponse {
  status: "success" | "error";
  build_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
  server_operation_status: OperationStatus;
  server_status: DevServerStatus;
  screenshotBase64?: string;
  prototypeId?: string;
}

export interface PublicBuildAndDeployRequest {
  prototype_id: string;
  framework: "expo_react_native" | "react";
}

export interface PublicBuildAndDeployResponse {
  status: "success" | "error";
  build_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}

// Dev Server Response Types
export interface DevServerStartResponse {
  success: boolean;
  tunnelUrl?: string;
  port?: number;
  status: DevServerStatus;
  error?: string;
  build_errors?: CodeError[];
  build_warnings?: CodeWarning[];
}

export interface DevServerStatusResponse {
  status: DevServerStatus;
  tunnelUrl?: string;
  port?: number;
  uptime?: number;
  prototypeId?: string;
  currentOperation?: OperationStatus;
  operationDuration?: number;
  operationId?: string;
  screenshotBase64?: string;
  screenshotTimestamp?: string;
  screenshotError?: string;
}

export interface DevServerStopResponse {
  success: boolean;
  message: string;
}

export interface DevServerRestartResponse {
  success: boolean;
  tunnelUrl?: string;
  message: string;
}

export interface PublicRunCommandRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
}

export interface PublicRunCommandResponse {
  status: "success" | "error";
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  error?: string;
}
