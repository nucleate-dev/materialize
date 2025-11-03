import { FastifyInstance, FastifyRequest } from 'fastify';
import type WebSocket from 'ws';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { checkUserHasPrototypeEditAccess } from '../../utils/prototypeAuth.js';

interface ChatMessage {
  message: string;
  imageUrl?: string;
  currentViewingPath?: string;
}

export class SandboxChatProxyService {
  private fastifyApp: FastifyInstance;

  constructor(fastifyApp: FastifyInstance) {
    this.fastifyApp = fastifyApp;
  }

  public registerRoutes(app: FastifyInstance): void {
    // WebSocket route for Claude Code chat
    // Required query params: prototype_id
    // Required header: Authorization (Bearer token)
    app.get(
      '/chat/v2/ws',
      {
        websocket: true,
        schema: {
          querystring: {
            type: 'object',
            required: ['prototype_id'],
            properties: {
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleWebSocket.bind(this),
    );
  }

  private async handleWebSocket(
    socket: WebSocket,
    request: FastifyRequest,
  ): Promise<void> {
    const log2 = (request as any).log2 as SystemLogger;

    log2.info('[SandboxChatProxyService] WebSocket connection attempt', {
      url: request.url,
    });

    // Extract prototype_id from query params (validated by Fastify schema)
    const prototypeId = (request.query as any).prototype_id as string;
    const token = request.headers?.authorization?.split(' ')[1];

    // Authenticate and authorize user immediately
    const authResult = await checkUserHasPrototypeEditAccess(
      prototypeId,
      token,
      log2,
    );

    if (
      !authResult ||
      !authResult.user ||
      !authResult.prototype ||
      !authResult.canEdit
    ) {
      log2.warn('[SandboxChatProxyService] Unauthorized access attempt', {
        prototype_id: prototypeId,
        hasAuthResult: !!authResult,
        hasUser: !!authResult?.user,
        hasPrototype: !!authResult?.prototype,
        canEdit: authResult?.canEdit,
      });

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
    log2.info('[SandboxChatProxyService] User authenticated successfully', {
      userId,
      prototype_id: prototypeId,
    });

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

        log2.info('[SandboxChatProxyService] Received chat message', {
          prototype_id: prototypeId,
          userId,
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
      log2.info('[SandboxChatProxyService] WebSocket connection closed', {
        prototype_id: prototypeId,
        userId,
      });
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
