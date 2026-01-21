/**
 * useP2PService Hook
 *
 * React hook for initializing and managing the P2P service lifecycle.
 * Handles service initialization, cleanup, and provides access to the service instance.
 *
 * @module edge/webapp/hooks/useP2PService
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { DashboardState, P2PServiceConfig, WebAppEvent } from '../types';
import { getP2PService, resetP2PService, P2PServiceImpl } from '../services/P2PService';

// ============================================
// Types
// ============================================

/**
 * Configuration options for the useP2PService hook
 */
export interface UseP2PServiceOptions {
  /** Auto-initialize on mount (default: true) */
  autoInit?: boolean;

  /** Service configuration overrides */
  config?: Partial<P2PServiceConfig>;

  /** Callback when service initializes successfully */
  onInitialized?: () => void;

  /** Callback when an error occurs */
  onError?: (error: Error) => void;

  /** Callback when service is destroyed */
  onDestroy?: () => void;
}

/**
 * Service status for lifecycle tracking
 */
export type ServiceStatus = 'idle' | 'initializing' | 'ready' | 'error' | 'destroyed';

/**
 * Return value from useP2PService hook
 */
export interface UseP2PServiceReturn {
  /** The P2P service instance (null if not initialized) */
  service: P2PServiceImpl | null;

  /** Current service status */
  status: ServiceStatus;

  /** Whether the service is ready for use */
  isReady: boolean;

  /** Whether the service is currently initializing */
  isInitializing: boolean;

  /** Error if initialization failed */
  error: Error | null;

  /** Current dashboard state */
  state: DashboardState;

  /** Initialize the service manually (if autoInit is false) */
  initialize: () => Promise<void>;

  /** Start the service (alias for initialize) */
  start: () => Promise<void>;

  /** Stop and destroy the service */
  stop: () => void;

  /** Restart the service (stop + start) */
  restart: () => Promise<void>;

  /** Reset the service singleton (for testing) */
  reset: () => void;
}

// ============================================
// Initial State
// ============================================

const createInitialState = (): DashboardState => ({
  connectionStatus: 'disconnected',
  localAgent: null,
  peers: [],
  patterns: {
    total: 0,
    local: 0,
    synced: 0,
    pending: 0,
    categories: {},
  },
  crdt: {
    stores: [],
    totalOperations: 0,
    conflictsResolved: 0,
    lastSync: 0,
  },
  tests: {
    running: [],
    completed: [],
    queued: 0,
  },
  metrics: {
    memoryUsage: 0,
    cpuUsage: 0,
    networkLatency: 0,
    messagesPerSecond: 0,
    uptime: 0,
  },
});

// ============================================
// useP2PService Hook
// ============================================

/**
 * Hook for managing the P2P service lifecycle.
 *
 * @param options - Configuration options
 * @returns Service instance, status, and control methods
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { service, isReady, state, start, stop } = useP2PService({
 *     autoInit: true,
 *     onInitialized: () => console.log('P2P service ready'),
 *     onError: (err) => console.error('P2P error:', err),
 *   });
 *
 *   if (!isReady) {
 *     return <div>Initializing P2P network...</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <p>Status: {state.connectionStatus}</p>
 *       <p>Peers: {state.peers.length}</p>
 *       <button onClick={stop}>Disconnect</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useP2PService(options: UseP2PServiceOptions = {}): UseP2PServiceReturn {
  const {
    autoInit = true,
    config,
    onInitialized,
    onError,
    onDestroy,
  } = options;

  // State
  const [status, setStatus] = useState<ServiceStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [state, setState] = useState<DashboardState>(createInitialState);

  // Refs
  const serviceRef = useRef<P2PServiceImpl | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const initializingRef = useRef(false);
  const mountedRef = useRef(true);

  // Get or create service instance
  const getService = useCallback((): P2PServiceImpl => {
    if (!serviceRef.current) {
      serviceRef.current = getP2PService(config);
    }
    return serviceRef.current;
  }, [config]);

  // Subscribe to service state changes
  const subscribeToService = useCallback((service: P2PServiceImpl) => {
    // Unsubscribe from previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    // Subscribe to state updates
    unsubscribeRef.current = service.subscribe((newState) => {
      if (mountedRef.current) {
        setState(newState);
      }
    });

    // Set initial state
    setState(service.getState());
  }, []);

  // Initialize the service
  const initialize = useCallback(async (): Promise<void> => {
    if (initializingRef.current || status === 'ready') {
      return;
    }

    initializingRef.current = true;
    setStatus('initializing');
    setError(null);

    try {
      const service = getService();
      subscribeToService(service);

      await service.init();

      if (mountedRef.current) {
        setStatus('ready');
        onInitialized?.();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (mountedRef.current) {
        setStatus('error');
        setError(error);
        onError?.(error);
      }
    } finally {
      initializingRef.current = false;
    }
  }, [getService, subscribeToService, status, onInitialized, onError]);

  // Stop and cleanup the service
  const stop = useCallback((): void => {
    // Unsubscribe from state updates
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Destroy the service
    if (serviceRef.current) {
      serviceRef.current.destroy();
      serviceRef.current = null;
    }

    if (mountedRef.current) {
      setStatus('destroyed');
      setState(createInitialState());
      onDestroy?.();
    }
  }, [onDestroy]);

  // Restart the service
  const restart = useCallback(async (): Promise<void> => {
    stop();
    // Reset the singleton to allow fresh initialization
    resetP2PService();
    serviceRef.current = null;
    setStatus('idle');
    await initialize();
  }, [stop, initialize]);

  // Reset the service singleton
  const reset = useCallback((): void => {
    stop();
    resetP2PService();
    serviceRef.current = null;
    setStatus('idle');
    setError(null);
  }, [stop]);

  // Auto-init on mount
  useEffect(() => {
    mountedRef.current = true;

    if (autoInit && status === 'idle') {
      initialize();
    }

    return () => {
      mountedRef.current = false;
      // Cleanup on unmount
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
      }
    };
  }, [autoInit, status, initialize]);

  // Memoized derived state
  const isReady = useMemo(() => status === 'ready', [status]);
  const isInitializing = useMemo(() => status === 'initializing', [status]);

  return {
    service: serviceRef.current,
    status,
    isReady,
    isInitializing,
    error,
    state,
    initialize,
    start: initialize,
    stop,
    restart,
    reset,
  };
}

export default useP2PService;
