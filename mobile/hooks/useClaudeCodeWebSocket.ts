import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  ChatServerMessage,
  ChatClientMessage,
  ChatEvent,
  ChatClientEvent,
  ChatQueryData,
} from '../lib/types/ChatTypes';

interface UseClaudeCodeWebSocketProps {
  prototypeId: string | undefined;
  baseTunnelUrl: string | null;
  onMessage?: (message: ChatServerMessage) => void;
  onConnectionChange?: (isConnected: boolean) => void;
}

interface UseClaudeCodeWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendQuery: (data: ChatQueryData) => void;
  sendInterrupt: () => void;
  sendHistoryResponse: (data: {
    historical_messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
    original_query: ChatQueryData;
  }) => void;
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff

export function useClaudeCodeWebSocket({
  prototypeId,
  baseTunnelUrl,
  onMessage,
  onConnectionChange,
}: UseClaudeCodeWebSocketProps): UseClaudeCodeWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isManualDisconnectRef = useRef(false);
  const messageQueueRef = useRef<ChatClientMessage[]>([]);

  // Notify parent of connection changes
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!prototypeId || !baseTunnelUrl) {
      setConnectionError('Missing prototype ID or tunnel URL');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    if (isConnecting) {
      console.log('[WebSocket] Connection already in progress');
      return;
    }

    try {
      setIsConnecting(true);
      setConnectionError(null);
      isManualDisconnectRef.current = false;

      // Get authentication token
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        setConnectionError('Not authenticated');
        setIsConnecting(false);
        return;
      }

      const token = session.session.access_token;
      authTokenRef.current = token;

      // Build WebSocket URL
      // Convert https:// to wss:// or http:// to ws://
      const wsProtocol = baseTunnelUrl.startsWith('https') ? 'wss' : 'ws';
      const wsHost = baseTunnelUrl.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProtocol}://${wsHost}/code/ws/${prototypeId}`;

      console.log('[WebSocket] Connecting to:', wsUrl);

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionError(null);
        reconnectAttemptRef.current = 0;

        // Send any queued messages
        while (messageQueueRef.current.length > 0) {
          const queuedMessage = messageQueueRef.current.shift();
          if (queuedMessage && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify(queuedMessage));
          }
        }
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ChatServerMessage;
          onMessage?.(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      websocket.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;
        authTokenRef.current = null;

        // Auto-reconnect if not manually disconnected
        if (!isManualDisconnectRef.current && prototypeId && baseTunnelUrl) {
          const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptRef.current++;
            connect();
          }, delay);
        }
      };

      websocket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setConnectionError('Connection error');
        setIsConnecting(false);
      };

      wsRef.current = websocket;
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnecting(false);
      authTokenRef.current = null;
    }
  }, [prototypeId, baseTunnelUrl, onMessage, isConnecting]);

  const disconnect = useCallback(() => {
    console.log('[WebSocket] Manual disconnect');
    isManualDisconnectRef.current = true;
    clearReconnectTimeout();

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    authTokenRef.current = null;
    messageQueueRef.current = [];
  }, [clearReconnectTimeout]);

  const sendMessage = useCallback((message: ChatClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is restored
      console.log('[WebSocket] Queueing message (not connected)');
      messageQueueRef.current.push(message);
    }
  }, []);

  const sendQuery = useCallback((data: ChatQueryData) => {
    // Include auth token in query
    const queryWithToken: ChatQueryData = {
      ...data,
      token: authTokenRef.current || undefined,
    };

    sendMessage({
      type: ChatClientEvent.QUERY,
      data: queryWithToken,
    });
  }, [sendMessage]);

  const sendInterrupt = useCallback(() => {
    sendMessage({
      type: ChatClientEvent.INTERRUPT,
    });
  }, [sendMessage]);

  const sendHistoryResponse = useCallback((data: {
    historical_messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
    original_query: ChatQueryData;
  }) => {
    sendMessage({
      type: ChatClientEvent.HISTORY_RESPONSE,
      data,
    });
  }, [sendMessage]);

  // Auto-connect when baseTunnelUrl becomes available
  const prevBaseTunnelUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const wasNull = prevBaseTunnelUrlRef.current === null;
    const isNowValid = baseTunnelUrl !== null;

    if (wasNull && isNowValid && !isConnected && !isConnecting && prototypeId) {
      console.log('[WebSocket] baseTunnelUrl became available, auto-connecting');
      connect();
    }

    prevBaseTunnelUrlRef.current = baseTunnelUrl;
  }, [baseTunnelUrl, isConnected, isConnecting, prototypeId, connect]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && !isConnected && !isConnecting && prototypeId && baseTunnelUrl) {
        console.log('[WebSocket] App became active, reconnecting');
        connect();
      } else if (nextAppState === 'background') {
        // Optionally disconnect when going to background to save resources
        // For now, we'll keep the connection alive
        console.log('[WebSocket] App going to background');
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isConnected, isConnecting, prototypeId, baseTunnelUrl, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimeout]);

  return {
    isConnected,
    isConnecting,
    connectionError,
    connect,
    disconnect,
    sendQuery,
    sendInterrupt,
    sendHistoryResponse,
  };
}
