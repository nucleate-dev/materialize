import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';

// Configuration for internal tools authentication
export const INTERNAL_TOOLS_CONFIG = {
  SIGNATURE_HEADER: 'x-internal-signature',
  TIMESTAMP_HEADER: 'x-internal-timestamp',
  SECRET_KEY_ENV: 'INTERNAL_TOOLS_SECRET_KEY',
  MAX_TIMESTAMP_DIFF: 300, // 5 minutes in seconds
} as const;

/**
 * Generate a signature for internal tools requests
 * This function should be used by the Next.js internal tools client
 */
export function generateInternalToolsSignature(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  secretKey: string,
): string {
  // Create the payload to sign: timestamp + method + path + body
  const payload = `${timestamp}.${method.toUpperCase()}.${path}.${body}`;

  // Create HMAC-SHA256 signature
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(payload, 'utf8')
    .digest('hex');

  return signature;
}

/**
 * Verify the signature for internal tools requests
 * This function is used by the server to authenticate requests
 */
export function verifyInternalToolsSignature(
  timestamp: string,
  method: string,
  path: string,
  body: string,
  providedSignature: string,
  secretKey: string,
): { isValid: boolean; error?: string } {
  // Check timestamp freshness to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp);

  if (isNaN(requestTime)) {
    return { isValid: false, error: 'Invalid timestamp format' };
  }

  const timeDiff = Math.abs(now - requestTime);
  if (timeDiff > INTERNAL_TOOLS_CONFIG.MAX_TIMESTAMP_DIFF) {
    return {
      isValid: false,
      error: `Request timestamp too old. Diff: ${timeDiff}s, Max: ${INTERNAL_TOOLS_CONFIG.MAX_TIMESTAMP_DIFF}s`,
    };
  }

  // Generate expected signature
  const expectedSignature = generateInternalToolsSignature(
    timestamp,
    method,
    path,
    body,
    secretKey,
  );

  // Use constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(providedSignature, 'hex'),
    Buffer.from(expectedSignature, 'hex'),
  );

  if (!isValid) {
    return { isValid: false, error: 'Invalid signature' };
  }

  return { isValid: true };
}

/**
 * Fastify preHandler hook for internal tools authentication
 */
export async function authenticateInternalToolsRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const secretKey = process.env[INTERNAL_TOOLS_CONFIG.SECRET_KEY_ENV];

  if (!secretKey) {
    request.log2.error(
      new Error('Internal tools secret key not configured'),
      'INTERNAL_TOOLS_SECRET_KEY environment variable not set',
    );
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      error: 'Internal Server Error',
      message: 'Internal tools authentication not configured',
    });
  }

  // Extract headers
  const signature = request.headers[
    INTERNAL_TOOLS_CONFIG.SIGNATURE_HEADER
  ] as string;
  const timestamp = request.headers[
    INTERNAL_TOOLS_CONFIG.TIMESTAMP_HEADER
  ] as string;

  if (!signature || !timestamp) {
    request.log2.warn(
      'Missing authentication headers for internal tools request',
      {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        headers: Object.keys(request.headers),
      },
    );
    return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
      error: 'Unauthorized',
      message: 'Missing required authentication headers',
      requiredHeaders: [
        INTERNAL_TOOLS_CONFIG.SIGNATURE_HEADER,
        INTERNAL_TOOLS_CONFIG.TIMESTAMP_HEADER,
      ],
    });
  }

  // Get request body as string
  const body = request.body ? JSON.stringify(request.body) : '';

  // Verify signature
  const verification = verifyInternalToolsSignature(
    timestamp,
    request.method,
    request.url,
    body,
    signature,
    secretKey,
  );

  if (!verification.isValid) {
    request.log2.warn('Invalid internal tools authentication', {
      error: verification.error,
      method: request.method,
      url: request.url,
      timestamp,
      providedSignature: signature.substring(0, 8) + '...', // Log only first 8 chars for security
    });
    return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
      error: 'Unauthorized',
      message: 'Invalid authentication signature',
      details: verification.error,
    });
  }

  request.log2.info('Internal tools request authenticated successfully', {
    method: request.method,
    url: request.url,
    timestamp,
  });
}

/**
 * Helper function to generate client-side authentication headers
 * This can be used as reference for the Next.js internal tools client
 */
export function generateAuthHeaders(
  method: string,
  path: string,
  body: string,
  secretKey: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateInternalToolsSignature(
    timestamp,
    method,
    path,
    body,
    secretKey,
  );

  return {
    [INTERNAL_TOOLS_CONFIG.SIGNATURE_HEADER]: signature,
    [INTERNAL_TOOLS_CONFIG.TIMESTAMP_HEADER]: timestamp,
    'Content-Type': 'application/json',
  };
}

/**
 * Example client-side usage (for Next.js internal tools client):
 *
 * const headers = generateAuthHeaders(
 *   'POST',
 *   '/internal/cache/clear',
 *   JSON.stringify(requestBody),
 *   process.env.INTERNAL_TOOLS_SECRET_KEY!
 * );
 *
 * const response = await fetch('http://control-plane:3000/internal/cache/clear', {
 *   method: 'POST',
 *   headers,
 *   body: JSON.stringify(requestBody),
 * });
 */
