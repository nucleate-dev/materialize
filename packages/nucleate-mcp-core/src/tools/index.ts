/**
 * Nucleate MCP Tools
 *
 * Exports all tool definitions for the Nucleate MCP server.
 */

export * from './project-management.js';
export * from './dev-server.js';
export * from './file-operations.js';

import { projectManagementTools } from './project-management.js';
import { devServerTools } from './dev-server.js';
import { fileOperationTools } from './file-operations.js';

/**
 * All Nucleate MCP tools combined
 */
export const allTools = [
  ...projectManagementTools,
  ...devServerTools,
  ...fileOperationTools,
] as const;

/**
 * Get a tool by name
 */
export function getToolByName(name: string) {
  return allTools.find((tool) => tool.name === name);
}

/**
 * List of all tool names
 */
export const toolNames = allTools.map((tool) => tool.name);
