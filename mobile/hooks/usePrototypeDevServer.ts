import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import {
  APIResponse,
  BuildStatus,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  StartDevServerRequestBody,
  StartDevServerSuccessResponse,
  StandardErrorResponse,
} from '../lib/types/serverAPITypes';

const SERVER_ENDPOINT = process.env.EXPO_PUBLIC_SERVER_ENDPOINT;

export type RenderStatus =
  | 'Static build'
  | 'Connecting..'
  | 'Updating..'
  | 'Starting Dev Server..'
  | 'Disconnected'
  | 'Connected'
  | 'Error';

interface UsePrototypeDevServerProps {
  prototypeId: string | undefined;
}

interface UsePrototypeDevServerReturn {
  viewingUrl: string | null;
  baseTunnelUrl: string | null;
  renderStatus: RenderStatus;
  isLoading: boolean;
  error: string | null;
  startDevServer: () => Promise<void>;
  refetch: () => void;
}

/**
 * Hook that manages the prototype dev server lifecycle, following the exact same flow as the web app.
 *
 * Flow:
 * 1. Fetch viewing URL to check current status
 * 2. If editable instance exists, use its terminal URL
 * 3. If static build, start dev server to get a new instance
 * 4. Return baseTunnelUrl for WebSocket connection
 */
