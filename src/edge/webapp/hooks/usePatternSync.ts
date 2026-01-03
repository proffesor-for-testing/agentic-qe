/**
 * usePatternSync Hook
 *
 * React hook for subscribing to pattern sync events from the P2P service.
 * Provides real-time updates on pattern sharing and synchronization state.
 *
 * @module edge/webapp/hooks/usePatternSync
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PatternStats, WebAppEvent } from '../types';
import { getP2PService, P2PServiceImpl } from '../services/P2PService';

// ============================================
// Types
// ============================================

/**
 * Pattern sync status
 */
export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'error';

/**
 * Pattern sync event types
 */
export type PatternSyncEventType =
  | 'sync_started'
  | 'sync_progress'
  | 'sync_completed'
  | 'sync_error'
  | 'pattern_received'
  | 'pattern_shared'
  | 'conflict_detected'
  | 'conflict_resolved';

/**
 * Pattern sync event data
 */
export interface PatternSyncEvent {
  type: PatternSyncEventType;
  patternId?: string;
  peerId?: string;
  progress?: number;
  count?: number;
  error?: string;
  timestamp: number;
}

/**
 * Pattern sync state with progress info
 */
export interface PatternSyncState {
  /** Current sync status */
  status: SyncStatus;

  /** Whether a sync is currently in progress */
  isSyncing: boolean;

  /** Pattern statistics */
  stats: PatternStats;

  /** Number of patterns pending sync */
  pendingCount: number;

  /** Number of patterns synced in current session */
  syncedCount: number;

  /** Sync progress (0-100) */
  progress: number;

  /** Last sync timestamp */
  lastSyncAt: number | null;

  /** Last error if any */
  lastError: string | null;

  /** Number of conflicts detected */
  conflictsDetected: number;

  /** Number of conflicts resolved */
  conflictsResolved: number;

  /** Patterns received from peers in this session */
  patternsReceived: number;

  /** Patterns shared with peers in this session */
  patternsShared: number;
}

/**
 * Options for the usePatternSync hook
 */
export interface UsePatternSyncOptions {
  /** Callback when pattern sync events occur */
  onSyncEvent?: (event: PatternSyncEvent) => void;

  /** Callback when sync starts */
  onSyncStart?: () => void;

  /** Callback when sync completes */
  onSyncComplete?: (stats: PatternStats) => void;

  /** Callback when sync error occurs */
  onSyncError?: (error: string) => void;

  /** Callback when a pattern is received */
  onPatternReceived?: (patternId: string, fromPeer: string) => void;

  /** Auto-sync interval in milliseconds (0 to disable) */
  autoSyncInterval?: number;
}

/**
 * Return value from usePatternSync hook
 */
export interface UsePatternSyncReturn {
  /** Current sync state */
  syncState: PatternSyncState;

  /** Whether currently syncing */
  isSyncing: boolean;

  /** Pattern statistics */
  stats: PatternStats;

  /** Sync progress (0-100) */
  progress: number;

  /** Recent sync events */
  recentEvents: PatternSyncEvent[];

  /** Share a pattern with peers */
  sharePattern: (patternId: string, peerIds?: string[]) => Promise<void>;

  /** Add a new pattern */
  addPattern: (name: string, category: string, embedding: number[]) => Promise<string>;

  /** Trigger manual sync with all connected peers */
  syncNow: () => Promise<void>;

  /** Clear sync error */
  clearError: () => void;

  /** Get patterns by category */
  getPatternsByCategory: (category: string) => number;
}

// ============================================
// Constants
// ============================================

const MAX_RECENT_EVENTS = 50;

// ============================================
// Helper Functions
// ============================================

/**
 * Create default pattern stats
 */
function createDefaultStats(): PatternStats {
  return {
    total: 0,
    local: 0,
    synced: 0,
    pending: 0,
    categories: {},
  };
}

/**
 * Create default sync state
 */
function createDefaultSyncState(): PatternSyncState {
  return {
    status: 'idle',
    isSyncing: false,
    stats: createDefaultStats(),
    pendingCount: 0,
    syncedCount: 0,
    progress: 0,
    lastSyncAt: null,
    lastError: null,
    conflictsDetected: 0,
    conflictsResolved: 0,
    patternsReceived: 0,
    patternsShared: 0,
  };
}

// ============================================
// usePatternSync Hook
// ============================================

