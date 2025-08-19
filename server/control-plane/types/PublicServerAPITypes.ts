// Public API types for the Control Plane Server
// These types define the request and response schemas for all public endpoints

// ============================================================================
// COMMON TYPES
// ============================================================================

export interface FileInput {
  path: string;
  content: string;
  isBase64?: boolean;
}

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

// ============================================================================
// STANDARD ERROR RESPONSE
// ============================================================================

export interface StandardErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// /health ENDPOINT
// ============================================================================

export interface HealthSuccessResponse {
  status: 'healthy';
  timestamp: string;
}

export type HealthResponse = HealthSuccessResponse | StandardErrorResponse;

// ============================================================================
// /dispatch ENDPOINT
// ============================================================================

export interface DispatchRequestBody {
  jwt: string;
  prototype_id: string;
  framework?: 'expo_react_native' | 'react';
  files: FileInput[];
  file_scope: 'updates' | 'complete';
  hot_reload?: boolean;
}

export interface DispatchSuccessResponse {
  status: 'success';
  viewing_url: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}

export interface DispatchErrorResponse {
  status: 'error';
  viewing_url: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
  error_message: string;
}

export type DispatchResponse =
  | DispatchSuccessResponse
  | DispatchErrorResponse
  | StandardErrorResponse;

// ============================================================================
// /dispatch-precheck ENDPOINT
// ============================================================================

export interface DispatchPrecheckRequestBody {
  jwt: string;
  prototype_id: string;
}

export interface DispatchPrecheckSuccessResponse {
  success: true;
  state: 'dne' | 'active_dev_server' | 'active_build';
  status: 'updating' | 'error' | 'stable' | 'creating' | 'cleaning' | null;
  viewing_url: string;
}

export type DispatchPrecheckResponse =
  | DispatchPrecheckSuccessResponse
  | StandardErrorResponse;

// ============================================================================
// /cache/clear ENDPOINT
// ============================================================================

export interface CacheClearSuccessResponse {
  success: true;
  message: string;
  timestamp: string;
}

export type CacheClearResponse = CacheClearSuccessResponse | StandardErrorResponse;

// ============================================================================
// HTTP STATUS CODE MAPPINGS
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isStandardErrorResponse(
  response: any,
): response is StandardErrorResponse {
  return 'error' in response && 'message' in response;
}

export function isDispatchSuccessResponse(
  response: DispatchResponse,
): response is DispatchSuccessResponse {
  return 'status' in response && response.status === 'success';
}

export function isDispatchErrorResponse(
  response: DispatchResponse,
): response is DispatchErrorResponse {
  return 'status' in response && response.status === 'error';
}

export function isHealthSuccessResponse(
  response: HealthResponse,
): response is HealthSuccessResponse {
  return 'status' in response && response.status === 'healthy';
}

export function isPrecheckSuccessResponse(
  response: DispatchPrecheckResponse,
): response is DispatchPrecheckSuccessResponse {
  return 'success' in response && response.success === true;
}

export function isCacheClearSuccessResponse(
  response: CacheClearResponse,
): response is CacheClearSuccessResponse {
  return 'success' in response && response.success === true;
}
