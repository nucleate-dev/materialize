/**
 * User MCP Servers Service
 *
 * Loads user-defined external MCP server configurations from Supabase
 * and returns them in a format compatible with the Claude Agent SDK.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { Database } from "../../../types/supabase.js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";

type TeamMcpServer = Database["public"]["Tables"]["team_mcp_servers"]["Row"];

export interface LoadedMcpServer {
  id: string;
  serverName: string;
  description: string | null;
  serverUrl: string;
  transportType: "http" | "sse";
  authType: "bearer" | "api_key" | "none" | null;
  authHeaderName: string | null;
  authTokenEncrypted: string | null;
  customHeaders: Record<string, string>;
  isEnabled: boolean;
  healthStatus: string;
}

export interface McpServerValidationResult {
  valid: boolean;
  error?: string;
}

// Private/internal IP ranges that should be blocked
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/,
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
];

export class UserMcpServersService {
  constructor(
    private readonly supabaseClient: SupabaseClient<Database>,
    private readonly logger: SystemLogger,
  ) {}

  /**
   * Load all enabled MCP servers for a team, applying project-level overrides.
   */
  async loadMcpServers(
    teamId: string,
    prototypeId?: string,
  ): Promise<LoadedMcpServer[]> {
    // 1. Fetch team MCP servers
    const { data: teamServers, error: serversError } = await this.supabaseClient
      .from("team_mcp_servers")
      .select("*")
      .eq("team_id", teamId);

    if (serversError) {
      this.logger.error(serversError, "Failed to load team MCP servers", {
        teamId,
      });
      return [];
    }

    if (!teamServers || teamServers.length === 0) {
      return [];
    }

    // 2. Fetch project-level overrides if prototypeId is provided
    let overrides: Map<string, boolean> = new Map();
    if (prototypeId) {
      const { data: overrideRows, error: overridesError } =
        await this.supabaseClient
          .from("prototype_ai_config_overrides")
          .select("*")
          .eq("prototype_id", prototypeId)
          .eq("config_type", "mcp_server");

      if (overridesError) {
        this.logger.warn("Failed to load MCP server overrides", {
          prototypeId,
          error: overridesError.message,
        });
      } else if (overrideRows) {
        for (const override of overrideRows) {
          overrides.set(override.config_id, override.is_enabled);
        }
      }
    }

    // 3. Build the final list of servers with overrides applied
    const servers: LoadedMcpServer[] = teamServers.map((server) => {
      const hasOverride = overrides.has(server.id);
      const isEnabled = hasOverride
        ? overrides.get(server.id)!
        : server.is_enabled;

      return {
        id: server.id,
        serverName: server.server_name,
        description: server.description,
        serverUrl: server.server_url,
        transportType: server.transport_type as "http" | "sse",
        authType: server.auth_type as "bearer" | "api_key" | "none" | null,
        authHeaderName: server.auth_header_name,
        authTokenEncrypted: server.auth_token_encrypted,
        customHeaders: (server.custom_headers as Record<string, string>) ?? {},
        isEnabled,
        healthStatus: server.health_status,
      };
    });

    this.logger.info("Loaded user MCP servers", {
      teamId,
      prototypeId,
      totalServers: servers.length,
      enabledServers: servers.filter((s) => s.isEnabled).length,
    });

    return servers;
  }

  /**
   * Validate an MCP server URL for security.
   */
  validateServerUrl(url: string): McpServerValidationResult {
    try {
      const parsed = new URL(url);

      // Must be HTTP or HTTPS
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return {
          valid: false,
          error: "Only HTTP and HTTPS protocols are allowed",
        };
      }

      // In production, prefer HTTPS
      if (
        process.env.NODE_ENV === "production" &&
        parsed.protocol === "http:"
      ) {
        return {
          valid: false,
          error: "Only HTTPS is allowed in production",
        };
      }

      // Check for blocked IP patterns
      const hostname = parsed.hostname.toLowerCase();
      for (const pattern of BLOCKED_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          return {
            valid: false,
            error: "Internal/private addresses are not allowed",
          };
        }
      }

      return { valid: true };
    } catch {
      return {
        valid: false,
        error: "Invalid URL format",
      };
    }
  }

  /**
   * Convert loaded MCP servers to the SDK McpServerConfig format.
   * Only returns enabled servers with valid URLs.
   */
  async getMcpServerConfigs(
    teamId: string,
    prototypeId?: string,
  ): Promise<Record<string, McpServerConfig>> {
    const servers = await this.loadMcpServers(teamId, prototypeId);
    const configs: Record<string, McpServerConfig> = {};

    for (const server of servers) {
      if (!server.isEnabled) {
        continue;
      }

      // Validate URL before adding
      const validation = this.validateServerUrl(server.serverUrl);
      if (!validation.valid) {
        this.logger.warn("Skipping MCP server with invalid URL", {
          serverName: server.serverName,
          error: validation.error,
        });
        continue;
      }

      // Build headers
      const headers: Record<string, string> = { ...server.customHeaders };

      // Add authentication header if configured
      if (server.authType && server.authTokenEncrypted) {
        const token = this.decryptToken(server.authTokenEncrypted);
        if (token) {
          if (server.authType === "bearer") {
            headers["Authorization"] = `Bearer ${token}`;
          } else if (server.authType === "api_key") {
            const headerName = server.authHeaderName ?? "X-API-Key";
            headers[headerName] = token;
          }
        }
      }

      // Use prefixed name to avoid conflicts with built-in MCP servers
      const serverKey = `user_${this.sanitizeServerName(server.serverName)}`;

      // Build the config based on transport type
      if (server.transportType === "sse") {
        configs[serverKey] = {
          type: "sse",
          url: server.serverUrl,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        };
      } else {
        // Default to HTTP
        configs[serverKey] = {
          type: "http",
          url: server.serverUrl,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        };
      }
    }

    this.logger.info("Built MCP server configs", {
      teamId,
      prototypeId,
      serverCount: Object.keys(configs).length,
      serverNames: Object.keys(configs),
    });

    return configs;
  }

  /**
   * Get the tool wildcard patterns for user MCP servers.
   * Returns patterns like "mcp__user_servername__*" for each enabled server.
   */
  async getToolWildcards(
    teamId: string,
    prototypeId?: string,
  ): Promise<string[]> {
    const configs = await this.getMcpServerConfigs(teamId, prototypeId);
    return Object.keys(configs).map((serverKey) => `mcp__${serverKey}__*`);
  }

  /**
   * Decrypt an encrypted auth token.
   * TODO: Implement proper encryption/decryption.
   * For now, tokens are stored as-is (should be improved for production).
   */
  private decryptToken(encryptedToken: string): string | null {
    // TODO: Implement proper decryption using a secure key
    // For now, we assume tokens are stored directly (not recommended for production)
    return encryptedToken;
  }

  /**
   * Sanitize a server name for use as a config key.
   */
  private sanitizeServerName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .substring(0, 30);
  }
}