export function usePrototypeDevServer({
  prototypeId,
}: UsePrototypeDevServerProps): UsePrototypeDevServerReturn {
  const session = useAuthStore((state) => state.session);

  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [baseTunnelUrl, setBaseTunnelUrl] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>('Static build');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shouldTriggerInitialFetch, setShouldTriggerInitialFetch] = useState(true);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear poll timer
  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Fetch viewing URL from server
  const fetchViewingUrl = useCallback(async (): Promise<{
    viewingUrl: string | null;
    terminalUrl: string | null;
    source: 'editable_instance' | 'static_build' | null;
    status: BuildStatus | null;
  } | null> => {
    if (!prototypeId || !session?.access_token) return null;

    try {
      const response = await fetch(
        `${SERVER_ENDPOINT}/prototype/fetch-viewing-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            prototype_id: prototypeId,
            current_page: 'edit',
          } as FetchViewingUrlRequestBody),
        }
      );

      const result: APIResponse<FetchViewingUrlSuccessResponse, StandardErrorResponse> =
        await response.json();

      if (!response.ok || result.error) {
        console.error('[usePrototypeDevServer] Failed to fetch viewing URL:', result.error);
        return null;
      }

      return {
        viewingUrl: result.data.viewing_url,
        terminalUrl: result.data.terminal_url,
        source: result.data.source,
        status: result.data.status,
      };
    } catch (err) {
      console.error('[usePrototypeDevServer] Error fetching viewing URL:', err);
      return null;
    }
  }, [prototypeId, session?.access_token]);

  // Start dev server
  const startDevServer = useCallback(async () => {
    if (!prototypeId || !session?.access_token) {
      setError('Missing prototype ID or authentication');
      return;
    }

    try {
      setRenderStatus('Starting Dev Server..');
      setError(null);

      const response = await fetch(
        `${SERVER_ENDPOINT}/files/start-dev-server`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            prototype_id: prototypeId,
          } as StartDevServerRequestBody),
        }
      );

      // 409 means dev server is already starting from another request
      if (response.status === 409) {
        console.log('[usePrototypeDevServer] Dev server already starting');
        return;
      }

      if (!response.ok) {
        setRenderStatus('Error');
        setError('Failed to start dev server');
        return;
      }

      const result: APIResponse<StartDevServerSuccessResponse, StandardErrorResponse> =
        await response.json();

      if (!result.data || !result.data.viewing_url) {
        setRenderStatus('Error');
        setError('No viewing URL returned');
        return;
      }

      setViewingUrl(result.data.viewing_url);
      if (result.data.terminal_url) {
        setBaseTunnelUrl(result.data.terminal_url);
      }
      setRenderStatus('Connected');
    } catch (err) {
      console.error('[usePrototypeDevServer] Error starting dev server:', err);
      setRenderStatus('Error');
      setError(err instanceof Error ? err.message : 'Failed to start dev server');
    }
  }, [prototypeId, session?.access_token]);

  // Main effect: fetch viewing URL and start dev server if needed
  // This mirrors the web app's fetchPrototypeAndStartDevServer logic
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchAndStartDevServer() {
      if (!prototypeId || !session?.access_token || !shouldTriggerInitialFetch) {
        return;
      }

      setIsLoading(true);
      setError(null);

      // Step 1: Fetch current viewing URL
      const fetchResult = await fetchViewingUrl();

      if (!fetchResult) {
        setIsLoading(false);
        setShouldTriggerInitialFetch(false);
        return;
      }

      setViewingUrl(fetchResult.viewingUrl);

      // Step 2: Check if we already have an editable instance
      if (fetchResult.terminalUrl && fetchResult.terminalUrl !== baseTunnelUrl) {
        setBaseTunnelUrl(fetchResult.terminalUrl);
      }

      // Check if we have an active editable instance
      const isEditableInstance =
        fetchResult.source === 'editable_instance' &&
        fetchResult.viewingUrl &&
        (fetchResult.viewingUrl.includes('ngrok') ||
          fetchResult.viewingUrl.includes('sandbox') ||
          fetchResult.viewingUrl.includes('build.nucleate.dev') ||
          fetchResult.viewingUrl.includes('19006'));

      if (isEditableInstance) {
        setRenderStatus('Connecting..');
        setIsLoading(false);
        setShouldTriggerInitialFetch(false);
        return;
      }

      // Check if dev server is already starting
      if (
        fetchResult.status === 'updating' ||
        fetchResult.status === 'creating'
      ) {
        setRenderStatus('Starting Dev Server..');
        setIsLoading(false);
        setShouldTriggerInitialFetch(false);
        return;
      }

      // Step 3: Static build - need to start dev server
      setRenderStatus('Static build');
      setShouldTriggerInitialFetch(false);

      // Start the dev server
      await startDevServer();
      setIsLoading(false);
    }

    if (prototypeId && session?.access_token && shouldTriggerInitialFetch) {
      // Debounce to prevent multiple requests on mount
      debounceTimer = setTimeout(() => {
        fetchAndStartDevServer();
      }, 300);
    }

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [
    prototypeId,
    session?.access_token,
    shouldTriggerInitialFetch,
    fetchViewingUrl,
    startDevServer,
    baseTunnelUrl,
  ]);

  // Polling effect: poll fetch-viewing-url to detect status changes
  useEffect(() => {
    if (!prototypeId || !session?.access_token) {
      clearPollTimer();
      return;
    }

    const getIntervalForStatus = (status: RenderStatus): number => {
      switch (status) {
        case 'Connected':
          return 45000; // Poll every 45 sec when connected
        case 'Starting Dev Server..':
          return 25000; // Poll every 25 sec while starting
        case 'Static build':
          return 150000; // Poll every 2.5 min for static build
        case 'Connecting..':
        case 'Updating..':
          return 60000; // Poll every minute
        case 'Disconnected':
          return 30000;
        default:
          return 60000;
      }
    };

    const doPoll = async () => {
      const result = await fetchViewingUrl();
      if (!result) return;

      if (result.viewingUrl !== viewingUrl) {
        setViewingUrl(result.viewingUrl);

        let newStatus: RenderStatus;
        if (result.source === 'editable_instance') {
          newStatus = 'Connecting..';
        } else {
          newStatus = 'Static build';
        }

        if (newStatus !== renderStatus) {
          setRenderStatus(newStatus);
        }
      }

      if (result.terminalUrl && result.terminalUrl !== baseTunnelUrl) {
        setBaseTunnelUrl(result.terminalUrl);
      }
    };

    const pollInterval = getIntervalForStatus(renderStatus);
    clearPollTimer();
    pollTimerRef.current = setInterval(doPoll, pollInterval);

    return () => {
      clearPollTimer();
    };
  }, [
    prototypeId,
    session?.access_token,
    renderStatus,
    viewingUrl,
    baseTunnelUrl,
    fetchViewingUrl,
    clearPollTimer,
  ]);

  // Refetch function to manually trigger the flow again
  const refetch = useCallback(() => {
    setShouldTriggerInitialFetch(true);
  }, []);

  return {
    viewingUrl,
    baseTunnelUrl,
    renderStatus,
    isLoading,
    error,
    startDevServer,
    refetch,
  };
}
