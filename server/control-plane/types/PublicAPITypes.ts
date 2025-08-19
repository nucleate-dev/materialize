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
  error: string;
  message: string;
  viewing_url: string;
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

export type CacheClearResponse =
  | CacheClearSuccessResponse
  | StandardErrorResponse;

// ============================================================================
// /payments/manage-billing ENDPOINT
// ============================================================================

export interface ManageBillingRequestBody {
  // No body parameters - user ID comes from JWT
}

export interface ManageBillingSuccessResponse {
  redirect_url: string;
}

export type ManageBillingResponse =
  | ManageBillingSuccessResponse
  | StandardErrorResponse;

// ============================================================================
// HTTP STATUS CODE MAPPINGS
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ============================================================================
// /prototype/fetch-viewing-url ENDPOINT
// ============================================================================

export interface FetchViewingUrlRequestBody {
  prototype_id: string;
  current_page?: 'view' | 'edit' | null;
}

export interface FetchViewingUrlSuccessResponse {
  viewing_url: string;
  source: 'active_instance' | 'static_build';
}

export type FetchViewingUrlResponse =
  | FetchViewingUrlSuccessResponse
  | StandardErrorResponse;

// ============================================================================
// /prototype/create ENDPOINT
// ============================================================================

export interface CreatePrototypeRequestBody {
  name: string;
  description?: string;
  project_id?: string;
  prototype_id?: string; // For forking an existing prototype
  visibility?: 'PUBLIC' | 'SELF';
}

export interface CreatePrototypeSuccessResponse {
  success: true;
  data: {
    prototype_id: string;
    viewing_url: string;
  };
}

export interface CreatePrototypeErrorResponse {
  success: false;
  error: 'UNAUTHORIZED' | 'PROTOTYPE_LIMIT_REACHED' | 'DATABASE_ERROR' | 'S3_ERROR' | 'INVALID_REQUEST';
  message: string;
}

export type CreatePrototypeResponse =
  | CreatePrototypeSuccessResponse
  | CreatePrototypeErrorResponse;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isStandardErrorResponse(
  response: unknown,
): response is StandardErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    'message' in response
  );
}
