/**
 * @nucleate/mcp-core
 *
 * Core library for Nucleate MCP server.
 * Provides API client and tool definitions for interacting with Nucleate prototypes.
 */

// API Client
export {
  NucleateApiClient,
  type NucleateApiClientConfig,
  type APIResponse,
  type StandardErrorResponse,
  type Prototype,
  type PrototypeFramework,
  type VisibilityLevel,
  type DesignStyle,
  type BuildStatus,
  type CreatePrototypeRequest,
  type CreatePrototypeResponse,
  type FetchViewingUrlRequest,
  type FetchViewingUrlResponse,
  type StartDevServerRequest,
  type StartDevServerResponse,
  type CheckSlugResponse,
  type DeployRequest,
  type DeployResponse,
  type FileListItem,
  type ListFilesResponse,
  type ReadFileResponse,
  type WriteFileRequest,
  type WriteFileResponse,
  type DeleteFileResponse,
  type ReadMultipleFilesFileResult,
  type ReadMultipleFilesResponse,
} from './api-client/index.js';

// Tools
export {
  // Project management
  projectManagementTools,
  createPrototypeInputSchema,
  getPrototypeInputSchema,
  deletePrototypeInputSchema,
  clonePrototypeInputSchema,
  deployPrototypeInputSchema,
  checkDeploySlugInputSchema,
  type ProjectManagementTool,
  type CallToolResult,
  // Dev server
  devServerTools,
  startDevServerInputSchema,
  getDevServerStatusInputSchema,
  getViewingUrlInputSchema,
  type DevServerTool,
  // File operations
  fileOperationTools,
  listFilesInputSchema,
  readFileInputSchema,
  writeFileInputSchema,
  deleteFileInputSchema,
  readMultipleFilesInputSchema,
  type FileOperationTool,
  // Combined
  allTools,
  getToolByName,
  toolNames,
} from './tools/index.js';

// Default control-plane URLs
export const NUCLEATE_CONTROL_PLANE_URL =
  process.env.NUCLEATE_CONTROL_PLANE_URL || 'https://control-plane.nucleate.dev';
export const NUCLEATE_CONTROL_PLANE_URL_DEV = 'http://localhost:3000';
