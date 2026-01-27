/**
 * Nucleate API Client
 *
 * Provides typed access to the Nucleate control-plane API for MCP tools.
 */

// API Response types (matching control-plane PublicAPITypes)
export interface APIResponse<TData = unknown, TError = unknown> {
  data: TData | null;
  error: TError | null;
}

export interface StandardErrorResponse {
  error: string;
  message: string;
}

// Prototype types
export interface PrototypeCreationSource {
  type:
    | 'landing_prompt'
    | 'dashboard_prompt'
    | 'dashboard_modal'
    | 'public_prototype_clone'
    | 'prototype_editor_clone'
    | 'auth_callback_chat_intent'
    | 'unknown';
}

export type PrototypeFramework = 'mobile_expo_react_native' | 'web_nextjs_react';
export type VisibilityLevel = 'PUBLIC' | 'TEAM' | 'TEAM_SUBSET' | 'SELF';
export type DesignStyle = 'tamagui' | 'stylesheets' | 'nativewind';
export type BuildStatus =
  | 'creating'
  | 'chatting'
  | 'updating'
  | 'error'
  | 'stable'
  | 'cleaning'
  | 'building';

// Request/Response types for prototype management
export interface CreatePrototypeRequest {
  name: string;
  creation_source: string;
  team_id: string;
  description?: string;
  folder_id?: string;
  prototype_id?: string;
  visibility?: VisibilityLevel;
  design_style?: DesignStyle;
  custom_design_system?: string | null;
  framework?: PrototypeFramework;
  source_repo_id?: number;
}

export interface CreatePrototypeResponse {
  prototype_id: string;
  viewing_url: string;
}

export interface FetchViewingUrlRequest {
  prototype_id: string;
  current_page?: 'view' | 'edit' | null;
}

export interface FetchViewingUrlResponse {
  viewing_url: string;
  source: 'editable_instance' | 'static_build';
  status: BuildStatus | null;
  terminal_url: string | null;
}

export interface StartDevServerRequest {
  prototype_id: string;
}

export interface StartDevServerResponse {
  success: true;
  status: 'success' | 'error';
  viewing_url: string;
  message: string;
  terminal_url: string | null;
}

export interface CheckSlugResponse {
  available: boolean;
  slug: string;
}

export interface DeployRequest {
  prototype_id: string;
  slug: string;
}

export interface DeployResponse {
  url: string;
}

// File operation types
export interface FileListItem {
  name: string;
  type: 'text' | 'binary';
  updated_at: string;
}

export interface ListFilesResponse {
  files: FileListItem[];
}

export interface ReadFileResponse {
  file_path: string;
  content: string;
  type: 'text' | 'binary';
}

export interface WriteFileRequest {
  prototype_id: string;
  file_path: string;
  content: string;
}

export interface WriteFileResponse {
  success: true;
  file_path: string;
  message: string;
}

export interface DeleteFileResponse {
  success: true;
  file_path: string;
  message: string;
}

export interface ReadMultipleFilesFileResult {
  file_path: string;
  content: string | null;
  type: 'text' | 'binary';
  error?: string;
}

export interface ReadMultipleFilesResponse {
  files: ReadMultipleFilesFileResult[];
}

// Prototype type from database (simplified)
export interface Prototype {
  id: string;
  name: string;
  description: string | null;
  team_id: string;
  folder_id: string | null;
  visibility: VisibilityLevel;
  framework: PrototypeFramework;
  created_at: string;
  updated_at: string;
}

export interface NucleateApiClientConfig {
  baseUrl: string;
  authToken: string;
}

export class NucleateApiClient {
  private baseUrl: string;
  private authToken: string;

  constructor(config: NucleateApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.authToken = config.authToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>,
  ): Promise<APIResponse<T, StandardErrorResponse>> {
    let url = `${this.baseUrl}${path}`;

    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.authToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    return data as APIResponse<T, StandardErrorResponse>;
  }

