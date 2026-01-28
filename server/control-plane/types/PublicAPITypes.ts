// Public API types for the Control Plane Server
// These types define the request and response schemas for all public endpoints
import type { Database } from "../types/supabase.js";

// ============================================================================
// PRODUCT AND SUBSCRIPTION CONSTANTS
// ============================================================================

/**
 * Credit limits per subscription plan (per billing period)
 * Credits reset at the start of each billing period and do not roll over
 */
export const CreditLimits = Object.freeze({
  FREE: 15,
  PLUS: 100,
  TEAM: 140,
  PRO: 250,
  MAX: 1000,
});

// ============================================================================
// GENERIC API RESPONSE TYPE
// ============================================================================

/**
 * Generic API response type following Supabase pattern
 * Either data is present (with error as null) or error is present (with data as null)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type APIResponse<TData = any, TError = any> =
  | { data: TData; error: null }
  | { data: null; error: TError };

// ============================================================================
// COMMON TYPES
// ============================================================================

export type PrototypeFileInput =
  Database["public"]["Tables"]["prototype_files"]["Row"];
export type PrototypeAssetInput =
  Database["public"]["Tables"]["prototype_assets"]["Row"];

export type PrototypeAssetInputWithContent = PrototypeAssetInput & {
  contents: string; // base64 encoded string
};

export type BuildStatus =
  | "creating"
  | "chatting"
  | "updating"
  | "error"
  | "stable"
  | "cleaning"
  | "building";

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
  status: "healthy";
  timestamp: string;
}

export type HealthResponse = HealthSuccessResponse | StandardErrorResponse;

// ============================================================================
// /dispatch ENDPOINT
// ============================================================================

export interface DispatchRequestBody {
  prototype_id: string;
  file_scope: "updates" | "complete";
}

export interface DispatchSuccessResponse {
  viewing_url: string;
  terminal_url: string | null;
}

// ============================================================================
// /dispatch-precheck ENDPOINT and /dispatch-edit-intent ENDPOINT
// ============================================================================

export interface DispatchPrecheckRequestBody {
  prototype_id: string;
}

export interface DispatchPrecheckSuccessResponse {
  status: BuildStatus | null;
  viewing_url: string;
  terminal_tunnel_hostname: string | null;
}

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
// /payments/checkout ENDPOINT
// ============================================================================

export interface CheckoutRequestBody {
  productID:
    | "free"
    | "plus"
    | "pro"
    | "max"
    | "team"
    | "credit_pack_100"
    | "credit_pack_500"
    | "credit_pack_1000";
  teamId: string;
  seatQuantity?: number;
}

export interface CheckoutSuccessResponse {
  id: string; // Stripe session ID or billing portal session ID
  url?: string; // Optional billing portal URL (when user has existing subscription)
}

export interface CheckoutErrorResponse {
  id: null;
  error: string;
  message: string;
}

// ============================================================================
// /payments/checkout/session ENDPOINT (GET)
// ============================================================================

export interface GetCheckoutSessionSuccessResponse {
  amount_total: number | null;
  currency: string | null;
  content_name: string;
  session_id: string;
}

export interface GetCheckoutSessionErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// /payments/manage-billing ENDPOINT
// ============================================================================

export interface ManageBillingSuccessResponse {
  redirect_url: string;
}

export interface ManageBillingErrorResponse {
  error: string;
  message: string;
}

export interface ManageBillingRequestBody {
  teamId: string;
}

// ============================================================================
// /deployments/check-slug ENDPOINT (GET)
// ============================================================================

export interface CheckSlugSuccessResponse {
  available: boolean;
  slug: string;
}

export interface CheckSlugErrorResponse {
  available: boolean;
  message: string;
}

// ============================================================================
// /deployments/deploy ENDPOINT (POST)
// ============================================================================

export interface DeployRequestBody {
  prototype_id: string;
  slug: string;
}

export interface DeploySuccessResponse {
  url: string;
}

// ============================================================================
// HTTP STATUS CODE MAPPINGS
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
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

// ============================================================================
// /prototype/fetch-viewing-url ENDPOINT
// ============================================================================

export interface FetchViewingUrlRequestBody {
  prototype_id: string;
  current_page?: "view" | "edit" | null;
}

export interface FetchViewingUrlSuccessResponse {
  viewing_url: string;
  source: "editable_instance" | "static_build";
  status: BuildStatus | null;
  terminal_url: string | null;
}

// ============================================================================
// /prototype/create ENDPOINT
// ============================================================================

export const PROTOTYPE_CREATION_SOURCES = [
  "landing_prompt",
  "dashboard_prompt",
  "dashboard_modal",
  "public_prototype_clone",
  "prototype_editor_clone",
  "auth_callback_chat_intent",
  "unknown",
] as const;

export type PrototypeCreationSource =
  (typeof PROTOTYPE_CREATION_SOURCES)[number];

export interface CreatePrototypeRequestBody {
  name: string;
  creation_source: PrototypeCreationSource;
  description?: string;
  team_id: string;
  folder_id?: string;
  prototype_id?: string; // For forking an existing prototype
  visibility?: Database["public"]["Enums"]["visibility_level"];
  design_style?: Database["public"]["Enums"]["design_style"];
  custom_design_system?: string | null;
  framework?: Database["public"]["Enums"]["prototype_framework"];
  source_repo_id?: number; // GitHub repository ID to use as source
}

export interface CreatePrototypeSuccessResponse {
  prototype_id: string;
  viewing_url: string;
}

export interface CreatePrototypeErrorResponse {
  error:
    | "UNAUTHORIZED"
    | "PROTOTYPE_LIMIT_REACHED"
    | "DATABASE_ERROR"
    | "S3_ERROR"
    | "INVALID_REQUEST"
    | "FORBIDDEN";
  message: string;
}

// ============================================================================
// DELETE /prototype/:prototype_id ENDPOINT
// ============================================================================

export interface DeletePrototypeSuccessResponse {
  success: true;
  message: string;
}

export interface DeletePrototypeErrorResponse {
  success: false;
  error: "UNAUTHORIZED" | "NOT_FOUND" | "DATABASE_ERROR" | "S3_ERROR";
  message: string;
}

// ============================================================================
// /files/start-dev-server ENDPOINT
// ============================================================================

export interface StartDevServerRequestBody {
  prototype_id: string;
}

export interface StartDevServerSuccessResponse {
  success: true;
  status: "success" | "error";
  viewing_url: string;
  message: string;
  terminal_url: string | null;
}

// ============================================================================
// /dev-server/run-command ENDPOINT
// ============================================================================

export interface RunCommandRequestBody {
  prototype_id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
}

export interface RunCommandSuccessResponse {
  stdout: string;
  stderr: string;
  exit_code: number;
}

// ============================================================================
// /orchestration ENDPOINTS
// ============================================================================

export interface StartChatRequestBody {
  prototype_id: string;
  // Add other fields as needed
}

export interface StartChatResponse {
  success: boolean;
  message?: string;
}

export interface EndChatRequestBody {
  prototype_id: string;
  // Add other fields as needed
}

export interface EndChatResponse {
  success: boolean;
  message?: string;
}

export interface RefreshGitHubInstallationTokenRequestBody {
  prototype_id: string;
}

export interface RefreshGitHubInstallationTokenSuccessResponse {
  installation_token: string;
  expires_at: string;
}

export interface RefreshGitHubInstallationTokenErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// /teams/accept-invite ENDPOINT
// ============================================================================

export interface AcceptTeamInviteRequestBody {
  invite_id: string;
}

export interface AcceptTeamInviteSuccessResponse {
  success: true;
  team_id: string;
  role: string;
}

export interface AcceptTeamInviteErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// /teams/send-invite ENDPOINT
// ============================================================================

export interface SendTeamInviteRequestBody {
  emails: string[];
  team_id: string;
  role: Database["public"]["Enums"]["team_role"];
}

export interface SendTeamInviteSuccessResponse {
  success: true;
  invite_ids: string[];
  message: string;
  failed_emails?: string[];
}

export interface SendTeamInviteErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// /teams/update-member-role ENDPOINT
// ============================================================================

export interface UpdateTeamMemberRoleRequestBody {
  team_id: string;
  user_id: string;
  role: Database["public"]["Enums"]["team_role"];
}

export interface UpdateTeamMemberRoleSuccessResponse {
  success: true;
  message: string;
  old_role: string;
  new_role: string;
}

export interface UpdateTeamMemberRoleErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// /llm/completion ENDPOINT
// ============================================================================

export type LLMProvider = "anthropic" | "openai" | "google";

export interface LLMTextBlock {
  type: "text";
  text: string;
}

export interface LLMImageBlock {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type?: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    data?: string; // base64 data if type is base64
    url?: string; // URL if type is url
  };
}

export type LLMMessageContent = string | Array<LLMTextBlock | LLMImageBlock>;

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: LLMMessageContent;
}

export interface LLMCompletionRequestBody {
  provider: LLMProvider;
  model: string;
  messages: LLMMessage[];
  team_id: string;
  max_tokens?: number;
  temperature?: number;
  system_prompt?: string;
}

export interface LLMCompletionSuccessResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  credits_used: number;
  credits_remaining: number;
  model: string;
  provider: string;
}

export type LLMErrorCode =
  | "UNAUTHORIZED"
  | "INSUFFICIENT_CREDITS"
  | "INVALID_PROVIDER"
  | "INVALID_MODEL"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "CONTENT_POLICY_VIOLATION"
  | "VALIDATION_ERROR";

export interface LLMCompletionErrorResponse {
  error: LLMErrorCode;
  message: string;
  provider_error?: string;
}

// ============================================================================
// /llm/image-generation ENDPOINT
// ============================================================================

export type LLMImageSize =
  | "1024x1024"
  | "1792x1024"
  | "1024x1792"
  | "512x512"
  | "256x256";

export type LLMImageQuality = "standard" | "hd";

export interface LLMImageGenerationRequestBody {
  provider: "openai"; // Currently only OpenAI DALL-E supports image generation
  model: string; // e.g., "dall-e-3", "dall-e-2"
  prompt: string;
  team_id: string;
  size?: LLMImageSize;
  quality?: LLMImageQuality;
  n?: number; // Number of images (1-10)
}

export interface LLMGeneratedImage {
  url?: string;
  base64?: string;
  revised_prompt?: string;
}

export interface LLMImageGenerationSuccessResponse {
  images: LLMGeneratedImage[];
  credits_used: number;
  credits_remaining: number;
  model: string;
  provider: string;
}

export interface LLMImageGenerationErrorResponse {
  error: LLMErrorCode;
  message: string;
  provider_error?: string;
}

// GITHUB INTEGRATION ENDPOINTS
// ============================================================================

// POST /github/connect/start
export interface GitHubConnectStartRequestBody {
  teamId: string;
}

export interface GitHubConnectStartSuccessResponse {
  installUrl: string;
  connectSessionId: string;
}

export interface GitHubConnectStartErrorResponse {
  error: string;
  message: string;
}

// GET /github/oauth/callback (query params)
export interface GitHubOAuthCallbackQuery {
  code: string;
  state: string;
  installation_id?: string;
}

// GET /github/status
export interface GitHubStatusQuery {
  teamId: string;
}

export interface GitHubStatusSuccessResponse {
  connected: boolean;
  account_login?: string;
  account_type?: "User" | "Organization";
  connected_at?: string;
  installation_id?: number;
  is_suspended?: boolean;
  suspended_at?: string | null;
}

export interface GitHubStatusErrorResponse {
  error: string;
  message: string;
}

// POST /github/disconnect
export interface GitHubDisconnectRequestBody {
  teamId: string;
}

export interface GitHubDisconnectSuccessResponse {
  success: true;
  message: string;
}

export interface GitHubDisconnectErrorResponse {
  error: string;
  message: string;
}

// POST /github/repo/create
export interface GitHubRepoCreateRequestBody {
  prototype_id: string;
  name?: string;
  private?: boolean;
  description?: string;
}

export interface GitHubRepoCreateSuccessResponse {
  owner: string;
  name: string;
  html_url: string;
  default_branch: string;
}

export interface GitHubRepoCreateErrorResponse {
  error: string;
  message: string;
}

// GET /github/repositories
export interface GitHubRepositoriesQuery {
  teamId: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  archived: boolean;
  owner_login: string;
}

export interface GitHubRepositoriesSuccessResponse {
  repositories: GitHubRepository[];
}

export interface GitHubRepositoriesErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// SUPABASE CONNECTOR ENDPOINTS
// ============================================================================

// POST /connectors/supabase/connect/start
export interface SupabaseConnectStartRequestBody {
  teamId: string;
  organizationSlug?: string;
}

export interface SupabaseConnectStartSuccessResponse {
  authorizationUrl: string;
}

// GET /connectors/supabase/integrations
export interface SupabaseIntegrationsQuery {
  teamId: string;
}

export type ConnectorStatus = "active" | "disconnected" | "token_expired";

export interface SupabaseIntegrationSummary {
  id: string;
  supabase_organization_id: string;
  supabase_organization_name: string | null;
  connected_at: string;
  status: ConnectorStatus;
}

export interface SupabaseIntegrationsSuccessResponse {
  integrations: SupabaseIntegrationSummary[];
}

// GET /connectors/supabase/projects
export interface SupabaseProjectsQuery {
  teamId: string;
}

export interface SupabaseProjectSummary {
  id: string;
  name: string;
  organization_id: string;
  region: string;
  created_at: string;
  database?: {
    host: string;
    version: string;
  };
}

export interface SupabaseProjectsSuccessResponse {
  projects: SupabaseProjectSummary[];
}

// POST /connectors/supabase/projects
export interface SupabaseCreateProjectRequestBody {
  teamId: string;
  organizationId: string;
  name: string;
  region: string;
}

export interface SupabaseCreateProjectSuccessResponse {
  project: SupabaseProjectSummary;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isStandardErrorResponse(
  response: unknown,
): response is StandardErrorResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    "message" in response
  );
}

// ============================================================================
// FILE OPERATIONS ENDPOINTS
// ============================================================================

// POST /files/list
export interface ListFilesRequestBody {
  prototype_id: string;
}

export interface FileListItem {
  name: string;
  type: "text" | "binary";
  updated_at: string;
}

export interface ListFilesSuccessResponse {
  files: FileListItem[];
}

// POST /files/read
export interface ReadFileRequestBody {
  prototype_id: string;
  file_path: string;
}

export interface ReadFileSuccessResponse {
  file_path: string;
  content: string;
  type: "text" | "binary";
}

// POST /files/write
export interface WriteFileRequestBody {
  prototype_id: string;
  file_path: string;
  content: string; // For binary files, this should be base64 encoded
}

export interface WriteFileSuccessResponse {
  success: true;
  file_path: string;
  message: string;
}

// POST /files/delete
export interface DeleteFileRequestBody {
  prototype_id: string;
  file_path: string;
}

export interface DeleteFileSuccessResponse {
  success: true;
  file_path: string;
  message: string;
}

// POST /files/read-multiple
export interface ReadMultipleFilesRequestBody {
  prototype_id: string;
  file_paths: string[];
}

export interface ReadMultipleFilesFileResult {
  file_path: string;
  content: string | null;
  type: "text" | "binary";
  error?: string;
}

export interface ReadMultipleFilesSuccessResponse {
  files: ReadMultipleFilesFileResult[];
}
