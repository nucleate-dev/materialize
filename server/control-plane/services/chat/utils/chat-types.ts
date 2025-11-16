/**
 * Chat Streaming Event Types
 *
 * This file defines all possible server-sent events (SSE) that are streamed
 * from the ChatEngine to the client during a chat interaction.
 */

import type { CodeError, PrototypeFileInput } from '../../../types/PublicAPITypes.js';

// ============================================================================
// Event Type Enum
// ============================================================================

/**
 * All possible streaming event types sent during a chat session
 */
export enum ChatStreamEventType {
  // Phase & Progress Events
  INTENT_DETECTED = 'intent_detected',
  PHASE_STARTED = 'phase_started',
  IMAGE_PROCESSING = 'image_processing',
  SPEC_EXPANDED = 'spec_expanded',

  // Execution Events (from orchestration tools)
  EXECUTION_PLAN_CREATED = 'execution_plan_created',
  STEP_COMPLETED = 'step_completed',

  // Tool Events
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',

  // Response Events
  CHAT_RESPONSE_DELTA = 'chat_response_delta',
  CHAT_RESPONSE = 'chat_response',

  // File & Build Events
  FILES_SYNCED = 'files_synced',
  DISPATCH_START = 'dispatch_start',
  DISPATCH_ERROR = 'dispatch_error',
  VIEWING_URL = 'viewing_url',
  BUILD_ERRORS = 'build_errors',
  TYPECHECK_STARTED = 'typecheck_started',
  TYPECHECK_ERRORS = 'typecheck_errors',
  TYPECHECK_PASSED = 'typecheck_passed',
  TYPECHECK_FAILED = 'typecheck_failed',

  // Completion Events
  CHAT_COMPLETE = 'chat_complete',
  STREAM_COMPLETE = 'stream_complete',

  // Usage & Error Events
  USAGE_UPDATE = 'usage_update',
  ERROR = 'error',
}

// ============================================================================
// Phase Types
// ============================================================================

/**
 * Different phases of chat execution
 */
export enum ChatPhase {
  SPEC_EXPANSION = 'spec_expansion',
  MAIN_EXECUTION = 'main_execution',
  FILE_DISPATCH = 'file_dispatch',
  ERROR_CHECKING = 'error_checking',
  ERROR_FIXING = 'error_fixing',
}

/**
 * Image processing status
 */
