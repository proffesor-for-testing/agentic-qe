/**
 * useP2P Hook
 *
 * React hook for integrating with the P2P service.
 *
 * @module edge/webapp/hooks/useP2P
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DashboardState, WebAppEvent, P2PServiceConfig } from '../types';
import { getP2PService, resetP2PService, P2PServiceImpl } from '../services/P2PService';

// ============================================
// Hook Types
// ============================================

export interface UseP2POptions {
  /** Auto-initialize on mount */
  autoInit?: boolean;

  /** Service configuration */
  config?: Partial<P2PServiceConfig>;
}

export interface UseP2PReturn {
  /** Current dashboard state */
  state: DashboardState;

  /** Whether the service is initialized */
  isInitialized: boolean;

  /** Whether the service is loading */
  isLoading: boolean;

  /** Any error that occurred */
  error: Error | null;

  /** Initialize the P2P service */
  init: () => Promise<void>;

  /** Connect to a peer */
  connect: (peerId: string) => Promise<void>;

  /** Disconnect from a peer */
  disconnect: (peerId: string) => Promise<void>;

  /** Share a pattern with peers */
  sharePattern: (patternId: string, peerIds?: string[]) => Promise<void>;

  /** Add a new pattern */
  addPattern: (name: string, category: string, embedding: number[]) => Promise<string>;

  /** Sync CRDT state with a peer */
  syncCRDT: (peerId: string) => Promise<void>;

  /** Spawn a QE agent */
  spawnAgent: (agentType: string, task: string, options?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    dryRun?: boolean;
  }) => Promise<{ success: boolean; agentId?: string; error?: string }>;

  /** List spawned agents */
  listAgents: (filter?: { status?: string; type?: string }) => Promise<Array<{
    id: string;
    agentType: string;
    status: string;
    task: string;
    startedAt: number;
    duration?: number;
  }>>;

  /** Cancel a running agent */
  cancelAgent: (agentId: string) => Promise<boolean>;

  /** Reset the service */
  reset: () => void;
}

// ============================================
// Initial State
// ============================================

const initialState: DashboardState = {
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
};

// ============================================
// useP2P Hook
// ============================================

export function useP2P(options: UseP2POptions = {}): UseP2PReturn {
  const { autoInit = true, config } = options;

  const [state, setState] = useState<DashboardState>(initialState);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const serviceRef = useRef<P2PServiceImpl | null>(null);

  // Get or create service instance
  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = getP2PService(config);
    }
    return serviceRef.current;
  }, [config]);

  // Initialize service
  const init = useCallback(async () => {
    if (isInitialized || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const service = getService();

      // Subscribe to state changes
      service.subscribe((newState) => {
        setState(newState);
      });

      // Subscribe to events
      service.onEvent((event: WebAppEvent) => {
        console.log('[P2P Event]', event);
      });

      await service.init();
      setIsInitialized(true);

    } catch (err) {
      setError(err as Error);
      console.error('[P2P] Init failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getService, isInitialized, isLoading]);

  // Connect to peer
  const connect = useCallback(async (peerId: string) => {
    const service = getService();
    await service.connect(peerId);
  }, [getService]);

  // Disconnect from peer
  const disconnect = useCallback(async (peerId: string) => {
    const service = getService();
    await service.disconnect(peerId);
  }, [getService]);

  // Share pattern
  const sharePattern = useCallback(async (patternId: string, peerIds?: string[]) => {
    const service = getService();
    await service.sharePattern(patternId, peerIds);
  }, [getService]);

  // Add pattern
  const addPattern = useCallback(async (name: string, category: string, embedding: number[]) => {
    const service = getService();
    return service.addPattern(name, category, embedding);
  }, [getService]);

  // Sync CRDT
  const syncCRDT = useCallback(async (peerId: string) => {
    const service = getService();
    await service.syncCRDT(peerId);
  }, [getService]);

  // Spawn agent
  const spawnAgent = useCallback(async (
    agentType: string,
    task: string,
    options?: { priority?: 'low' | 'medium' | 'high' | 'critical'; dryRun?: boolean }
  ) => {
    const service = getService();
    return service.spawnAgent(agentType, task, options);
  }, [getService]);

  // List agents
  const listAgents = useCallback(async (filter?: { status?: string; type?: string }) => {
    const service = getService();
    return service.listAgents(filter);
  }, [getService]);

  // Cancel agent
  const cancelAgent = useCallback(async (agentId: string) => {
    const service = getService();
    return service.cancelAgent(agentId);
  }, [getService]);

  // Reset service
  const reset = useCallback(() => {
    resetP2PService();
    serviceRef.current = null;
    setState(initialState);
    setIsInitialized(false);
    setError(null);
  }, []);

  // Auto-init on mount
  useEffect(() => {
    if (autoInit && !isInitialized && !isLoading) {
      init();
    }
  }, [autoInit, init, isInitialized, isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
      }
    };
  }, []);

  return {
    state,
    isInitialized,
    isLoading,
    error,
    init,
    connect,
    disconnect,
    sharePattern,
    addPattern,
    syncCRDT,
    spawnAgent,
    listAgents,
    cancelAgent,
    reset,
  };
}

// ============================================
// useP2PEvents Hook
// ============================================

export function useP2PEvents(
  onEvent: (event: WebAppEvent) => void,
  deps: React.DependencyList = []
): void {
  const serviceRef = useRef<P2PServiceImpl | null>(null);

  useEffect(() => {
    serviceRef.current = getP2PService();

    const unsubscribe = serviceRef.current.onEvent(onEvent);

    return () => {
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ============================================
// useConnectionStatus Hook
// ============================================

export function useConnectionStatus(): DashboardState['connectionStatus'] {
  const { state } = useP2P({ autoInit: false });
  return state.connectionStatus;
}

// ============================================
// usePeers Hook
// ============================================

export function usePeers() {
  const { state, connect, disconnect, syncCRDT } = useP2P({ autoInit: false });

  return {
    peers: state.peers,
    connect,
    disconnect,
    syncCRDT,
  };
}

// ============================================
// usePatterns Hook
// ============================================

export function usePatterns() {
  const { state, sharePattern, addPattern } = useP2P({ autoInit: false });

  return {
    stats: state.patterns,
    sharePattern,
    addPattern,
  };
}

// ============================================
// useCRDT Hook
// ============================================

export function useCRDT() {
  const { state, syncCRDT } = useP2P({ autoInit: false });

  return {
    stores: state.crdt.stores,
    totalOperations: state.crdt.totalOperations,
    conflictsResolved: state.crdt.conflictsResolved,
    lastSync: state.crdt.lastSync,
    syncCRDT,
  };
}

// ============================================
// useMetrics Hook
// ============================================

export function useMetrics() {
  const { state } = useP2P({ autoInit: false });
  return state.metrics;
}
