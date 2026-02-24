import type { BuildStatus, PrototypeFileInput } from './PublicAPITypes.js';
import type { Database } from './supabase.js';

// ============================================================================
// CORE DOMAIN TYPES
// ============================================================================

export type Framework = 'expo_react_native' | 'react';

export type FileScope = 'updates' | 'complete';

export type BuildResultStatus = 'success' | 'error';

export type CodeErrorType = 'build' | 'runtime' | 'dependency' | 'syntax';

export type DesignStyle = Database['public']['Enums']['design_style'];

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
  terminal_tunnel_id: string;
  terminal_tunnel_hostname: string;
  orchestration_token: string;
  clean_attempts: number;
}

export interface IdleBuild {
  fargate_task_arn: string;
  fargate_private_ip: string;
  status: IdleContainerStatus;
}
export type IdleContainerStatus = 'ready' | 'creating';

export interface FargateInstanceInfo {
  taskArn: string;
  privateIp: string;
  terminalTunnelId: string;
  terminalTunnelHostname: string;
  orchestrationToken: string;
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

export interface SubscriptionInfo {
  userPlan: SubscriptionPlanType;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeCustomerId: string;
}

// ============================================================================
// CLEANUP SERVICE TYPES
// ============================================================================

export interface CleanupOperationResult {
  success: boolean;
  buildInProgress: boolean;
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
// PROTOTYPE MANAGEMENT TYPES
// ============================================================================

export type SubscriptionPlanType = 'free' | 'pro' | 'plus' | 'max' | 'team';

export interface PrototypeAuthResult {
  success: boolean;
  userId: string;
  subscriptionPlan: SubscriptionPlanType;
  error?: string;
  message?: string;
}

export interface S3CopyResult {
  success: boolean;
  error?: string;
  copiedObjects: number;
  version?: string;
}

export interface S3UploadResult {
  success: boolean;
  publicUrl: string | null;
  error?: string;
}

export interface DefaultFilesResult {
  success: boolean;
  files?: PrototypeFileInsert[];
  assets?: { name: string; contents: Buffer; prototype_id: string }[];
  error?: string;
}

export type PrototypeInsert =
  Database['public']['Tables']['prototypes']['Insert'];
export type PrototypeRow = Database['public']['Tables']['prototypes']['Row'];
export type PrototypeFileRow =
  Database['public']['Tables']['prototype_files']['Row'];
export type PrototypeAssetRow =
  Database['public']['Tables']['prototype_assets']['Row'];
export type PrototypeFileInsert =
  Database['public']['Tables']['prototype_files']['Insert'];
export type PrototypeAssetInsert =
  Database['public']['Tables']['prototype_assets']['Insert'];

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
// CHAT ENGINE TYPES
// ============================================================================

export const DESIGN_STYLE_KEYS = [
  'tamagui',
  'stylesheets',
  'nativewind',
] as const;

export type DesignStyleKey = (typeof DESIGN_STYLE_KEYS)[number];

export interface PromptConfig {
  system: string;
  errorFixing: string;
  specExpansion: string;
}

export interface StyleDetail {
  systemIntro: string;
  designSystemBullet: string;
  errorFixingNote: string;
  specAcceptance: string;
  commonFix: string;
  visualGuidance: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

// Event tracking for persistence
export interface EventTracker {
  sequence: number;
  events: Array<{
    event_type: string;
    event_data: unknown;
    event_timestamp: string;
    sequence: number;
  }>;
}

export interface ChatEngineResult {
  assistantResponse: string;
  executionPlan?: string[];
  completedSteps?: number[];
  fileChanges?: Record<string, PrototypeFileInput>;
  toolCalls?: Array<{ toolName: string; input: unknown; output: unknown }>;
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

export function isActiveBuildType(obj: unknown): obj is ActiveBuild {
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

export const BUILD_TIMEOUTS = {
  FARGATE_LAUNCH_TIMEOUT: 300, // 5 minutes
  REQUEST_TIMEOUT: 300000, // 5 minutes in milliseconds
} as const;

export const DEFAULT_FRAMEWORK: Framework = 'expo_react_native';

export const S3_URL_TEMPLATE = (prototypeId: string): string =>
  `${prototypeId}.build.nucleate.dev/`;