/**
 * Hook for subscribing to pattern sync events.
 *
 * @param options - Configuration options
 * @returns Sync state, stats, and control methods
 *
 * @example
 * ```tsx
 * function PatternPanel() {
 *   const {
 *     syncState,
 *     isSyncing,
 *     stats,
 *     progress,
 *     sharePattern,
 *     addPattern,
 *     syncNow,
 *   } = usePatternSync({
 *     onSyncEvent: (event) => console.log('Sync event:', event),
 *     onPatternReceived: (id, from) => console.log(`Received ${id} from ${from}`),
 *   });
 *
 *   return (
 *     <div>
 *       <h2>Patterns</h2>
 *       <p>Total: {stats.total} | Synced: {stats.synced} | Pending: {stats.pending}</p>
 *
 *       {isSyncing && (
 *         <div className="sync-progress">
 *           Syncing... {progress}%
 *         </div>
 *       )}
 *
 *       <h3>Categories</h3>
 *       <ul>
 *         {Object.entries(stats.categories).map(([cat, count]) => (
 *           <li key={cat}>{cat}: {count}</li>
 *         ))}
 *       </ul>
 *
 *       <button onClick={syncNow} disabled={isSyncing}>
 *         Sync Now
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePatternSync(options: UsePatternSyncOptions = {}): UsePatternSyncReturn {
  const {
    onSyncEvent,
    onSyncStart,
    onSyncComplete,
    onSyncError,
    onPatternReceived,
    autoSyncInterval = 0,
  } = options;

  // State
  const [syncState, setSyncState] = useState<PatternSyncState>(createDefaultSyncState);
  const [recentEvents, setRecentEvents] = useState<PatternSyncEvent[]>([]);

  // Refs
  const serviceRef = useRef<P2PServiceImpl | null>(null);
  const unsubscribeStateRef = useRef<(() => void) | null>(null);
  const unsubscribeEventRef = useRef<(() => void) | null>(null);
  const autoSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Callback refs
  const onSyncEventRef = useRef(onSyncEvent);
  const onSyncStartRef = useRef(onSyncStart);
  const onSyncCompleteRef = useRef(onSyncComplete);
  const onSyncErrorRef = useRef(onSyncError);
  const onPatternReceivedRef = useRef(onPatternReceived);

  // Keep callback refs updated
  useEffect(() => {
    onSyncEventRef.current = onSyncEvent;
    onSyncStartRef.current = onSyncStart;
    onSyncCompleteRef.current = onSyncComplete;
    onSyncErrorRef.current = onSyncError;
    onPatternReceivedRef.current = onPatternReceived;
  }, [onSyncEvent, onSyncStart, onSyncComplete, onSyncError, onPatternReceived]);

  // Add event to recent events
  const addEvent = useCallback((event: PatternSyncEvent) => {
    setRecentEvents((prev) => {
      const newEvents = [event, ...prev];
      return newEvents.slice(0, MAX_RECENT_EVENTS);
    });
    onSyncEventRef.current?.(event);
  }, []);

  // Subscribe to service
  useEffect(() => {
    mountedRef.current = true;
    serviceRef.current = getP2PService();

    // Subscribe to state changes
    unsubscribeStateRef.current = serviceRef.current.subscribe((state) => {
      if (!mountedRef.current) return;

      setSyncState((prev) => ({
        ...prev,
        stats: state.patterns,
        pendingCount: state.patterns.pending,
      }));
    });

    // Subscribe to events
    unsubscribeEventRef.current = serviceRef.current.onEvent((event: WebAppEvent) => {
      if (!mountedRef.current) return;

      switch (event.type) {
        case 'pattern:received': {
          const syncEvent: PatternSyncEvent = {
            type: 'pattern_received',
            patternId: event.patternId,
            peerId: event.from,
            timestamp: Date.now(),
          };
          addEvent(syncEvent);

          setSyncState((prev) => ({
            ...prev,
            patternsReceived: prev.patternsReceived + 1,
          }));

          onPatternReceivedRef.current?.(event.patternId, event.from);
          break;
        }

        case 'pattern:synced': {
          const syncEvent: PatternSyncEvent = {
            type: 'sync_completed',
            count: event.count,
            timestamp: Date.now(),
          };
          addEvent(syncEvent);

          setSyncState((prev) => ({
            ...prev,
            status: 'completed',
            isSyncing: false,
            syncedCount: prev.syncedCount + event.count,
            lastSyncAt: Date.now(),
            progress: 100,
          }));

          if (serviceRef.current) {
            onSyncCompleteRef.current?.(serviceRef.current.getState().patterns);
          }
          break;
        }

        case 'crdt:conflict': {
          const syncEvent: PatternSyncEvent = {
            type: event.resolved ? 'conflict_resolved' : 'conflict_detected',
            timestamp: Date.now(),
          };
          addEvent(syncEvent);

          setSyncState((prev) => ({
            ...prev,
            conflictsDetected: prev.conflictsDetected + 1,
            conflictsResolved: event.resolved
              ? prev.conflictsResolved + 1
              : prev.conflictsResolved,
          }));
          break;
        }

        case 'error': {
          const syncEvent: PatternSyncEvent = {
            type: 'sync_error',
            error: event.message,
            timestamp: Date.now(),
          };
          addEvent(syncEvent);

          setSyncState((prev) => ({
            ...prev,
            status: 'error',
            isSyncing: false,
            lastError: event.message,
          }));

          onSyncErrorRef.current?.(event.message);
          break;
        }
      }
    });

    // Get initial state
    const initialState = serviceRef.current.getState();
    setSyncState((prev) => ({
      ...prev,
      stats: initialState.patterns,
      pendingCount: initialState.patterns.pending,
    }));

    return () => {
      mountedRef.current = false;
      if (unsubscribeStateRef.current) {
        unsubscribeStateRef.current();
      }
      if (unsubscribeEventRef.current) {
        unsubscribeEventRef.current();
      }
    };
  }, [addEvent]);

  // Auto-sync interval
  useEffect(() => {
    if (autoSyncInterval <= 0) return;

    const syncWithPeers = async () => {
      if (!serviceRef.current || syncState.isSyncing) return;

      const state = serviceRef.current.getState();
      for (const peer of state.peers) {
        if (peer.connectionState === 'connected') {
          try {
            await serviceRef.current.syncCRDT(peer.id);
          } catch (error) {
            console.error('Auto-sync error:', error);
          }
        }
      }
    };

    autoSyncIntervalRef.current = setInterval(syncWithPeers, autoSyncInterval);

    return () => {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
      }
    };
  }, [autoSyncInterval, syncState.isSyncing]);

  // Share a pattern
  const sharePattern = useCallback(async (patternId: string, peerIds?: string[]): Promise<void> => {
    if (!serviceRef.current) {
      throw new Error('P2P service not available');
    }

    setSyncState((prev) => ({
      ...prev,
      status: 'syncing',
      isSyncing: true,
    }));

    const event: PatternSyncEvent = {
      type: 'sync_started',
      patternId,
      timestamp: Date.now(),
    };
    addEvent(event);
    onSyncStartRef.current?.();

    try {
      await serviceRef.current.sharePattern(patternId, peerIds);

      setSyncState((prev) => ({
        ...prev,
        status: 'completed',
        isSyncing: false,
        patternsShared: prev.patternsShared + 1,
        lastSyncAt: Date.now(),
      }));

      const completeEvent: PatternSyncEvent = {
        type: 'pattern_shared',
        patternId,
        timestamp: Date.now(),
      };
      addEvent(completeEvent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      setSyncState((prev) => ({
        ...prev,
        status: 'error',
        isSyncing: false,
        lastError: errorMessage,
      }));

      const errorEvent: PatternSyncEvent = {
        type: 'sync_error',
        error: errorMessage,
        timestamp: Date.now(),
      };
      addEvent(errorEvent);

      throw error;
    }
  }, [addEvent]);

  // Add a new pattern
  const addPattern = useCallback(async (
    name: string,
    category: string,
    embedding: number[]
  ): Promise<string> => {
    if (!serviceRef.current) {
      throw new Error('P2P service not available');
    }

    return serviceRef.current.addPattern(name, category, embedding);
  }, []);

  // Trigger manual sync
  const syncNow = useCallback(async (): Promise<void> => {
    if (!serviceRef.current || syncState.isSyncing) return;

    setSyncState((prev) => ({
      ...prev,
      status: 'syncing',
      isSyncing: true,
      progress: 0,
    }));

    const event: PatternSyncEvent = {
      type: 'sync_started',
      timestamp: Date.now(),
    };
    addEvent(event);
    onSyncStartRef.current?.();

    try {
      const state = serviceRef.current.getState();
      const connectedPeers = state.peers.filter((p) => p.connectionState === 'connected');

      if (connectedPeers.length === 0) {
        setSyncState((prev) => ({
          ...prev,
          status: 'completed',
          isSyncing: false,
          progress: 100,
        }));
        return;
      }

      let completed = 0;
      for (const peer of connectedPeers) {
        await serviceRef.current.syncCRDT(peer.id);
        completed++;

        setSyncState((prev) => ({
          ...prev,
          progress: Math.round((completed / connectedPeers.length) * 100),
        }));
      }

      setSyncState((prev) => ({
        ...prev,
        status: 'completed',
        isSyncing: false,
        lastSyncAt: Date.now(),
        progress: 100,
      }));

      onSyncCompleteRef.current?.(serviceRef.current.getState().patterns);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      setSyncState((prev) => ({
        ...prev,
        status: 'error',
        isSyncing: false,
        lastError: errorMessage,
      }));

      onSyncErrorRef.current?.(errorMessage);
    }
  }, [syncState.isSyncing, addEvent]);

  // Clear error
  const clearError = useCallback((): void => {
    setSyncState((prev) => ({
      ...prev,
      lastError: null,
      status: prev.status === 'error' ? 'idle' : prev.status,
    }));
  }, []);

  // Get patterns by category
  const getPatternsByCategory = useCallback(
    (category: string): number => {
      return syncState.stats.categories[category] ?? 0;
    },
    [syncState.stats.categories]
  );

  // Derived state
  const isSyncing = syncState.isSyncing;
  const stats = syncState.stats;
  const progress = syncState.progress;

  return {
    syncState,
    isSyncing,
    stats,
    progress,
    recentEvents,
    sharePattern,
    addPattern,
    syncNow,
    clearError,
    getPatternsByCategory,
  };
}

export default usePatternSync;
