import { FastifyInstance, FastifyRequest } from 'fastify';
import type WebSocket from 'ws';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';

interface ChatMessage {
  message: string;
  imageUrl?: string;
  currentViewingPath?: string;
}

interface ChatQueryString {
  prototype_id: string;
  token?: string; // Optional token for browser clients that can't set headers
}

export class SandboxChatProxyService {
  private fastifyApp: FastifyInstance;

  constructor(fastifyApp: FastifyInstance) {
    this.fastifyApp = fastifyApp;
  }

  public registerRoutes(app: FastifyInstance): void {
    app.log.info(
      '[SandboxChatProxyService] Registering WebSocket route: /chat/v2/ws',
    );

    // WebSocket route for Claude Code chat
    // Supports both query params and path params for prototype_id/token
    // Note: Schema validation doesn't work well with WebSocket routes, so we validate manually in the handler
    app.get(
      '/chat/v2/ws',
      { websocket: true },
      this.handleWebSocket.bind(this),
    );
    app.get(
      '/chat/v2/ws/:prototypeId/:token',
      { websocket: true },
      this.handleWebSocket.bind(this),
    );

    app.log.info(
      '[SandboxChatProxyService] WebSocket route registered successfully',
    );
  }

  private async handleWebSocket(
    socket: WebSocket,
    request: FastifyRequest<{
      Querystring: ChatQueryString;
      Params: { prototypeId?: string; token?: string };
    }>,
  ): Promise<void> {
    // WebSocket upgrades might not trigger onRequest hook, so log2 might not be set
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log2 = (request as any).log2 || request.log;

    // Parse query string manually since Fastify doesn't parse it for WebSocket routes
    const rawUrl =
      typeof request.raw?.url === 'string' ? request.raw.url : undefined;
    const fastifyUrl =
      typeof request.url === 'string' ? request.url : undefined;
    const urlToParse = rawUrl || fastifyUrl || '';

    const urlParts = urlToParse.split('?');
    const queryString = urlParts.length > 1 ? urlParts[1] : '';
    const queryParams = new URLSearchParams(queryString);
    const fastifyQuery =
      (request.query as Partial<ChatQueryString> | undefined) ?? undefined;
    const params = request.params ?? {};

    log2.info(
      {
        url: urlToParse,
        queryString,
        hasAuthHeader: !!request.headers?.authorization,
        rawUrl: rawUrl ?? null,
        fastifyUrl,
        routerPath: (request as { routerPath?: string }).routerPath ?? null,
        fastifyQuery,
        headers: {
          host: request.headers?.host,
          origin: request.headers?.origin,
          xForwardedHost: request.headers?.['x-forwarded-host'],
          xForwardedFor: request.headers?.['x-forwarded-for'],
          xForwardedProto: request.headers?.['x-forwarded-proto'],
          xForwardedUri: request.headers?.['x-forwarded-uri'],
        },
        params: {
          prototypeId: params?.prototypeId,
          hasToken: params?.token ? true : false,
        },
      },
      '[SandboxChatProxyService] WebSocket connection attempt',
    );

    // Extract prototype_id from manually parsed query params
    const prototypeId =
      queryParams.get('prototype_id') ??
      fastifyQuery?.prototype_id ??
      (typeof params.prototypeId === 'string'
        ? params.prototypeId
        : undefined) ??
      undefined;

    // Extract JWT token from Authorization header or query params (for browser clients)
    const token =
      request.headers?.authorization?.split(' ')[1] ||
      queryParams.get('token') ||
      fastifyQuery?.token ||
      (typeof params.token === 'string' ? params.token : undefined) ||
      undefined;

    // Manual validation since schema validation doesn't work well with WebSocket routes
    if (!prototypeId) {
      log2.warn(
        {
          queryString,
          fastifyQuery,
          rawUrl: rawUrl ?? null,
          fastifyUrl,
          headers: {
            host: request.headers?.host,
            origin: request.headers?.origin,
            xForwardedHost: request.headers?.['x-forwarded-host'],
            xForwardedFor: request.headers?.['x-forwarded-for'],
            xForwardedProto: request.headers?.['x-forwarded-proto'],
            xForwardedUri: request.headers?.['x-forwarded-uri'],
          },
          params: {
            prototypeId: params?.prototypeId,
            hasToken: params?.token ? true : false,
          },
        },
        '[SandboxChatProxyService] Missing required parameter: prototype_id',
      );
      try {
        socket.send(
          JSON.stringify({
            type: 'error',
            error: 'Missing required query parameter: prototype_id',
          }),
        );
      } catch {
        // Socket might not be open yet
      }
      socket.close(1008, 'Missing prototype_id');
      return;
    }

    if (!token) {
      log2.warn(
        {
          prototype_id: prototypeId,
          queryString,
          fastifyQuery,
          rawUrl: rawUrl ?? null,
          fastifyUrl,
          headers: {
            host: request.headers?.host,
            origin: request.headers?.origin,
            xForwardedHost: request.headers?.['x-forwarded-host'],
            xForwardedFor: request.headers?.['x-forwarded-for'],
            xForwardedProto: request.headers?.['x-forwarded-proto'],
            xForwardedUri: request.headers?.['x-forwarded-uri'],
          },
          params: {
            prototypeId: params?.prototypeId,
            hasToken: params?.token ? true : false,
          },
        },
        '[SandboxChatProxyService] Missing authentication token',
      );
      try {
        socket.send(
          JSON.stringify({
            type: 'error',
            error: 'Missing authentication token',
          }),
        );
      } catch {
        // Socket might not be open yet
      }
      socket.close(1008, 'Missing token');
      return;
    }

    log2.info(
      {
        prototypeId,
        hasToken: !!token,
        tokenLength: token?.length,
      },
      '[SandboxChatProxyService] Extracted connection params',
    );

    // Authenticate and authorize user immediately
    let authResult;
    try {
      authResult = await checkUserHasPrototypeEditAccess(
        prototypeId,
        token,
        log2,
      );
    } catch (error) {
      log2.error(error, '[SandboxChatProxyService] Authentication error', {
        prototype_id: prototypeId,
      });
      socket.send(
        JSON.stringify({
          type: 'error',
          error: 'Authentication failed',
        }),
      );
      socket.close();
      return;
    }

    if (
      !authResult ||
      !authResult.user ||
      !authResult.prototype ||
      !authResult.canEdit
    ) {
      log2.warn(
        {
          prototype_id: prototypeId,
          hasAuthResult: !!authResult,
          hasUser: !!authResult?.user,
          hasPrototype: !!authResult?.prototype,
          canEdit: authResult?.canEdit,
        },
        '[SandboxChatProxyService] Unauthorized access attempt',
      );

      socket.send(
        JSON.stringify({
          type: 'error',
          error: 'Unauthorized: You do not have edit access to this prototype',
        }),
      );
      socket.close();
      return;
    }

    // Authentication successful
    const userId = authResult.user.id;
    log2.info(
      {
        userId,
        prototype_id: prototypeId,
      },
      '[SandboxChatProxyService] User authenticated successfully',
    );

    // Set up message handler (only if authenticated)
    socket.on('message', async (rawData: Buffer) => {
      try {
        const data = JSON.parse(rawData.toString()) as ChatMessage;

        // Validate message field
        if (!data.message || data.message.trim() === '') {
          socket.send(
            JSON.stringify({
              type: 'error',
              error: 'message is required and cannot be empty',
            }),
          );
          return;
        }

        log2.info(
          {
            prototype_id: prototypeId,
            userId,
            messageLength: data.message.length,
            hasImageUrl: !!data.imageUrl,
            hasCurrentViewingPath: !!data.currentViewingPath,
          },
          '[SandboxChatProxyService] Received chat message',
        );

        // TODO: Connect to Fargate WebSocket and forward the message
        // This is where we'll establish a WebSocket connection to the Fargate container
        // running the user's prototype and forward all messages bidirectionally

        // For now, send an acknowledgment
        socket.send(
          JSON.stringify({
            type: 'message_received',
            prototype_id: prototypeId,
            timestamp: new Date().toISOString(),
          }),
        );

        // TODO: Forward response from Fargate WebSocket back to client
      } catch (error) {
        log2.error(error, '[SandboxChatProxyService] Error processing message');
        socket.send(
          JSON.stringify({
            type: 'error',
            error:
              error instanceof Error
                ? error.message
                : 'Failed to process message',
          }),
        );
      }
    });

    socket.on('close', () => {
      log2.info(
        {
          prototype_id: prototypeId,
          userId,
        },
        '[SandboxChatProxyService] WebSocket connection closed',
      );
      // TODO: Clean up Fargate WebSocket connection if it exists
    });

    socket.on('error', (error: Error) => {
      log2.error(error, '[SandboxChatProxyService] WebSocket error', {
        prototype_id: prototypeId,
        userId,
      });
      // TODO: Clean up Fargate WebSocket connection if it exists
    });
  }
}
