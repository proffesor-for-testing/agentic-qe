/**
 * usePeers Hook
 *
 * React hook for subscribing to peer events and managing peer connections.
 * Provides real-time peer list with connection status updates.
 *
 * @module edge/webapp/hooks/usePeers
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PeerInfo, WebAppEvent, ConnectionStatus } from '../types';
import { getP2PService, P2PServiceImpl } from '../services/P2PService';

// ============================================
// Types
// ============================================

/**
 * Extended peer info with additional computed properties
 */
export interface PeerWithStatus extends PeerInfo {
  /** Whether the peer is currently active (connected and responsive) */
  isActive: boolean;

  /** Time since last activity in milliseconds */
  timeSinceLastSeen: number;

  /** Human-readable status string */
  statusText: string;
}

/**
 * Peer event types for the callback
 */
export type PeerEventType =
  | 'discovered'
  | 'connected'
  | 'disconnected'
  | 'updated';

/**
 * Peer event data for callbacks
 */
export interface PeerEvent {
  type: PeerEventType;
  peer?: PeerInfo;
  peerId?: string;
  timestamp: number;
}

/**
 * Options for the usePeers hook
 */
export interface UsePeersOptions {
  /** Filter peers by connection state */
  filterByState?: string | string[];

  /** Sort peers by field */
  sortBy?: 'id' | 'latencyMs' | 'lastSeen' | 'patternsShared';

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';

  /** Callback when peer events occur */
  onPeerEvent?: (event: PeerEvent) => void;

  /** Auto-refresh interval in milliseconds (0 to disable) */
  refreshInterval?: number;
}

/**
 * Return value from usePeers hook
 */
export interface UsePeersReturn {
  /** List of connected peers with status info */
  peers: PeerWithStatus[];

  /** Total number of peers */
  peerCount: number;

  /** Number of active (connected) peers */
  activePeerCount: number;

  /** Whether any peers are connected */
  hasConnectedPeers: boolean;

  /** Whether peers are currently being loaded/synced */
  isLoading: boolean;

  /** Connect to a new peer by ID */
  connect: (peerId: string) => Promise<void>;

  /** Disconnect from a peer */
  disconnect: (peerId: string) => Promise<void>;

  /** Sync CRDT state with a specific peer */
  syncWithPeer: (peerId: string) => Promise<void>;

  /** Refresh the peer list */
  refresh: () => void;

  /** Get a specific peer by ID */
  getPeer: (peerId: string) => PeerWithStatus | undefined;

  /** Check if a specific peer is connected */
  isPeerConnected: (peerId: string) => boolean;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Compute status text from connection state
 */
function getStatusText(state: string): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'disconnected':
      return 'Disconnected';
    case 'failed':
      return 'Connection Failed';
    default:
      return state;
  }
}

/**
 * Enhance peer info with computed properties
 */
function enhancePeer(peer: PeerInfo): PeerWithStatus {
  const now = Date.now();
  const timeSinceLastSeen = now - peer.lastSeen;
  const isActive = peer.connectionState === 'connected' && timeSinceLastSeen < 60000;

  return {
    ...peer,
    isActive,
    timeSinceLastSeen,
    statusText: getStatusText(peer.connectionState),
  };
}

/**
 * Sort peers by the specified field
 */
