/**
 * usePatternSync Hook
 *
 * Subscribe to pattern synchronization events.
 *
 * @module edge/webapp/hooks/p2p/usePatternSync
 * @version 1.0.0
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useP2PContext, P2PEventType } from '../../context/P2PContext';
import type {
  UsePatternSyncOptions,
  UsePatternSyncReturn,
  SyncResult,
  PatternConflict,
  SharedPattern,
  PatternSyncStatus,
  PeerId,
} from './types';

/**
 * Hook for managing pattern synchronization with peers.
 *
 * @example
 * ```tsx
 * function PatternSyncPanel() {
 *   const {
 *     status,
 *     isSyncing,
 *     pendingCount,
 *     syncedCount,
 *     sync,
 *     syncAll,
 *     onPatternReceived,
 *     onConflict,
 *   } = usePatternSync({
 *     autoSync: true,
 *     syncInterval: 30000,
 *   });
 *
 *   useEffect(() => {
 *     const unsubPattern = onPatternReceived((pattern) => {
 *       console.log('Received pattern:', pattern.id);
 *     });
 *
 *     const unsubConflict = onConflict((conflict) => {
 *       console.warn('Conflict detected:', conflict.patternId);
 *     });
 *
 *     return () => {
 *       unsubPattern();
 *       unsubConflict();
 *     };
 *   }, [onPatternReceived, onConflict]);
 *
 *   return (
 *     <div>
 *       <p>Status: {status.status}</p>
 *       <p>Pending: {pendingCount}</p>
 *       <p>Synced: {syncedCount}</p>
 *       <button onClick={syncAll} disabled={isSyncing}>
 *         {isSyncing ? 'Syncing...' : 'Sync All'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePatternSync(options: UsePatternSyncOptions = {}): UsePatternSyncReturn {
  const {
    autoSync = true,
    syncInterval = 30000,
    maxPendingPatterns = 100,
  } = options;

  const context = useP2PContext();
  const [localPatternCount, setLocalPatternCount] = useState(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const cancelSyncRef = useRef(false);

  // Current sync status
  const status: PatternSyncStatus = context.patternSyncState;
  const isSyncing = status.status === 'syncing';
  const lastSyncAt = status.lastSyncAt;
  const pendingCount = status.pendingPatterns;
  const syncedCount = status.syncedPatterns;

  // Sync with a specific peer
  const sync = useCallback(async (peerId?: PeerId): Promise<SyncResult> => {
    if (isSyncingRef.current) {
      return {
        peerId: peerId || '',
        patternsReceived: 0,
        patternsSent: 0,
        conflicts: [],
        durationMs: 0,
        error: new Error('Sync already in progress'),
      };
    }

    isSyncingRef.current = true;
    cancelSyncRef.current = false;
    const startTime = Date.now();

    try {
      // If no peer specified, sync with first connected peer
      const targetPeerId = peerId || getFirstConnectedPeer(context.peers);

      if (!targetPeerId) {
        throw new Error('No connected peers available for sync');
      }

      if (cancelSyncRef.current) {
        throw new Error('Sync cancelled');
      }

      await context.requestPatternSync(targetPeerId);

      const result: SyncResult = {
        peerId: targetPeerId,
        patternsReceived: 0, // Count populated by sync event handler
        patternsSent: 0,
        conflicts: [],
        durationMs: Date.now() - startTime,
      };

      return result;
    } catch (error) {
      return {
        peerId: peerId || '',
        patternsReceived: 0,
        patternsSent: 0,
        conflicts: [],
        durationMs: Date.now() - startTime,
        error: error as Error,
      };
    } finally {
      isSyncingRef.current = false;
    }
  }, [context]);

  // Sync with all connected peers
  const syncAll = useCallback(async (): Promise<SyncResult[]> => {
    const connectedPeers = Array.from(context.peers.values())
      .filter((peer) => peer.connectionState === 'connected')
      .map((peer) => peer.id);

    if (connectedPeers.length === 0) {
      return [{
        peerId: '',
        patternsReceived: 0,
        patternsSent: 0,
        conflicts: [],
        durationMs: 0,
        error: new Error('No connected peers'),
      }];
    }

    const results: SyncResult[] = [];

    for (const peerId of connectedPeers) {
      if (cancelSyncRef.current) {
        break;
      }

      const result = await sync(peerId);
      results.push(result);
    }

    return results;
  }, [context.peers, sync]);

  // Cancel ongoing sync
  const cancelSync = useCallback((): void => {
    cancelSyncRef.current = true;
  }, []);

  // Subscribe to pattern received events
  const onPatternReceived = useCallback(
    (handler: (pattern: SharedPattern) => void): (() => void) => {
      return context.subscribe(P2PEventType.PATTERN_RECEIVED, (event) => {
        handler(event.data as SharedPattern);
      });
    },
    [context]
  );

  // Subscribe to sync complete events
  const onSyncComplete = useCallback(
    (handler: (result: SyncResult) => void): (() => void) => {
      return context.subscribe(P2PEventType.SYNC_COMPLETED, (event) => {
        const data = event.data as {
          peerId: PeerId;
          patternsReceived: number;
          patternsSent: number;
        };
        handler({
          peerId: data.peerId,
          patternsReceived: data.patternsReceived,
          patternsSent: data.patternsSent,
          conflicts: [],
          durationMs: 0,
        });
      });
    },
    [context]
  );

  // Subscribe to sync error events
  const onSyncError = useCallback(
    (handler: (error: Error) => void): (() => void) => {
      return context.subscribe(P2PEventType.SYNC_ERROR, (event) => {
        const data = event.data as { error: Error };
        handler(data.error);
      });
    },
    [context]
  );

  // Subscribe to conflict events
  const onConflict = useCallback(
    (handler: (conflict: PatternConflict) => void): (() => void) => {
      return context.subscribe(P2PEventType.CONFLICT_DETECTED, (event) => {
        handler(event.data as PatternConflict);
      });
    },
    [context]
  );

  // Auto-sync on peer connect
  useEffect(() => {
    if (!autoSync) return;

    const unsubscribe = context.subscribe(P2PEventType.PEER_CONNECTED, async (event) => {
      const data = event.data as { peerId: PeerId };
      // Small delay to let connection stabilize
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!isSyncingRef.current) {
        sync(data.peerId).catch((error) => {
          console.warn('[usePatternSync] Auto-sync failed:', error);
        });
      }
    });

    return unsubscribe;
  }, [autoSync, context, sync]);

  // Periodic sync interval
  useEffect(() => {
    if (!autoSync || syncInterval <= 0) return;

    syncIntervalRef.current = setInterval(() => {
      if (!isSyncingRef.current && context.isInitialized) {
        syncAll().catch((error) => {
          console.warn('[usePatternSync] Periodic sync failed:', error);
        });
      }
    }, syncInterval);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [autoSync, syncInterval, context.isInitialized, syncAll]);

  // Auto-sync when pending patterns exceed threshold
  useEffect(() => {
    if (!autoSync || pendingCount < maxPendingPatterns) return;

    if (!isSyncingRef.current && context.isInitialized) {
      syncAll().catch((error) => {
        console.warn('[usePatternSync] Threshold sync failed:', error);
      });
    }
  }, [autoSync, pendingCount, maxPendingPatterns, context.isInitialized, syncAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelSyncRef.current = true;
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  return {
    status,
    isSyncing,
    lastSyncAt,
    pendingCount,
    syncedCount,
    localCount: localPatternCount,
    sync,
    syncAll,
    cancelSync,
    onPatternReceived,
    onSyncComplete,
    onSyncError,
    onConflict,
  };
}

// ============================================
// Helper Functions
// ============================================

function getFirstConnectedPeer(peers: Map<PeerId, { connectionState: string }>): PeerId | null {
  const entries = Array.from(peers.entries());
  for (let i = 0; i < entries.length; i++) {
    const [peerId, peer] = entries[i];
    if (peer.connectionState === 'connected') {
      return peerId;
    }
  }
  return null;
}

export default usePatternSync;
