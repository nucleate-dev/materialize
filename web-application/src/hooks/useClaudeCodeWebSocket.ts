import { supabase } from "@/ClientConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { useCallback, useEffect, useRef, useState } from "react";

interface ClaudeCodeMessage {
  type: string;
  data: unknown;
}

interface UseClaudeCodeWebSocketProps {
  prototypeId: string;
  baseTunnelUrl: string | null;
  onMessage?: (message: ClaudeCodeMessage) => void;
}

interface UseClaudeCodeWebSocketReturn {
  ws: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (type: string, data: unknown) => void;
}

export function useClaudeCodeWebSocket({
  prototypeId,
  baseTunnelUrl,
  onMessage,
}: UseClaudeCodeWebSocketProps): UseClaudeCodeWebSocketReturn {
  const logger = useProductLogger();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const authTokenRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(async () => {
    try {
      setIsConnecting(true);
      authTokenRef.current = null;

      // Get authentication token
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        logger.debug("error", "Not authenticated. Please log in.");
        setIsConnecting(false);
        return;
      }

      const token = session.session.access_token;
      authTokenRef.current = token;

      if (!baseTunnelUrl) {
        logger.debug("error", "Base tunnel URL not available");
        setIsConnecting(false);
        return;
      }

      const wsUrl = `${baseTunnelUrl}/code/ws/${prototypeId}`;
      logger.debug("log", "Connecting to Claude Code WebSocket", { wsUrl });

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        logger.debug("log", "Claude Code WebSocket connected");
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (onMessage) {
            onMessage(message);
          }
        } catch (error) {
          logger.debug("error", "Failed to parse WebSocket message", {
            error,
          });
        }
      };

      websocket.onclose = (event) => {
        authTokenRef.current = null;
        setIsConnected(false);
        setIsConnecting(false);
        setWs(null);
        logger.debug("log", "Claude Code WebSocket closed", {
          code: event.code,
          reason: event.reason,
        });
      };

      websocket.onerror = (error) => {
        setIsConnecting(false);
        logger.debug("error", "Claude Code WebSocket error", { error });
      };

      setWs(websocket);
    } catch (error) {
      authTokenRef.current = null;
      setIsConnecting(false);
      logger.debug("error", "Failed to connect to Claude Code WebSocket", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [prototypeId, baseTunnelUrl, onMessage, logger]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (ws) {
      ws.close();
      setWs(null);
      setIsConnected(false);
      authTokenRef.current = null;
    }
  }, [ws]);

  const sendMessage = useCallback(
    (type: string, data: unknown) => {
      if (!ws || !isConnected) {
        logger.debug("warn", "Cannot send message: WebSocket not connected");
        return;
      }

      try {
        ws.send(
          JSON.stringify({
            type,
            data,
          }),
        );
      } catch (error) {
        logger.debug("error", "Failed to send WebSocket message", { error });
      }
    },
    [ws, isConnected, logger],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Close WebSocket directly to avoid stale closure issues
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Access ws from the closure - this will have the latest value
      if (ws) {
        logger.debug("log", "Cleaning up WebSocket on unmount");
        ws.close(1000, "Component unmounting");
      }
    };
  }, [ws, logger]); // Include dependencies to avoid stale closures

  // Handle page refresh/navigation - close WebSocket before page unloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        logger.debug("log", "Closing WebSocket before page unload");
        ws.close(1000, "Page unloading");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [ws, logger]);

  // Auto-connect when baseTunnelUrl becomes available (transitions from null to valid)
  // This fixes the race condition where the component loads before baseTunnelUrl is fetched
  const prevBaseTunnelUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const wasNull = prevBaseTunnelUrlRef.current === null;
    const isNowValid = baseTunnelUrl !== null;

    // If baseTunnelUrl just became available and we're not already connected, connect
    if (wasNull && isNowValid && !isConnected && prototypeId) {
      logger.debug("log", "baseTunnelUrl became available, auto-connecting", {
        baseTunnelUrl,
      });
      connect();
    }

    prevBaseTunnelUrlRef.current = baseTunnelUrl;
  }, [baseTunnelUrl, isConnected, prototypeId, connect, logger]);

  return {
    ws,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMessage,
  };
}
