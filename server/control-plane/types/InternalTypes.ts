import type { User } from '@supabase/supabase-js';
import type { Database } from './supabase.js';
import type { FileInput, CodeError, CodeWarning } from './PublicAPITypes.js';

// ============================================================================
// CORE DOMAIN TYPES
// ============================================================================

export type BuildStatus =
  | 'creating'
  | 'updating'
  | 'error'
  | 'stable'
  | 'cleaning';

export type Framework = 'expo_react_native' | 'react';

export type FileScope = 'updates' | 'complete';

export type PrototypeState = 'dne' | 'active_dev_server' | 'active_build';

export type BuildResultStatus = 'success' | 'error';

export type CodeErrorType = 'build' | 'runtime' | 'dependency' | 'syntax';

export type CodeWarningType =
  | 'build'
  | 'deprecation'
  | 'performance'
  | 'unused';

// Note: FileInput, CodeError, and CodeWarning are imported from PublicServerAPITypes.ts

// ============================================================================
// CACHE AND BUILD TYPES
// ============================================================================

export interface ActiveBuild {
  fargate_task_arn: string;
  fargate_private_ip: string;
  url: string;
  status: BuildStatus;
  last_touched: number;
}

export interface FargateInstanceInfo {
  taskArn: string;
  privateIp: string;
}

// ============================================================================
// REQUEST AND RESPONSE TYPES (Use PublicServerAPITypes as source of truth)
// ============================================================================

export interface FargateRequestBody {
  prototype_id: string;
  framework: Framework;
  files: FileInput[];
  file_scope: FileScope;
}

export interface FargateDevServerResponse {
  status: BuildResultStatus;
  tunnel_url?: string;
  build_errors: CodeError[];
  build_warnings: CodeWarning[];
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export interface AuthValidationResult {
  user: User;
  prototype: Database['public']['Tables']['prototypes']['Row'];
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface BuildIdComponents {
  prototypeId: string;
  timestamp: number;
  randomSuffix: string;
}

export interface BuildCreationContext {
  buildId: string;
  currentTime: number;
  shouldCreateNewBuild: boolean;
  existingBuild?: ActiveBuild;
}

// ============================================================================
// CLEANUP SERVICE TYPES
// ============================================================================

export interface CleanupOperationResult {
  success: boolean;
  error?: string;
}

export interface IdleBuildInfo {
  build: ActiveBuild;
  buildId: string;
  buildKey: string;
}

export interface CleanupStats {
  totalBuildsScanned: number;
  idleBuildsFound: number;
  successfulCleanups: number;
  failedCleanups: number;
}

// ============================================================================
// ERROR HANDLING TYPES
// ============================================================================

export class DispatcherError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'AUTH_ERROR'
      | 'VALIDATION_ERROR'
      | 'BUILD_ERROR'
      | 'FARGATE_ERROR',
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'DispatcherError';
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isValidFramework(framework: string): framework is Framework {
  return framework === 'expo_react_native' || framework === 'react';
}

export function isValidFileScope(scope: string): scope is FileScope {
  return scope === 'updates' || scope === 'complete';
}

export function isActiveBuild(obj: unknown): obj is ActiveBuild {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'fargate_task_arn' in obj &&
    'fargate_private_ip' in obj &&
    'url' in obj &&
    'status' in obj &&
    'last_touched' in obj
  );
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const CACHE_KEYS = {
  protoCurrentBuild: (prototypeId: string) => `proto:${prototypeId}:current`,
  protoBuilds: (prototypeId: string) => `proto:${prototypeId}:builds`,
  activeBuild: (buildId: string) => `active_build:${buildId}`,
} as const;

export const CACHE_PATTERNS = {
  allActiveBuilds: 'active_build:*',
  protoBuilds: (prototypeId: string) => `proto:${prototypeId}:*`,
} as const;

export const BUILD_TIMEOUTS = {
  FARGATE_LAUNCH_TIMEOUT: 300, // 5 minutes
  REQUEST_TIMEOUT: 300000, // 5 minutes in milliseconds
} as const;

export const DEFAULT_FRAMEWORK: Framework = 'expo_react_native';

export const S3_URL_TEMPLATE = (prototypeId: string): string =>
  `${prototypeId}.render.materializeui.com/`;
