/**
 * REST API Client
 * Axios-based API client with interceptors, error handling, and TypeScript types
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
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

// Extend Axios config to include metadata
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: { startTime: number };
}

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const API_TIMEOUT = 30000; // 30 seconds
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Create Axios instance with default configuration
 */
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Add timestamp to requests for logging
      const extendedConfig = config as ExtendedAxiosRequestConfig;
      extendedConfig.metadata = { startTime: Date.now() };

      // Log request in development
      if (import.meta.env.DEV) {
        console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
          params: config.params,
          data: config.data,
        });
      }

      return config;
    },
    (error: AxiosError) => {
      console.error('[API Request Error]', error);
      return Promise.reject(error);
    }
  );

  // Response interceptor
  client.interceptors.response.use(
    (response) => {
      // Calculate request duration
      const extendedConfig = response.config as ExtendedAxiosRequestConfig;
      const duration = Date.now() - (extendedConfig.metadata?.startTime || 0);

      // Log response in development
      if (import.meta.env.DEV) {
        console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, {
          status: response.status,
          duration: `${duration}ms`,
          data: response.data,
        });
      }

      return response;
    },
    async (error: AxiosError<ApiError>) => {
      // Handle errors
      const apiError = handleApiError(error);

      // Retry logic for network errors
      const config = error.config as any;
      if (shouldRetry(error) && (!config.retryCount || config.retryCount < RETRY_ATTEMPTS)) {
        config.retryCount = (config.retryCount || 0) + 1;

        // Exponential backoff
        const delay = RETRY_DELAY * Math.pow(2, config.retryCount - 1);
        await new Promise(resolve => setTimeout(resolve, delay));

        console.log(`[API Retry] Attempt ${config.retryCount}/${RETRY_ATTEMPTS}`);
        return client(config);
      }

      console.error('[API Response Error]', apiError);
      return Promise.reject(apiError);
    }
  );

  return client;
};

/**
 * Handle API errors and transform to ApiError format
 */
const handleApiError = (error: AxiosError<ApiError>): ApiError => {
  if (error.response) {
    // Server responded with error
    return {
      message: error.response.data?.message || error.message,
      code: error.response.data?.code || `HTTP_${error.response.status}`,
      details: error.response.data?.details,
      timestamp: new Date().toISOString(),
    };
  } else if (error.request) {
    // Request made but no response
    return {
      message: 'Network error: No response from server',
      code: 'NETWORK_ERROR',
      timestamp: new Date().toISOString(),
    };
  } else {
    // Request setup error
    return {
      message: error.message || 'Unknown error occurred',
      code: 'REQUEST_ERROR',
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Check if error should trigger retry
 */
const shouldRetry = (error: AxiosError): boolean => {
  if (!error.response) return true; // Network errors

  const status = error.response.status;
  // Retry on 5xx errors and 429 (rate limit)
  return status >= 500 || status === 429;
};

// Create singleton instance
const apiClient = createApiClient();

/**
 * API Functions
 */

/**
 * Get events with filtering and pagination
 */
export const getEvents = async (options?: EventQueryOptions): Promise<EventsResponse> => {
  const response = await apiClient.get<EventsResponse>('/api/events', {
    params: options,
  });
  return response.data;
};

/**
 * Get system metrics for a time range
 */
export const getMetrics = async (timeRange?: TimeRange): Promise<Metrics> => {
  const response = await apiClient.get<Metrics>('/api/metrics', {
    params: timeRange,
  });
  return response.data;
};

/**
 * Get reasoning chain by ID
 */
export const getReasoningChain = async (chainId: string): Promise<ReasoningChain> => {
  const response = await apiClient.get<ReasoningChain>(`/api/reasoning/${chainId}`);
  return response.data;
};

/**
 * Get agent history with filtering
 */
export const getAgentHistory = async (
  agentId: string,
  options?: QueryOptions
): Promise<AgentHistory> => {
  const response = await apiClient.get<AgentHistory>(`/api/agents/${agentId}/history`, {
    params: options,
  });
  return response.data;
};

/**
 * Get session details
 */
export const getSession = async (sessionId: string): Promise<Session> => {
  const response = await apiClient.get<Session>(`/api/sessions/${sessionId}`);
  return response.data;
};

/**
 * Get graph visualization data
 */
export const getGraph = async (
  sessionId: string,
  algorithm: string = 'force-directed'
): Promise<Graph> => {
  const response = await apiClient.get<Graph>(`/api/graph/${sessionId}`, {
    params: { algorithm },
  });
  return response.data;
};

/**
 * Health check
 */
export const healthCheck = async (): Promise<{ status: string; timestamp: string }> => {
  const response = await apiClient.get('/health');
  return response.data;
};

/**
 * Cancel token management
 */
export const createCancelToken = () => {
  return axios.CancelToken.source();
};

export const isCancelError = (error: any): boolean => {
  return axios.isCancel(error);
};

/**
 * Export API client for direct use if needed
 */
export { apiClient };

/**
 * Export types
 */
export type { ApiError };