export enum ImageProcessingStatus {
  FETCHING = 'fetching',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

/**
 * User intent types (from intent classifier)
 */
export type UserIntent =
  | 'error_fixing'
  | 'feature_request'
  | 'code_modification'
  | 'question'
  | 'clarification';

// ============================================================================
// Event Payload Interfaces
// ============================================================================

/**
 * Intent detected event - shows what type of request the AI understood
 */
export interface IntentDetectedEvent {
  type: ChatStreamEventType.INTENT_DETECTED;
  intent: UserIntent;
  timestamp: string;
}

/**
 * Phase started event - indicates major phase transitions
 */
export interface PhaseStartedEvent {
  type: ChatStreamEventType.PHASE_STARTED;
  phase: ChatPhase;
  description: string;
}

/**
 * Image processing event - tracks image fetch and conversion
 */
export interface ImageProcessingEvent {
  type: ChatStreamEventType.IMAGE_PROCESSING;
  status: ImageProcessingStatus;
  imageUrl?: string;
}

/**
 * Spec expanded event - shows original and AI-expanded user message
 */
export interface SpecExpandedEvent {
  type: ChatStreamEventType.SPEC_EXPANDED;
  original_message: string;
  expanded_message: string;
  timestamp: string;
}

/**
 * Execution plan created event
 */
export interface ExecutionPlanCreatedEvent {
  type: ChatStreamEventType.EXECUTION_PLAN_CREATED;
  toolCallId: string;
  result: {
    success: boolean;
    plan: string[];
    message: string;
  };
}

/**
 * Step completed event
 */
export interface StepCompletedEvent {
  type: ChatStreamEventType.STEP_COMPLETED;
  toolCallId: string;
  result: {
    success: boolean;
    step: number;
    summary: string;
    message: string;
  };
}

/**
 * Tool call event - when AI calls a tool
 */
export interface ToolCallEvent {
  type: ChatStreamEventType.TOOL_CALL;
  tool: string;
  toolCallId: string;
  args: unknown;
}

/**
 * Tool result event - result from a tool execution
 */
export interface ToolResultEvent {
  type: ChatStreamEventType.TOOL_RESULT;
  tool: string;
  toolCallId: string;
  result: unknown;
}

/**
 * Type check started event - emitted before running validation
 */
export interface TypecheckStartedEvent {
  type: ChatStreamEventType.TYPECHECK_STARTED;
  command: string;
}

/**
 * Type check errors event - emitted when compiler errors are found
 */
export interface TypecheckErrorsEvent {
  type: ChatStreamEventType.TYPECHECK_ERRORS;
  output: string;
}

/**
 * Type check passed event - emitted when the type check completes with no errors
 */
export interface TypecheckPassedEvent {
  type: ChatStreamEventType.TYPECHECK_PASSED;
  message: string;
}

/**
 * Type check failed event - emitted when the type check command cannot be completed
 */
export interface TypecheckFailedEvent {
  type: ChatStreamEventType.TYPECHECK_FAILED;
  error: string;
}

/**
 * Chat response delta event - streaming text chunks
 */
export interface ChatResponseDeltaEvent {
  type: ChatStreamEventType.CHAT_RESPONSE_DELTA;
  content: string;
}

/**
 * Chat response event - complete response (for compatibility)
 */
export interface ChatResponseEvent {
  type: ChatStreamEventType.CHAT_RESPONSE;
  content: string;
}

/**
 * Files synced event - updated files sent to client
 */
export interface FilesSyncedEvent {
  type: ChatStreamEventType.FILES_SYNCED;
  updatedFilesObject: Record<string, PrototypeFileInput>;
  deletedFiles: string[];
}

/**
 * Dispatch start event - building process started
 */
export interface DispatchStartEvent {
  type: ChatStreamEventType.DISPATCH_START;
}

/**
 * Dispatch error event - build/dispatch failed
 */
export interface DispatchErrorEvent {
  type: ChatStreamEventType.DISPATCH_ERROR;
  error: string;
  details: string;
}

/**
 * Viewing URL event - preview URL is ready
 */
export interface ViewingUrlEvent {
  type: ChatStreamEventType.VIEWING_URL;
  viewing_url: string;
}

/**
 * Build errors event - compilation/build errors
 */
export interface BuildErrorsEvent {
  type: ChatStreamEventType.BUILD_ERRORS;
  build_errors: CodeError[];
}

/**
 * Chat complete event - chat execution finished
 */
export interface ChatCompleteEvent {
  type: ChatStreamEventType.CHAT_COMPLETE;
}

/**
 * Stream complete event - SSE stream is closing
 */
export interface StreamCompleteEvent {
  type: ChatStreamEventType.STREAM_COMPLETE;
}

/**
 * Usage update event - updated API usage count
 */
export interface UsageUpdateEvent {
  type: ChatStreamEventType.USAGE_UPDATE;
  creditsRemaining: number;
}

/**
 * Error event - error occurred during chat
 */
export interface ErrorEvent {
  type: ChatStreamEventType.ERROR;
  error: string;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all possible chat stream events
 */
export type ChatStreamEvent =
  | IntentDetectedEvent
  | PhaseStartedEvent
  | ImageProcessingEvent
  | SpecExpandedEvent
  | ExecutionPlanCreatedEvent
  | StepCompletedEvent
  | ToolCallEvent
  | ToolResultEvent
  | ChatResponseDeltaEvent
  | ChatResponseEvent
  | FilesSyncedEvent
  | DispatchStartEvent
  | DispatchErrorEvent
  | ViewingUrlEvent
  | BuildErrorsEvent
  | ChatCompleteEvent
  | StreamCompleteEvent
  | UsageUpdateEvent
  | ErrorEvent;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an event is a specific type
 */
export function isChatStreamEvent<T extends ChatStreamEvent>(
  event: ChatStreamEvent,
  type: ChatStreamEventType,
): event is T {
  return event.type === type;
}

/**
 * Type guard for intent detected event
 */
export function isIntentDetectedEvent(
  event: ChatStreamEvent,
): event is IntentDetectedEvent {
  return event.type === ChatStreamEventType.INTENT_DETECTED;
}

/**
 * Type guard for phase started event
 */
export function isPhaseStartedEvent(
  event: ChatStreamEvent,
): event is PhaseStartedEvent {
  return event.type === ChatStreamEventType.PHASE_STARTED;
}

/**
 * Type guard for spec expanded event
 */
export function isSpecExpandedEvent(
  event: ChatStreamEvent,
): event is SpecExpandedEvent {
  return event.type === ChatStreamEventType.SPEC_EXPANDED;
}

/**
 * Type guard for tool call event
 */
export function isToolCallEvent(
  event: ChatStreamEvent,
): event is ToolCallEvent {
  return event.type === ChatStreamEventType.TOOL_CALL;
}

/**
 * Type guard for error event
 */
export function isErrorEvent(
  event: ChatStreamEvent,
): event is ErrorEvent {
  return event.type === ChatStreamEventType.ERROR;
}
