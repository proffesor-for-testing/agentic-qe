/**
 * React Query Hooks for API
 * Custom hooks wrapping API functions with React Query for caching, refetching, and state management
 */

import {
  useQuery,
  useQueryClient,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  getEvents,
  getMetrics,
  getReasoningChain,
  getAgentHistory,
  getSession,
  getGraph,
  healthCheck,
  createCancelToken,
  isCancelError,
} from '../services/api';
import type {
  EventQueryOptions,
  QueryOptions,
  TimeRange,
  EventsResponse,
  Metrics,
  ReasoningChain,
  AgentHistory,
  Session,
  Graph,
  ApiError,
} from '../types/api';

/**
 * Query Keys
 */
export const queryKeys = {
  events: (options?: EventQueryOptions) => ['events', options] as const,
  metrics: (timeRange?: TimeRange) => ['metrics', timeRange] as const,
  reasoningChain: (chainId: string) => ['reasoningChain', chainId] as const,
  agentHistory: (agentId: string, options?: QueryOptions) => ['agentHistory', agentId, options] as const,
  session: (sessionId: string) => ['session', sessionId] as const,
  graph: (sessionId: string, algorithm?: string) => ['graph', sessionId, algorithm] as const,
  health: () => ['health'] as const,
};

/**
 * Default Query Options
 */
const defaultQueryOptions = {
  staleTime: 30000, // 30 seconds
  cacheTime: 300000, // 5 minutes
  retry: 2,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * useEvents Hook
 * Fetch events with pagination and filtering
 */
export const useEvents = (
  options?: EventQueryOptions,
  queryOptions?: Partial<UseQueryOptions<EventsResponse, ApiError>>
): UseQueryResult<EventsResponse, ApiError> => {
  const cancelTokenRef = useRef(createCancelToken());

  useEffect(() => {
    return () => {
      cancelTokenRef.current.cancel('Component unmounted');
    };
  }, []);

  return useQuery<EventsResponse, ApiError>({
    queryKey: queryKeys.events(options),
    queryFn: async () => {
      try {
        return await getEvents(options);
      } catch (error) {
        if (isCancelError(error)) {
          throw new Error('Request cancelled');
        }
        throw error;
      }
    },
    ...defaultQueryOptions,
    staleTime: 10000, // 10 seconds for events (more real-time)
    ...queryOptions,
  });
};

/**
 * useMetrics Hook
 * Fetch system metrics with auto-refresh every 30s
 */
export const useMetrics = (
  timeRange?: TimeRange,
  queryOptions?: Partial<UseQueryOptions<Metrics, ApiError>>
): UseQueryResult<Metrics, ApiError> => {
  return useQuery<Metrics, ApiError>({
    queryKey: queryKeys.metrics(timeRange),
    queryFn: () => getMetrics(timeRange),
    ...defaultQueryOptions,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    ...queryOptions,
  });
};

/**
 * useReasoningChain Hook
 * Fetch reasoning chain by ID
 */
export const useReasoningChain = (
  chainId: string,
  queryOptions?: Partial<UseQueryOptions<ReasoningChain, ApiError>>
): UseQueryResult<ReasoningChain, ApiError> => {
  return useQuery<ReasoningChain, ApiError>({
    queryKey: queryKeys.reasoningChain(chainId),
    queryFn: () => getReasoningChain(chainId),
    ...defaultQueryOptions,
    enabled: !!chainId, // Only fetch if chainId is provided
    ...queryOptions,
  });
};

/**
 * useAgentHistory Hook
 * Fetch agent history with filtering
 */
export const useAgentHistory = (
  agentId: string,
  options?: QueryOptions,
  queryOptions?: Partial<UseQueryOptions<AgentHistory, ApiError>>
): UseQueryResult<AgentHistory, ApiError> => {
  return useQuery<AgentHistory, ApiError>({
    queryKey: queryKeys.agentHistory(agentId, options),
    queryFn: () => getAgentHistory(agentId, options),
    ...defaultQueryOptions,
    enabled: !!agentId, // Only fetch if agentId is provided
    ...queryOptions,
  });
};

/**
 * useSession Hook
 * Fetch session details
 */
export const useSession = (
  sessionId: string,
  queryOptions?: Partial<UseQueryOptions<Session, ApiError>>
): UseQueryResult<Session, ApiError> => {
  return useQuery<Session, ApiError>({
    queryKey: queryKeys.session(sessionId),
    queryFn: () => getSession(sessionId),
    ...defaultQueryOptions,
    enabled: !!sessionId, // Only fetch if sessionId is provided
    ...queryOptions,
  });
};

/**
 * useGraph Hook
 * Fetch graph visualization data
 */
export const useGraph = (
  sessionId: string,
  algorithm: string = 'force-directed',
  queryOptions?: Partial<UseQueryOptions<Graph, ApiError>>
): UseQueryResult<Graph, ApiError> => {
  return useQuery<Graph, ApiError>({
    queryKey: queryKeys.graph(sessionId, algorithm),
    queryFn: () => getGraph(sessionId, algorithm),
    ...defaultQueryOptions,
    staleTime: 60000, // 1 minute (graphs are more expensive to compute)
    enabled: !!sessionId, // Only fetch if sessionId is provided
    ...queryOptions,
  });
};

/**
 * useHealthCheck Hook
 * Check API health status
 */
export const useHealthCheck = (
  queryOptions?: Partial<UseQueryOptions<{ status: string; timestamp: string }, ApiError>>
): UseQueryResult<{ status: string; timestamp: string }, ApiError> => {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: healthCheck,
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Check every minute
    retry: 1, // Only retry once for health checks
    ...queryOptions,
  });
};

