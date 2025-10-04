import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import { authenticateInternalToolsRequest } from '../utils/internalToolsAuth.js';

interface BuildWorkerProxyRequestBody {
  endpoint: string;
  path: string;
  method: 'POST' | 'DELETE' | 'GET' | 'PUT';
  payload?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
}

interface BuildWorkerProxySuccessResponse {
  success: boolean;
  status: number;
  statusText: string;
  requestedUrl: string;
  durationMs: number;
  headers: Record<string, string>;
  data: unknown;
}

const ALLOWED_ROUTE_KEYS = new Set<`${string} ${string}`>([
  'POST /dev-server',
  'DELETE /dev-server',
  'POST /dev-server/restart',
  'POST /build-and-deploy',
  'POST /run-command',
  'POST /allocate',
]);

function normalizePath(path: string): string {
  if (!path) {
    return '/';
  }

  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

function buildTargetUrl(
  endpoint: string,
  path: string,
  query?: Record<string, string | number | boolean>,
): string {
  const base = new URL(endpoint);
  base.port = '3002';
  base.search = '';

  const normalizedPath = normalizePath(path);
  const finalUrl = new URL(
    normalizedPath,
    `${base.protocol}//${base.hostname}:${base.port}`,
  );

  if (base.pathname && base.pathname !== '/') {
    finalUrl.pathname = `${base.pathname.replace(/\/$/, '')}${normalizedPath}`;
  }

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      finalUrl.searchParams.set(key, String(value));
    }
  }

  return finalUrl.toString();
}

function sanitizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export class InternalBuildWorkerDevProxyService {
  public registerRoutes(app: FastifyInstance): void {
    app.post(
      '/internal/build-worker-dev/execute',
      {
        preHandler: authenticateInternalToolsRequest,
        schema: {
          description:
            'Proxy build worker requests through the control plane (requires internal tools authentication)',
          tags: ['internal-tools', 'build-worker'],
          headers: {
            type: 'object',
            required: ['x-internal-signature', 'x-internal-timestamp'],
            properties: {
              'x-internal-signature': { type: 'string' },
              'x-internal-timestamp': { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['endpoint', 'path', 'method'],
            properties: {
              endpoint: { type: 'string' },
              path: { type: 'string' },
              method: { type: 'string', enum: ['POST', 'DELETE', 'GET', 'PUT'] },
              payload: {},
              headers: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
              query: {
                type: 'object',
                additionalProperties: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'number' },
                    { type: 'boolean' },
                  ],
                },
              },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                status: { type: 'number' },
                statusText: { type: 'string' },
                requestedUrl: { type: 'string' },
                durationMs: { type: 'number' },
                headers: { type: 'object' },
                data: {},
              },
            },
          },
        },
      },
      this.handleProxyRequest.bind(this),
    );
  }

  private async handleProxyRequest(
    request: FastifyRequest<{ Body: BuildWorkerProxyRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { endpoint, path, method, payload, headers, query } = request.body;
    const log = request.log2.child({
      service: 'internal-services',
      route: 'build-worker-dev-proxy',
    });

    try {
      if (!endpoint || typeof endpoint !== 'string') {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: 'endpoint is required and must be a string',
        });
      }

      if (!path || typeof path !== 'string') {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: 'path is required and must be a string',
        });
      }

      const normalizedMethod = method?.toUpperCase() as BuildWorkerProxyRequestBody['method'];
      if (!normalizedMethod || !['POST', 'DELETE', 'GET', 'PUT'].includes(normalizedMethod)) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: 'method must be one of POST, DELETE, GET, or PUT',
        });
      }

      const routeKey = `${normalizedMethod} ${normalizePath(path)}` as `${string} ${string}`;
      if (!ALLOWED_ROUTE_KEYS.has(routeKey)) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: 'Requested route is not allowed for build worker proxying.',
          details: 'Refer to the build worker README for supported routes.',
        });
      }

      let targetUrl: string;
      try {
        targetUrl = buildTargetUrl(endpoint, path, query);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Bad Request',
          message: `Invalid endpoint provided: ${err.message}`,
        });
      }

      const sanitizedHeaders = sanitizeHeaders(headers);
      const fetchHeaders: Record<string, string> = sanitizedHeaders ? { ...sanitizedHeaders } : {};

      let body: string | undefined;
      if (payload !== undefined) {
        body = JSON.stringify(payload);
        if (!fetchHeaders['Content-Type']) {
          fetchHeaders['Content-Type'] = 'application/json';
        }
      }

      log.info('Proxying build worker request', {
        method: normalizedMethod,
        path,
        targetUrl,
      });

      const startedAt = performance.now();
      const controller = AbortSignal.timeout(30_000);
      let response: Response;
      try {
        response = await fetch(targetUrl, {
          method: normalizedMethod,
          headers: fetchHeaders,
          body,
          signal: controller,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error(err, 'Failed to reach build worker endpoint', { targetUrl });
        const isTimeout = err.name === 'TimeoutError';
        return reply
          .status(
            isTimeout
              ? HTTP_STATUS.GATEWAY_TIMEOUT
              : HTTP_STATUS.BAD_GATEWAY,
          )
          .send({
            error: isTimeout
              ? 'BuildWorkerTimeout'
              : 'BuildWorkerUnreachable',
            message: `Failed to reach build worker endpoint: ${err.message}`,
          });
      }

      const durationMs = performance.now() - startedAt;

      let responseBody: unknown = null;
      const rawText = await response.text();
      try {
        responseBody = rawText ? JSON.parse(rawText) : null;
      } catch {
        responseBody = rawText;
      }

      const headersObject = Object.fromEntries(response.headers.entries());

      const payloadResponse: BuildWorkerProxySuccessResponse = {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        requestedUrl: targetUrl,
        durationMs,
        headers: headersObject,
        data: responseBody,
      };

      log.info('Build worker request completed', {
        status: response.status,
        durationMs,
      });

      return reply.status(HTTP_STATUS.OK).send(payloadResponse);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(err, 'Unexpected error while proxying build worker request');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: 'InternalServerError',
        message: err.message,
      });
    }
  }
}
