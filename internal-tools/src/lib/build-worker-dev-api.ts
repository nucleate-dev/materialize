import {
  generateAuthHeaders,
  getInternalToolsConfig,
} from "@/lib/internal-tools-auth";

export type BuildWorkerRouteMethod = "POST" | "DELETE" | "GET" | "PUT";

export interface BuildWorkerRequestPayload {
  endpoint: string;
  path: string;
  method: BuildWorkerRouteMethod;
  payload?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
}

export interface BuildWorkerRouteResponse {
  success: boolean;
  status: number;
  statusText: string;
  requestedUrl: string;
  durationMs: number;
  headers: Record<string, string>;
  data: unknown;
}

export interface BuildWorkerRouteError {
  error: string;
  message: string;
  details?: string;
}

export async function sendBuildWorkerRequest(
  body: BuildWorkerRequestPayload,
): Promise<BuildWorkerRouteResponse> {
  const path = "/internal/build-worker-dev/execute";
  const method = "POST";
  const { secretKey, serverEndpoint } = getInternalToolsConfig();

  const requestBody = JSON.stringify(body);
  const headers = generateAuthHeaders(method, path, requestBody, secretKey);

  const response = await fetch(`${serverEndpoint}${path}`, {
    method,
    headers,
    body: requestBody,
  });

  const responseJson = await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload = (responseJson as BuildWorkerRouteError | null) ?? {
      error: "RequestFailed",
      message: `Request failed with status ${response.status}`,
    };

    const details = errorPayload.details ? ` (${errorPayload.details})` : "";

    throw new Error(
      (errorPayload.message ||
        `Request failed with status ${response.status}`) + details,
    );
  }

  return (
    (responseJson as BuildWorkerRouteResponse) ?? {
      success: false,
      status: response.status,
      statusText: response.statusText,
      requestedUrl: "",
      durationMs: 0,
      headers: {},
      data: null,
    }
  );
}
