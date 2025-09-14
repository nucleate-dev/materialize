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
      "proto_builds:*": number;
      "proto_current_build:*": number;
      other: number;
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
 * Calculate percentage for key breakdown
 */
export function calculatePercentage(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}
