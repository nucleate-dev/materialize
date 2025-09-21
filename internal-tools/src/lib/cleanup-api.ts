import {
  generateAuthHeaders,
  getInternalToolsConfig,
} from "./internal-tools-auth";

// Types for API responses
export interface TakeScreenshotResponse {
  success: boolean;
  message: string;
  prototype_id: string;
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
 * Take a screenshot of a specific prototype build
 */
export async function takePrototypeScreenshot(
  prototypeId: string
): Promise<TakeScreenshotResponse> {
  return makeAuthenticatedRequest<TakeScreenshotResponse>(
    "POST",
    "/internal/cleanup/take-prototype-screenshot",
    { prototype_id: prototypeId }
  );
}
