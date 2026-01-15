// Server API types for mobile app
// Simplified from web application types

// Generic API response type
export type APIResponse<TData = unknown, TError = unknown> =
  | { data: TData; error: null }
  | { data: null; error: TError };

// Build status
export type BuildStatus =
  | 'creating'
  | 'chatting'
  | 'updating'
  | 'error'
  | 'stable'
  | 'cleaning'
  | 'building';

// Visibility levels
export type VisibilityLevel = 'PUBLIC' | 'TEAM' | 'SELF';

// Design styles
export type DesignStyle = 'tamagui' | 'nativewind' | 'stylesheets' | 'custom';

// Prototype frameworks
export type PrototypeFramework = 'mobile_expo_react_native' | 'web_nextjs_react';

// Standard error response
export interface StandardErrorResponse {
  error: string;
  message: string;
}

// Credit limits
export const CreditLimits = Object.freeze({
  FREE: 15,
  PLUS: 100,
  TEAM: 140,
  PRO: 250,
  MAX: 1000,
});

// Prototype creation
export const PROTOTYPE_CREATION_SOURCES = [
  'landing_prompt',
  'dashboard_prompt',
  'dashboard_modal',
  'public_prototype_clone',
  'prototype_editor_clone',
  'auth_callback_chat_intent',
  'unknown',
] as const;

export type PrototypeCreationSource = (typeof PROTOTYPE_CREATION_SOURCES)[number];

export interface CreatePrototypeRequestBody {
  name: string;
  creation_source: PrototypeCreationSource;
  description?: string;
  team_id: string;
  folder_id?: string;
  prototype_id?: string;
  visibility?: VisibilityLevel;
  design_style?: DesignStyle;
  custom_design_system?: string | null;
  framework?: PrototypeFramework;
  source_repo_id?: number;
}

export interface CreatePrototypeSuccessResponse {
  prototype_id: string;
  viewing_url: string;
}

export interface CreatePrototypeErrorResponse {
  error:
    | 'UNAUTHORIZED'
    | 'PROTOTYPE_LIMIT_REACHED'
    | 'DATABASE_ERROR'
    | 'S3_ERROR'
    | 'INVALID_REQUEST';
  message: string;
}

// Fetch viewing URL
export interface FetchViewingUrlRequestBody {
  prototype_id: string;
  current_page?: 'view' | 'edit' | null;
}

export interface FetchViewingUrlSuccessResponse {
  viewing_url: string;
  source: 'editable_instance' | 'static_build';
  status: BuildStatus | null;
  terminal_url: string | null;
}

// Delete prototype
export interface DeletePrototypeSuccessResponse {
  success: true;
  message: string;
}

export interface DeletePrototypeErrorResponse {
  success: false;
  error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'DATABASE_ERROR' | 'S3_ERROR';
  message: string;
}

// Dispatch
export interface DispatchRequestBody {
  prototype_id: string;
  file_scope: 'updates' | 'complete';
}

export interface DispatchSuccessResponse {
  viewing_url: string;
  terminal_url: string | null;
}

export interface DispatchPrecheckRequestBody {
  prototype_id: string;
}

export interface DispatchPrecheckSuccessResponse {
  status: BuildStatus | null;
  viewing_url: string;
  terminal_tunnel_hostname: string | null;
}

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  GATEWAY_TIMEOUT: 504,
} as const;

// Type guard
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
