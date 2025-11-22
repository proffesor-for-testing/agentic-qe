/**
 * React Query Provider
 * QueryClient configuration and provider wrapper
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Create QueryClient with optimized configuration
 */
const createQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Caching
        staleTime: 30000, // 30 seconds
        gcTime: 300000, // 5 minutes (renamed from cacheTime in v5)

        // Retry
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

        // Refetching
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,
      },
      mutations: {
        // Retry
        retry: 1,
        retryDelay: 1000,
      },
    },
  });
};

// Singleton QueryClient instance
const queryClient = createQueryClient();

/**
 * QueryProvider Component
 */
interface QueryProviderProps {
  children: React.ReactNode;
  client?: QueryClient;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({
  children,
  client = queryClient
}) => {
  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
};

/**
 * Export QueryClient for external use
 */
export { queryClient };

/**
 * Custom hook to access QueryClient
 */
export { useQueryClient } from '@tanstack/react-query';
