import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import {
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  BuildStatus,
} from '../lib/types';

const SERVER_ENDPOINT = process.env.EXPO_PUBLIC_SERVER_ENDPOINT;

interface ViewingUrlResult {
  viewingUrl: string | null;
  status: BuildStatus | null;
  source: 'editable_instance' | 'static_build' | null;
  terminalUrl: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useViewingUrl(
  prototypeId: string | undefined,
  currentPage: 'view' | 'edit' = 'view'
): ViewingUrlResult {
  const session = useAuthStore((state) => state.session);

  const query = useQuery({
    queryKey: ['viewing-url', prototypeId, currentPage],
    queryFn: async (): Promise<FetchViewingUrlSuccessResponse | null> => {
      if (!prototypeId || !session?.access_token) return null;

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
            current_page: currentPage,
          } as FetchViewingUrlRequestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Failed to fetch viewing URL');
      }

      return data.data;
    },
    enabled: !!prototypeId && !!session?.access_token,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: (query) => {
      // Poll more frequently when status is not stable
      const status = query.state.data?.status;
      if (status === 'creating' || status === 'building' || status === 'updating') {
        return 3000; // Poll every 3 seconds when building
      }
      return false; // Don't poll when stable
    },
  });

  return {
    viewingUrl: query.data?.viewing_url ?? null,
    status: query.data?.status ?? null,
    source: query.data?.source ?? null,
    terminalUrl: query.data?.terminal_url ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// Helper to get a human-readable status message
export function getStatusMessage(status: BuildStatus | null): string {
  switch (status) {
    case 'creating':
      return 'Creating project...';
    case 'building':
      return 'Building...';
    case 'updating':
      return 'Updating...';
    case 'chatting':
      return 'Processing...';
    case 'cleaning':
      return 'Cleaning up...';
    case 'error':
      return 'Error occurred';
    case 'stable':
      return 'Ready';
    default:
      return 'Loading...';
  }
}
