import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Create a persisted query client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes by default
      staleTime: 1000 * 60 * 5,
      // Keep data in cache for 24 hours for offline access
      gcTime: 1000 * 60 * 60 * 24,
      // Retry failed requests twice
      retry: 2,
      // Don't refetch on window focus in mobile
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Simple persistence helpers for manual cache management
const QUERY_CACHE_KEY = '@nucleate/query_cache';

export async function persistQueryCache() {
  try {
    const cache = queryClient.getQueryCache().getAll();
    const serializable = cache
      .filter((query) => query.state.status === 'success')
      .map((query) => ({
        queryKey: query.queryKey,
        data: query.state.data,
        dataUpdatedAt: query.state.dataUpdatedAt,
      }));

    await AsyncStorage.setItem(QUERY_CACHE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('Failed to persist query cache:', error);
  }
}

export async function restoreQueryCache() {
  try {
    const cached = await AsyncStorage.getItem(QUERY_CACHE_KEY);
    if (cached) {
      const queries = JSON.parse(cached);
      const now = Date.now();
      const maxAge = 1000 * 60 * 60 * 24; // 24 hours

      queries.forEach(
        (query: { queryKey: unknown[]; data: unknown; dataUpdatedAt: number }) => {
          // Only restore if data is less than 24 hours old
          if (now - query.dataUpdatedAt < maxAge) {
            queryClient.setQueryData(query.queryKey, query.data);
          }
        },
      );
    }
  } catch (error) {
    console.error('Failed to restore query cache:', error);
  }
}

export async function clearQueryCache() {
  try {
    await AsyncStorage.removeItem(QUERY_CACHE_KEY);
    queryClient.clear();
  } catch (error) {
    console.error('Failed to clear query cache:', error);
  }
}
