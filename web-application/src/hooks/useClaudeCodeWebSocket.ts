import { supabase } from "@/ClientConstants";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseClaudeCodeWebSocketProps {
  prototypeId: string;
  baseTunnelUrl: string | null;
  onMessage?: (message: any) => void;
  autoConnect?: boolean;
}

interface UseClaudeCodeWebSocketReturn {
  ws: WebSocket | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (type: string, data: any) => void;
  sendSyncFiles: (
    prototypeId: string,
    filenames?: string[],
    assetNames?: string[],
  ) => Promise<void>;
}

export function useClaudeCodeWebSocket({
  prototypeId,
  baseTunnelUrl,
  onMessage,
  autoConnect = false,
}: UseClaudeCodeWebSocketProps): UseClaudeCodeWebSocketReturn {
  const logger = useProductLogger();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const authTokenRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(async () => {
    try {
      authTokenRef.current = null;

      // Get authentication token
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        logger.debug("error", "Not authenticated. Please log in.");
        return;
      }

      const token = session.session.access_token;
      authTokenRef.current = token;

      const finalTunnelUrlBase =
        process.env.FARGATE_DEV_MODE === "true"
          ? (process.env.NEXT_PUBLIC_INTERNAL_BUILD_WORKERS_SERVER_ENDPOINT ??
            null)
          : baseTunnelUrl;

      if (!finalTunnelUrlBase) {
        logger.debug("error", "Base tunnel URL not available");
        return;
      }

      const wsUrl = `${finalTunnelUrlBase}/code/ws/${prototypeId}`;
      logger.debug("log", "Connecting to Claude Code WebSocket", { wsUrl });

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setIsConnected(true);
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
        setWs(null);
        logger.debug("log", "Claude Code WebSocket closed", {
          code: event.code,
          reason: event.reason,
        });
      };

      websocket.onerror = (error) => {
        logger.debug("error", "Claude Code WebSocket error", { error });
      };

      setWs(websocket);
    } catch (error) {
      authTokenRef.current = null;
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
    (type: string, data: any) => {
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

  const sendSyncFiles = useCallback(
    async (prototypeId: string, filenames?: string[], assetNames?: string[]) => {
      if (!ws || !isConnected) {
        logger.debug("warn", "Cannot send sync_files: WebSocket not connected");
        return;
      }

      // Refresh JWT token before syncing files
      try {
        const { data: session } = await supabase.auth.getSession();
        if (session.session?.access_token) {
          authTokenRef.current = session.session.access_token;
        }
      } catch (error) {
        logger.debug("warn", "Failed to refresh token for sync_files", { error });
        // Continue with existing token if refresh fails
      }

      logger.debug("log", "Sending sync_files message", {
        prototypeId,
        filenames,
        assetNames,
        hasToken: !!authTokenRef.current,
      });

      sendMessage("sync_files", {
        prototypeId,
        filenames: filenames || [],
        assetNames: assetNames || [],
        token: authTokenRef.current, // Include JWT token for Supabase authentication
      });
    },
    [ws, isConnected, sendMessage, logger],
  );

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && prototypeId && baseTunnelUrl) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, prototypeId, baseTunnelUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ws,
    isConnected,
    connect,
    disconnect,
    sendMessage,
    sendSyncFiles,
  };
}