function sortPeers(
  peers: PeerWithStatus[],
  sortBy: UsePeersOptions['sortBy'],
  sortOrder: UsePeersOptions['sortOrder']
): PeerWithStatus[] {
  if (!sortBy) return peers;

  const sorted = [...peers].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'id':
        comparison = a.id.localeCompare(b.id);
        break;
      case 'latencyMs':
        comparison = a.latencyMs - b.latencyMs;
        break;
      case 'lastSeen':
        comparison = a.lastSeen - b.lastSeen;
        break;
      case 'patternsShared':
        comparison = a.patternsShared - b.patternsShared;
        break;
      default:
        comparison = 0;
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Filter peers by connection state
 */
function filterPeers(
  peers: PeerWithStatus[],
  filterByState?: string | string[]
): PeerWithStatus[] {
  if (!filterByState) return peers;

  const states = Array.isArray(filterByState) ? filterByState : [filterByState];
  return peers.filter((peer) => states.includes(peer.connectionState));
}

// ============================================
// usePeers Hook
// ============================================

/**
 * Hook for subscribing to peer events and managing peer connections.
 *
 * @param options - Configuration options
 * @returns Peer list, status, and control methods
 *
 * @example
 * ```tsx
 * function PeerPanel() {
 *   const {
 *     peers,
 *     activePeerCount,
 *     connect,
 *     disconnect,
 *     syncWithPeer,
 *   } = usePeers({
 *     sortBy: 'latencyMs',
 *     sortOrder: 'asc',
 *     onPeerEvent: (event) => console.log('Peer event:', event),
 *   });
 *
 *   return (
 *     <div>
 *       <h2>Peers ({activePeerCount} active)</h2>
 *       <ul>
 *         {peers.map((peer) => (
 *           <li key={peer.id}>
 *             {peer.id} - {peer.statusText} ({peer.latencyMs}ms)
 *             <button onClick={() => disconnect(peer.id)}>Disconnect</button>
 *             <button onClick={() => syncWithPeer(peer.id)}>Sync</button>
 *           </li>
 *         ))}
 *       </ul>
 *       <button onClick={() => connect('new-peer-id')}>Add Peer</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePeers(options: UsePeersOptions = {}): UsePeersReturn {
  const {
    filterByState,
    sortBy,
    sortOrder = 'asc',
    onPeerEvent,
    refreshInterval = 0,
  } = options;

  // State
  const [rawPeers, setRawPeers] = useState<PeerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Refs
  const serviceRef = useRef<P2PServiceImpl | null>(null);
  const unsubscribeStateRef = useRef<(() => void) | null>(null);
  const unsubscribeEventRef = useRef<(() => void) | null>(null);
  const onPeerEventRef = useRef(onPeerEvent);
  const mountedRef = useRef(true);

  // Keep callback ref updated
  useEffect(() => {
    onPeerEventRef.current = onPeerEvent;
  }, [onPeerEvent]);

  // Subscribe to service
  useEffect(() => {
    mountedRef.current = true;
    serviceRef.current = getP2PService();

    // Subscribe to state changes
    unsubscribeStateRef.current = serviceRef.current.subscribe((state) => {
      if (mountedRef.current) {
        setRawPeers(state.peers);
      }
    });

    // Subscribe to peer events
    unsubscribeEventRef.current = serviceRef.current.onEvent((event: WebAppEvent) => {
      if (!mountedRef.current) return;

      let peerEvent: PeerEvent | null = null;

      switch (event.type) {
        case 'peer:discovered':
          peerEvent = {
            type: 'discovered',
            peer: event.peer,
            timestamp: Date.now(),
          };
          break;
        case 'peer:connected':
          peerEvent = {
            type: 'connected',
            peer: event.peer,
            timestamp: Date.now(),
          };
          break;
        case 'peer:disconnected':
          peerEvent = {
            type: 'disconnected',
            peerId: event.peerId,
            timestamp: Date.now(),
          };
          break;
      }

      if (peerEvent) {
        onPeerEventRef.current?.(peerEvent);
      }
    });

    // Get initial state
    setRawPeers(serviceRef.current.getState().peers);

    return () => {
      mountedRef.current = false;
      if (unsubscribeStateRef.current) {
        unsubscribeStateRef.current();
      }
      if (unsubscribeEventRef.current) {
        unsubscribeEventRef.current();
      }
    };
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  // Update time-based computed properties on refresh
  useEffect(() => {
    // Force re-computation of timeSinceLastSeen
    setRawPeers((prev) => [...prev]);
  }, [refreshTrigger]);

  // Processed peers with filtering and sorting
  const peers = useMemo(() => {
    let processed = rawPeers.map(enhancePeer);
    processed = filterPeers(processed, filterByState);
    processed = sortPeers(processed, sortBy, sortOrder);
    return processed;
  }, [rawPeers, filterByState, sortBy, sortOrder]);

  // Derived state
  const peerCount = peers.length;
  const activePeerCount = useMemo(
    () => peers.filter((p) => p.isActive).length,
    [peers]
  );
  const hasConnectedPeers = activePeerCount > 0;

  // Connect to a peer
  const connect = useCallback(async (peerId: string): Promise<void> => {
    if (!serviceRef.current) {
      throw new Error('P2P service not available');
    }

    setIsLoading(true);
    try {
      await serviceRef.current.connect(peerId);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Disconnect from a peer
  const disconnect = useCallback(async (peerId: string): Promise<void> => {
    if (!serviceRef.current) {
      throw new Error('P2P service not available');
    }

    await serviceRef.current.disconnect(peerId);
  }, []);

  // Sync with a peer
  const syncWithPeer = useCallback(async (peerId: string): Promise<void> => {
    if (!serviceRef.current) {
      throw new Error('P2P service not available');
    }

    setIsLoading(true);
    try {
      await serviceRef.current.syncCRDT(peerId);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh peer list
  const refresh = useCallback((): void => {
    if (serviceRef.current) {
      setRawPeers(serviceRef.current.getState().peers);
    }
  }, []);

  // Get a specific peer
  const getPeer = useCallback(
    (peerId: string): PeerWithStatus | undefined => {
      return peers.find((p) => p.id === peerId);
    },
    [peers]
  );

  // Check if peer is connected
  const isPeerConnected = useCallback(
    (peerId: string): boolean => {
      const peer = peers.find((p) => p.id === peerId);
      return peer?.connectionState === 'connected';
    },
    [peers]
  );

  return {
    peers,
    peerCount,
    activePeerCount,
    hasConnectedPeers,
    isLoading,
    connect,
    disconnect,
    syncWithPeer,
    refresh,
    getPeer,
    isPeerConnected,
  };
}

export default usePeers;
