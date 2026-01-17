/**
 * usePeers Hook
 *
 * Subscribe to peer discovery and connection events.
 *
 * @module edge/webapp/hooks/p2p/usePeers
 * @version 1.0.0
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useP2PContext, P2PEventType } from '../../context/P2PContext';
import type {
  UsePeersOptions,
  UsePeersReturn,
  PeerState,
  PeerId,
  PeerFilter,
} from './types';

/**
 * Hook for managing peer discovery and connections.
 *
 * @example
 * ```tsx
 * function PeerList() {
 *   const {
 *     peers,
 *     connectedPeers,
 *     connect,
 *     disconnect,
 *     onPeerDiscovered,
 *   } = usePeers({
 *     filter: { connectionState: ['connected', 'connecting'] },
 *     sortBy: 'lastSeen',
 *   });
 *
 *   useEffect(() => {
 *     return onPeerDiscovered((peer) => {
 *       console.log('New peer discovered:', peer.id);
 *     });
 *   }, [onPeerDiscovered]);
 *
 *   return (
 *     <ul>
 *       {peers.map((peer) => (
 *         <PeerItem
 *           key={peer.id}
 *           peer={peer}
 *           onConnect={() => connect(peer.id)}
 *           onDisconnect={() => disconnect(peer.id)}
 *         />
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function usePeers(options: UsePeersOptions = {}): UsePeersReturn {
  const {
    autoSubscribe = true,
    filter,
    sortBy = 'lastSeen',
    sortDirection = 'desc',
  } = options;

  const context = useP2PContext();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const filterRef = useRef(filter);

  // Keep filter ref updated
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // Apply filter to peers
  const applyFilter = useCallback((peers: PeerState[], peerFilter?: PeerFilter): PeerState[] => {
    if (!peerFilter) return peers;

    return peers.filter((peer) => {
      // Filter by connection state
      if (peerFilter.connectionState && peerFilter.connectionState.length > 0) {
        if (!peerFilter.connectionState.includes(peer.connectionState)) {
          return false;
        }
      }

      // Filter by minimum quality (using packet loss as inverse quality metric)
      if (peerFilter.minQuality !== undefined) {
        const qualityScore = 1 - (peer.quality.packetLossPercent / 100);
        if (qualityScore < peerFilter.minQuality) {
          return false;
        }
      }

      // Filter by maximum latency
      if (peerFilter.maxLatencyMs !== undefined) {
        if (peer.quality.rttMs > peerFilter.maxLatencyMs) {
          return false;
        }
      }

      // Filter by patterns shared
      if (peerFilter.hasPatterns) {
        if (peer.patternsShared <= 0) {
          return false;
        }
      }

      return true;
    });
  }, []);

  // Sort peers
  const sortPeers = useCallback((peers: PeerState[], by: string, direction: 'asc' | 'desc'): PeerState[] => {
    return [...peers].sort((a, b) => {
      let comparison = 0;

      switch (by) {
        case 'id':
          comparison = a.id.localeCompare(b.id);
          break;
        case 'lastSeen':
          comparison = a.lastSeen - b.lastSeen;
          break;
        case 'latency':
          comparison = a.quality.rttMs - b.quality.rttMs;
          break;
        case 'patternsShared':
          comparison = a.patternsShared - b.patternsShared;
          break;
        default:
          comparison = 0;
      }

      return direction === 'desc' ? -comparison : comparison;
    });
  }, []);

  // Memoized filtered and sorted peer list
  const peers = useMemo(() => {
    const peerArray = Array.from(context.peers.values());
    const filtered = applyFilter(peerArray, filter);
    return sortPeers(filtered, sortBy, sortDirection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.peers, filter, sortBy, sortDirection, refreshTrigger, applyFilter, sortPeers]);

  // Connected peers only
  const connectedPeers = useMemo(() => {
    return peers.filter((peer) => peer.connectionState === 'connected');
  }, [peers]);

  // Get a specific peer by ID
  const getPeer = useCallback((peerId: PeerId): PeerState | undefined => {
    return context.peers.get(peerId);
  }, [context.peers]);

  // Connect to a peer
  const connect = useCallback(async (peerId: PeerId): Promise<void> => {
    await context.connectToPeer(peerId);
  }, [context]);

  // Disconnect from a peer
  const disconnect = useCallback(async (peerId: PeerId): Promise<void> => {
    await context.disconnectFromPeer(peerId);
  }, [context]);

  // Force refresh peer list
  const refreshPeers = useCallback((): void => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Subscribe to peer discovered events
  const onPeerDiscovered = useCallback((handler: (peer: PeerState) => void): () => void => {
    return context.subscribe(P2PEventType.PEER_DISCOVERED, (event) => {
      handler((event.data as { peer: PeerState }).peer);
    });
  }, [context]);

  // Subscribe to peer connected events
  const onPeerConnected = useCallback((handler: (peer: PeerState) => void): () => void => {
    return context.subscribe(P2PEventType.PEER_CONNECTED, (event) => {
      const { peerId } = event.data as { peerId: PeerId };
      const peer = context.peers.get(peerId);
      if (peer) {
        handler(peer);
      }
    });
  }, [context]);

  // Subscribe to peer disconnected events
  const onPeerDisconnected = useCallback((handler: (peerId: PeerId) => void): () => void => {
    return context.subscribe(P2PEventType.PEER_DISCONNECTED, (event) => {
      handler((event.data as { peerId: PeerId }).peerId);
    });
  }, [context]);

  // Auto-subscribe to peer events for reactive updates
  useEffect(() => {
    if (!autoSubscribe) return;

    const unsubscribes: (() => void)[] = [];

    // Refresh on any peer event
    unsubscribes.push(
      context.subscribe(P2PEventType.PEER_DISCOVERED, () => refreshPeers())
    );
    unsubscribes.push(
      context.subscribe(P2PEventType.PEER_CONNECTED, () => refreshPeers())
    );
    unsubscribes.push(
      context.subscribe(P2PEventType.PEER_DISCONNECTED, () => refreshPeers())
    );
    unsubscribes.push(
      context.subscribe(P2PEventType.PEER_UPDATED, () => refreshPeers())
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [autoSubscribe, context, refreshPeers]);

  return {
    peers,
    peerCount: peers.length,
    connectedPeers,
    connectedCount: connectedPeers.length,
    getPeer,
    connect,
    disconnect,
    refreshPeers,
    onPeerDiscovered,
    onPeerConnected,
    onPeerDisconnected,
  };
}

export default usePeers;
