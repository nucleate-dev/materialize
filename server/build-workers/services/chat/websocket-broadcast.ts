import WebSocket from "ws";
import { baseLogger } from "../../loggers/index.js";
import { ChatServerMessage } from "../../types/ChatTypes.js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { ChatConnection } from "./chat-engines/chat-engine.js";

/**
 * Broadcasts a message to all active WebSocket connections.
 * This allows multiple users connected to the same chat session to receive
 * the same events in real-time for collaborative editing.
 *
 * @param connections - Map of connection IDs to ChatConnection objects
 * @param message - The message to broadcast to all connections
 * @param logger - Optional logger to use for error logging. If not provided, uses baseLogger
 * @param excludeSocket - Optional WebSocket to exclude from the broadcast (e.g., the socket that triggered the event)
 */
export function broadcastToConnections(
  connections: Map<string, ChatConnection>,
  message: ChatServerMessage,
  logger?: SystemLogger,
  excludeSocket?: WebSocket,
): void {
  const loggerInstance = logger || baseLogger;
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const [connectionId, connection] of connections.entries()) {
    // Skip the excluded socket if provided
    if (excludeSocket && connection.socket === excludeSocket) {
      skippedCount++;
      continue;
    }

    if (connection.socket.readyState === WebSocket.OPEN) {
      try {
        connection.socket.send(JSON.stringify(message));
        successCount++;
      } catch (error) {
        failureCount++;
        loggerInstance.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to broadcast WebSocket message to connection",
          { connectionId },
        );
      }
    }
  }

  loggerInstance.consoleLogDevOnly(
    "info",
    "Broadcast message to connections",
    {
      messageType: message.type,
      totalConnections: connections.size,
      successCount,
      failureCount,
      skippedCount,
    },
  );
}
