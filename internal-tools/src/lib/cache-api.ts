import {
  generateAuthHeaders,
  getInternalToolsConfig,
} from "./internal-tools-auth";

// Types for API responses
export interface CacheStats {
  success: boolean;
  stats: {
    totalKeys: number;
    activeBuilds: number;
    prototypeBuilds: number;
    currentBuilds: number;
    keyBreakdown: {
      "active_build:*": number;
      "proto:*:builds": number;
      "proto:*:current": number;
      other: number;
    };
    sampleKeys: {
      activeBuild: string[];
      prototypeBuild: string[];
      currentBuild: string[];
      other: string[];
    };
  };
  timestamp: string;
}

export interface ClearCacheResponse {
  success: boolean;
  message: string;
  timestamp: string;
  durationMs?: number;
}

export interface ApiError {
  error: string;
  message: string;
  requiredHeaders?: string[];
  details?: string;
}

export interface PrototypeBuildData {
  success: boolean;
  prototypeId: string;
  currentBuildId: string | null;
  activeBuilds: {
    buildId: string;
    isCurrent: boolean;
    activeBuild: {
      fargate_task_arn: string;
      fargate_private_ip: string;
      url: string;
      status: string;
      last_touched: number;
    };
  }[];
  buildHistory: {
    buildId: string;
    timestamp: number;
  }[];
  timestamp: string;
  message?: string;
}

/**
 * Make an authenticated request to the internal tools API
 */
async function makeAuthenticatedRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { secretKey, serverEndpoint } = getInternalToolsConfig();

  const requestBody = body ? JSON.stringify(body) : "";
  const headers = generateAuthHeaders(method, path, requestBody, secretKey);

  const url = `${serverEndpoint}${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: requestBody || undefined,
  });

  if (!response.ok) {
    const errorData: ApiError = await response.json().catch(() => ({
      error: "Unknown Error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    throw new Error(
      errorData.message || `Request failed with status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Get cache statistics from the control plane
 */
export async function getCacheStats(): Promise<CacheStats> {
  return makeAuthenticatedRequest<CacheStats>("GET", "/internal/cache/stats");
}

/**
 * Clear all cache data
 */
export async function clearCache(): Promise<ClearCacheResponse> {
  return makeAuthenticatedRequest<ClearCacheResponse>(
    "POST",
    "/internal/cache/clear"
  );
}

/**
 * Get prototype build data by prototype ID
 */
export async function getPrototypeBuildData(prototypeId: string): Promise<PrototypeBuildData> {
  return makeAuthenticatedRequest<PrototypeBuildData>(
    "GET",
    `/internal/cache/prototype/${encodeURIComponent(prototypeId)}`
  );
}

/**
 * Calculate percentage for key breakdown
 */
export function calculatePercentage(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}
