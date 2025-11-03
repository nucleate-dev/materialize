import { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';

interface ChatMessage {
  type?: string;
  message?: string;
  imageUrl?: string;
  currentViewingPath?: string;
  prototype_id?: string;
  token?: string;
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
    // Authentication is performed per message based on prototype_id/token payload fields
    // Note: Schema validation doesn't work well with WebSocket routes, so we validate manually in the handler
    app.get(
      '/chat/v2/ws',
      { websocket: true },
      this.handleWebSocket.bind(this),
    );

    app.log.info(
      '[SandboxChatProxyService] WebSocket route registered successfully',
    );
  }

  private handleWebSocket(socket: WebSocket, request: FastifyRequest): void {
    // WebSocket upgrades might not trigger onRequest hook, so log2 might not be set
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log2 = (request as any).log2 || request.log;

    log2.info(
      {
        ip: request.ip,
        hasAuthHeader: !!request.headers?.authorization,
      },
      '[SandboxChatProxyService] WebSocket connection opened',
    );

    const decodeRawData = (data: WebSocket.RawData): string => {
      if (typeof data === 'string') {
        return data;
      }
      if (Buffer.isBuffer(data)) {
        return data.toString('utf8');
      }
      if (Array.isArray(data)) {
        return Buffer.concat(data).toString('utf8');
      }
      return Buffer.from(data as ArrayBuffer).toString('utf8');
    };

    try {
      socket.send(
        JSON.stringify({
          type: 'ready',
          message: 'Connection established',
        }),
      );
      log2.info('[SandboxChatProxyService] Sent ready event to client');
    } catch (error) {
      log2.error(error, '[SandboxChatProxyService] Failed to send ready event');
    }

    socket.on('message', async (rawData: WebSocket.RawData) => {
      const payload = decodeRawData(rawData);
      let data: ChatMessage;

      try {
        data = JSON.parse(payload) as ChatMessage;
      } catch (parseError) {
        log2.warn(
          {
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          },
          '[SandboxChatProxyService] Failed to parse incoming message',
        );
        socket.send(
          JSON.stringify({
            type: 'error',
            error: 'Invalid message format: expected JSON',
          }),
        );
        return;
      }

      try {
        const prototypeId =
          typeof data.prototype_id === 'string' ? data.prototype_id.trim() : '';
        if (!prototypeId) {
          log2.warn(
            {
              hasPrototypeId: !!data.prototype_id,
            },
            '[SandboxChatProxyService] Missing prototype_id in message',
          );
          socket.send(
            JSON.stringify({
              type: 'error',
              error: 'prototype_id is required on each message',
            }),
          );
          return;
        }

        const token = typeof data.token === 'string' ? data.token.trim() : '';
        if (!token) {
          log2.warn(
            {
              hasToken: !!data.token,
              prototype_id: prototypeId,
            },
            '[SandboxChatProxyService] Missing authentication token in message',
          );
          socket.send(
            JSON.stringify({
              type: 'error',
              error: 'token is required on each message',
            }),
          );
          return;
        }

        const messageText =
          typeof data.message === 'string' ? data.message.trim() : '';
        if (!messageText) {
          socket.send(
            JSON.stringify({
              type: 'error',
              error: 'message is required and cannot be empty',
            }),
          );
          return;
        }

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
          socket.close(1011, 'Authentication failed');
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
              error:
                'Unauthorized: You do not have edit access to this prototype',
            }),
          );
          socket.close(1008, 'Unauthorized');
          return;
        }

        const userId = authResult.user.id;

        log2.info(
          {
            prototype_id: prototypeId,
            userId,
            messageLength: messageText.length,
            hasImageUrl: !!data.imageUrl,
            hasCurrentViewingPath: !!data.currentViewingPath,
          },
          '[SandboxChatProxyService] Received chat message',
        );

        socket.send(
          JSON.stringify({
            type: 'message_received',
            prototype_id: prototypeId,
            timestamp: new Date().toISOString(),
          }),
        );
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

    socket.on('close', (code: number) => {
      log2.info('[SandboxChatProxyService] WebSocket connection closed', {
        code,
      });
    });

    socket.on('error', (error: Error) => {
      log2.error(error, '[SandboxChatProxyService] WebSocket error');
    });
  }

  // public attachWebSocket(
  //   sessionId: string,
  //   socket: WebSocket,
  //   options: {
  //     allowCreate?: boolean;
  //     defaultType?: TerminalSessionType;
  //   } = {},
  // ): void {
  //   const session =
  //     this.sessions.get(sessionId) ||
  //     (options.allowCreate
  //       ? this.getOrCreateTerminalSession(
  //           sessionId,
  //           options.defaultType ?? "generic",
  //         )
  //       : undefined);

  //   if (!session) {
  //     this.logger.warn(
  //       "Client connection rejected - terminal session not found",
  //       {
  //         sessionId,
  //         allowCreate: options.allowCreate,
  //         availableSessions: Array.from(this.sessions.keys()),
  //       },
  //     );
  //     const message = JSON.stringify({
  //       event: "error",
  //       data: { error: "Terminal session not found", sessionId },
  //     });
  //     try {
  //       socket.send(message);
  //     } catch (error) {
  //       this.logger.warn("Failed to send error message to client", {
  //         sessionId,
  //         error: error instanceof Error ? error.message : String(error),
  //       });
  //     } finally {
  //       socket.close(1008, "Terminal session not found");
  //     }
  //     return;
  //   }

  //   const clientId = uuidv4();
  //   const client: TerminalClient = {
  //     id: clientId,
  //     socket,
  //   };

  //   session.clients.set(clientId, client);

  //   const cleanup = (): void => {
  //     this.removeClient(session, clientId);
  //   };

  //   socket.on("close", (code: number, reason: Buffer) => {
  //     this.logger.warn("WebSocket closed", {
  //       sessionId,
  //       clientId,
  //       code,
  //       reason: reason.toString(),
  //     });
  //     cleanup();
  //   });

  //   socket.on("error", (error: Error) => {
  //     this.logger.warn("WebSocket error", {
  //       sessionId,
  //       clientId,
  //       error: error.message,
  //       stack: error.stack,
  //     });
  //     cleanup();
  //   });

  //   client.heartbeat = setInterval(() => {
  //     if (socket.readyState === WebSocket.OPEN) {
  //       this.sendWebSocketMessage(
  //         client,
  //         "heartbeat",
  //         session,
  //         { timestamp: Date.now() },
  //         Date.now(),
  //       );
  //     } else {
  //       cleanup();
  //     }
  //   }, HEARTBEAT_INTERVAL_MS);

  //   this.sendWebSocketMessage(
  //     client,
  //     "status",
  //     session,
  //     this.buildSessionSnapshot(session),
  //     Date.now(),
  //   );

  //   for (const event of session.buffer) {
  //     this.sendWebSocketMessage(
  //       client,
  //       event.type,
  //       session,
  //       { ...event.payload },
  //       event.timestamp,
  //     );
  //   }
  // }

  // private sendWebSocketMessage(
  //   timestamp: number,
  // ): void {
  //   try {
  //     const data = {
  //       timestamp,
  //     };
  //     const message = JSON.stringify({
  //       data,
  //     });
  //     if (socket.readyState === WebSocket.OPEN) {
  //       client.socket.send(message);
  //     }
  //   } catch (error) {
  //     this.logger.error(
  //       error instanceof Error ? error : new Error(String(error)),
  //       "Failed to send WebSocket message",
  //       { sessionId: session.id, eventType, error: JSON.stringify(error) },
  //     );
  //     this.removeClient(session, client.id);
  //   }
  // }
}
