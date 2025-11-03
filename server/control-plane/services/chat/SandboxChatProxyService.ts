import { FastifyInstance, FastifyRequest } from 'fastify';
import type WebSocket from 'ws';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';

interface ChatMessage {
  message: string;
  imageUrl?: string;
  currentViewingPath?: string;
  prototype_id: string;
}

export class SandboxChatProxyService {
  private fastifyApp: FastifyInstance;

  constructor(fastifyApp: FastifyInstance) {
    this.fastifyApp = fastifyApp;
  }

  public registerRoutes(app: FastifyInstance): void {
    // WebSocket route for Claude Code chat
    app.get(
      '/chat/v2/ws',
      { websocket: true },
      this.handleWebSocket.bind(this),
    );
  }

  private async handleWebSocket(
    socket: WebSocket,
    request: FastifyRequest,
  ): Promise<void> {
    const log2 = (request as any).log2 as SystemLogger;

    log2.info('[ClaudeCodeChatService] WebSocket connection attempt', {
      url: request.url,
    });

    // Extract JWT token from query params or headers
    const token =
      ((request.query as any)?.token as string) ||
      request.headers?.authorization?.split(' ')[1];

    // Keep track of whether we've authenticated yet
    let isAuthenticated = false;
    let prototypeId: string | null = null;

    socket.on('message', async (rawData: Buffer) => {
      try {
        const data = JSON.parse(rawData.toString()) as ChatMessage;

        // Validate required fields
        if (!data.prototype_id) {
          socket.send(
            JSON.stringify({
              type: 'error',
              error: 'prototype_id is required',
            }),
          );
          return;
        }

        // Authenticate on first message or if prototype_id changes
        if (!isAuthenticated || prototypeId !== data.prototype_id) {
          prototypeId = data.prototype_id;

          // Verify user has edit access to the prototype
          const authResult = await checkUserHasPrototypeEditAccess(
            data.prototype_id,
            token,
            log2,
          );

          if (
            !authResult ||
            !authResult.user ||
            !authResult.prototype ||
            !authResult.canEdit
          ) {
            log2.warn('[ClaudeCodeChatService] Unauthorized access attempt', {
              prototype_id: data.prototype_id,
              hasAuthResult: !!authResult,
              hasUser: !!authResult?.user,
              hasPrototype: !!authResult?.prototype,
              canEdit: authResult?.canEdit,
            });

            socket.send(
              JSON.stringify({
                type: 'error',
                error:
                  'Unauthorized: You do not have edit access to this prototype',
              }),
            );
            socket.close();
            return;
          }

          isAuthenticated = true;
          log2.info('[ClaudeCodeChatService] User authenticated successfully', {
            userId: authResult.user.id,
            prototype_id: data.prototype_id,
          });

          socket.send(
            JSON.stringify({
              type: 'authenticated',
              prototype_id: data.prototype_id,
            }),
          );
        }

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

        log2.info('[ClaudeCodeChatService] Received chat message', {
          prototype_id: data.prototype_id,
          messageLength: data.message.length,
          hasImageUrl: !!data.imageUrl,
          hasCurrentViewingPath: !!data.currentViewingPath,
        });

        // TODO: Connect to Fargate WebSocket and forward the message
        // This is where we'll establish a WebSocket connection to the Fargate container
        // running the user's prototype and forward all messages bidirectionally

        // For now, send an acknowledgment
        socket.send(
          JSON.stringify({
            type: 'message_received',
            prototype_id: data.prototype_id,
            timestamp: new Date().toISOString(),
          }),
        );

        // TODO: Forward response from Fargate WebSocket back to client
      } catch (error) {
        log2.error(error, '[ClaudeCodeChatService] Error processing message');
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
      log2.info('[ClaudeCodeChatService] WebSocket connection closed', {
        prototype_id: prototypeId,
      });
      // TODO: Clean up Fargate WebSocket connection if it exists
    });

    socket.on('error', (error: Error) => {
      log2.error(error, '[ClaudeCodeChatService] WebSocket error', {
        prototype_id: prototypeId,
      });
      // TODO: Clean up Fargate WebSocket connection if it exists
    });

    // Send initial connection success message
    socket.send(
      JSON.stringify({
        type: 'connected',
        message:
          'WebSocket connection established. Please authenticate by sending a message with prototype_id.',
      }),
    );
  }
}
