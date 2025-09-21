import crypto from "crypto";

// Configuration for internal tools authentication
export const INTERNAL_TOOLS_CONFIG = {
  SIGNATURE_HEADER: "x-internal-signature",
  TIMESTAMP_HEADER: "x-internal-timestamp",
} as const;

/**
 * Generate a signature for internal tools requests
 * This function is used by the Next.js internal tools client
 */
export function generateInternalToolsSignature(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  secretKey: string
): string {
  // Create the payload to sign: timestamp + method + path + body
  const payload = `${timestamp}.${method.toUpperCase()}.${path}.${body}`;

  // Create HMAC-SHA256 signature
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(payload, "utf8")
    .digest("hex");

  return signature;
}

/**
 * Helper function to generate client-side authentication headers
 * This is used for authenticating requests to the control plane
 */
export function generateAuthHeaders(
  method: string,
  path: string,
  body: string,
  secretKey: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateInternalToolsSignature(
    timestamp,
    method,
    path,
    body,
    secretKey
  );

  const headers: Record<string, string> = {
    [INTERNAL_TOOLS_CONFIG.SIGNATURE_HEADER]: signature,
    [INTERNAL_TOOLS_CONFIG.TIMESTAMP_HEADER]: timestamp,
  };

  // Only add Content-Type header if there's a body
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

/**
 * Get environment variables for internal tools
 */
export function getInternalToolsConfig() {
  const secretKey = process.env.NEXT_PUBLIC_INTERNAL_TOOLS_SECRET_KEY;
  const serverEndpoint = process.env.NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT;

  if (!secretKey) {
    throw new Error(
      "NEXT_PUBLIC_INTERNAL_TOOLS_SECRET_KEY environment variable is required"
    );
  }

  if (!serverEndpoint) {
    throw new Error(
      "NEXT_PUBLIC_INTERNAL_TOOLS_SERVER_ENDPOINT environment variable is required"
    );
  }

  return {
    secretKey,
    serverEndpoint,
  };
}