/**
 * useInvalidateQueries Hook
 * Helper to invalidate queries (useful for mutations)
 */
export const useInvalidateQueries = () => {
  const queryClient = useQueryClient();

  return {
    invalidateEvents: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
    invalidateMetrics: () => queryClient.invalidateQueries({ queryKey: ['metrics'] }),
    invalidateReasoningChain: (chainId?: string) =>
      chainId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.reasoningChain(chainId) })
        : queryClient.invalidateQueries({ queryKey: ['reasoningChain'] }),
    invalidateAgentHistory: (agentId?: string) =>
      agentId
        ? queryClient.invalidateQueries({ queryKey: ['agentHistory', agentId] })
        : queryClient.invalidateQueries({ queryKey: ['agentHistory'] }),
    invalidateSession: (sessionId?: string) =>
      sessionId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
        : queryClient.invalidateQueries({ queryKey: ['session'] }),
    invalidateGraph: (sessionId?: string) =>
      sessionId
        ? queryClient.invalidateQueries({ queryKey: ['graph', sessionId] })
        : queryClient.invalidateQueries({ queryKey: ['graph'] }),
    invalidateAll: () => queryClient.invalidateQueries(),
  };
};

/**
 * usePrefetch Hook
 * Helper to prefetch queries
 */
export const usePrefetch = () => {
  const queryClient = useQueryClient();

  return {
    prefetchEvents: (options?: EventQueryOptions) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.events(options),
        queryFn: () => getEvents(options),
      }),
    prefetchMetrics: (timeRange?: TimeRange) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.metrics(timeRange),
        queryFn: () => getMetrics(timeRange),
      }),
    prefetchReasoningChain: (chainId: string) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.reasoningChain(chainId),
        queryFn: () => getReasoningChain(chainId),
      }),
    prefetchAgentHistory: (agentId: string, options?: QueryOptions) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.agentHistory(agentId, options),
        queryFn: () => getAgentHistory(agentId, options),
      }),
    prefetchSession: (sessionId: string) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.session(sessionId),
        queryFn: () => getSession(sessionId),
      }),
    prefetchGraph: (sessionId: string, algorithm?: string) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.graph(sessionId, algorithm),
        queryFn: () => getGraph(sessionId, algorithm),
      }),
  };
};