  // ============================================================================
  // PROTOTYPE MANAGEMENT
  // ============================================================================

  /**
   * Create a new prototype
   */
  async createPrototype(
    params: CreatePrototypeRequest,
  ): Promise<APIResponse<CreatePrototypeResponse, StandardErrorResponse>> {
    return this.request<CreatePrototypeResponse>('POST', '/prototype/create', params);
  }

  /**
   * Delete a prototype
   */
  async deletePrototype(
    prototypeId: string,
  ): Promise<APIResponse<{ success: true; message: string }, StandardErrorResponse>> {
    return this.request<{ success: true; message: string }>(
      'DELETE',
      `/prototype/${prototypeId}`,
    );
  }

  /**
   * Fetch the viewing URL for a prototype
   */
  async fetchViewingUrl(
    params: FetchViewingUrlRequest,
  ): Promise<APIResponse<FetchViewingUrlResponse, StandardErrorResponse>> {
    return this.request<FetchViewingUrlResponse>(
      'POST',
      '/prototype/fetch-viewing-url',
      params,
    );
  }

  // ============================================================================
  // DEV SERVER CONTROL
  // ============================================================================

  /**
   * Start the dev server for a prototype
   */
  async startDevServer(
    params: StartDevServerRequest,
  ): Promise<APIResponse<StartDevServerResponse, StandardErrorResponse>> {
    return this.request<StartDevServerResponse>('POST', '/files/start-dev-server', params);
  }

  // ============================================================================
  // DEPLOYMENT
  // ============================================================================

  /**
   * Check if a deployment slug is available
   */
  async checkDeploySlug(
    slug: string,
  ): Promise<APIResponse<CheckSlugResponse, StandardErrorResponse>> {
    return this.request<CheckSlugResponse>(
      'GET',
      '/deployments/check-slug',
      undefined,
      { slug },
    );
  }

  /**
   * Deploy a prototype to a public URL
   */
  async deployPrototype(
    params: DeployRequest,
  ): Promise<APIResponse<DeployResponse, StandardErrorResponse>> {
    return this.request<DeployResponse>('POST', '/deployments/deploy', params);
  }

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * List all files in a prototype
   */
  async listFiles(
    prototypeId: string,
  ): Promise<APIResponse<ListFilesResponse, StandardErrorResponse>> {
    return this.request<ListFilesResponse>('POST', '/files/list', {
      prototype_id: prototypeId,
    });
  }

  /**
   * Read a single file from a prototype
   */
  async readFile(
    prototypeId: string,
    filePath: string,
  ): Promise<APIResponse<ReadFileResponse, StandardErrorResponse>> {
    return this.request<ReadFileResponse>('POST', '/files/read', {
      prototype_id: prototypeId,
      file_path: filePath,
    });
  }

  /**
   * Write a file to a prototype
   * For binary files, content should be base64 encoded
   */
  async writeFile(
    prototypeId: string,
    filePath: string,
    content: string,
  ): Promise<APIResponse<WriteFileResponse, StandardErrorResponse>> {
    return this.request<WriteFileResponse>('POST', '/files/write', {
      prototype_id: prototypeId,
      file_path: filePath,
      content,
    });
  }

  /**
   * Delete a file from a prototype
   */
  async deleteFile(
    prototypeId: string,
    filePath: string,
  ): Promise<APIResponse<DeleteFileResponse, StandardErrorResponse>> {
    return this.request<DeleteFileResponse>('POST', '/files/delete', {
      prototype_id: prototypeId,
      file_path: filePath,
    });
  }

  /**
   * Read multiple files from a prototype
   */
  async readMultipleFiles(
    prototypeId: string,
    filePaths: string[],
  ): Promise<APIResponse<ReadMultipleFilesResponse, StandardErrorResponse>> {
    return this.request<ReadMultipleFilesResponse>('POST', '/files/read-multiple', {
      prototype_id: prototypeId,
      file_paths: filePaths,
    });
  }
}
