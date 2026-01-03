/**
 * useConnection Hook
 *
 * Track connection state with granular updates.
 *
 * @module edge/webapp/hooks/p2p/useConnection
 * @version 1.0.0
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useP2PContext, P2PEventType } from '../../context/P2PContext';
import type {
  UseConnectionOptions,
  UseConnectionReturn,
  ConnectionEvent,
  ConnectionState,
  PeerState,
  ConnectionQuality,
  PeerId,
} from './types';

/** Maximum number of connection events to keep in history */
const MAX_HISTORY_SIZE = 50;

/** Default connection quality when not available */
const DEFAULT_QUALITY: ConnectionQuality = {
  rttMs: 0,
  packetLossPercent: 0,
  availableBandwidth: 0,
  localCandidateType: 'unknown',
  remoteCandidateType: 'unknown',
  measuredAt: Date.now(),
};

/**
 * Hook for tracking connection state with granular updates.
 *
 * @example
 * ```tsx
 * // Track overall connection state
 * function ConnectionStatus() {
 *   const { state, isConnected, latencyMs, reconnect } = useConnection();
 *
 *   return (
 *     <div>
 *       <span className={`status-${state}`}>{state}</span>
 *       {isConnected && <span>Latency: {latencyMs}ms</span>}
 *       {!isConnected && (
 *         <button onClick={reconnect}>Reconnect</button>
 *       )}
 *     </div>
 *   );
 * }
 *
 * // Track specific peer connection
 * function PeerConnection({ peerId }: { peerId: string }) {
 *   const { peerState, isConnected, quality } = useConnection({ peerId });
 *
 *   if (!peerState) return <span>Peer not found</span>;
 *
 *   return (
 *     <div>
 *       <span>Peer: {peerId}</span>
 *       <span>Status: {peerState.connectionState}</span>
 *       {quality && <span>RTT: {quality.rttMs}ms</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useConnection(options: UseConnectionOptions = {}): UseConnectionReturn {
  const { peerId } = options;

  const context = useP2PContext();
  const [connectionHistory, setConnectionHistory] = useState<ConnectionEvent[]>([]);
  const previousStateRef = useRef<ConnectionState>('disconnected');

  // Get the current connection state
  const state: ConnectionState = useMemo(() => {
    if (peerId) {
      const peer = context.peers.get(peerId);
      return peer?.connectionState ?? 'disconnected';
    }
    return context.connectionState;
  }, [peerId, context.peers, context.connectionState]);

  // Get specific peer state if tracking a peer
  const peerState: PeerState | null = useMemo(() => {
    if (!peerId) return null;
    return context.peers.get(peerId) ?? null;
  }, [peerId, context.peers]);

  // Get connection quality
  const quality: ConnectionQuality | null = useMemo(() => {
    if (peerState) {
      return peerState.quality;
    }
    // For overall connection, aggregate from connected peers
    const connectedPeers = Array.from(context.peers.values()).filter(
      (p) => p.connectionState === 'connected'
    );
    if (connectedPeers.length === 0) return null;

    // Average quality across connected peers
    const avgRtt =
      connectedPeers.reduce((sum, p) => sum + p.quality.rttMs, 0) / connectedPeers.length;
    const avgPacketLoss =
      connectedPeers.reduce((sum, p) => sum + p.quality.packetLossPercent, 0) /
      connectedPeers.length;
    const avgBandwidth =
      connectedPeers.reduce((sum, p) => sum + p.quality.availableBandwidth, 0) /
      connectedPeers.length;

    return {
      rttMs: Math.round(avgRtt),
      packetLossPercent: avgPacketLoss,
      availableBandwidth: avgBandwidth,
      localCandidateType: 'aggregate',
      remoteCandidateType: 'aggregate',
      measuredAt: Date.now(),
    };
  }, [peerState, context.peers]);

  // Derived state booleans
  const isConnected = state === 'connected';
  const isConnecting = state === 'connecting';
  const isDisconnected = state === 'disconnected';
  const isError = state === 'error';

  // Latency from quality
  const latencyMs = quality?.rttMs ?? 0;
  const packetLossPercent = quality?.packetLossPercent ?? 0;

  // Track connection state changes
  useEffect(() => {
    if (previousStateRef.current !== state) {
      const event: ConnectionEvent = {
        timestamp: Date.now(),
        fromState: previousStateRef.current,
        toState: state,
      };

      setConnectionHistory((prev) => {
        const updated = [event, ...prev];
        return updated.slice(0, MAX_HISTORY_SIZE);
      });

      previousStateRef.current = state;
    }
  }, [state]);

  // Reconnect function
  const reconnect = useCallback(async (): Promise<void> => {
    if (peerId) {
      // Reconnect to specific peer
      const peer = context.peers.get(peerId);
      if (peer && peer.connectionState !== 'connected') {
        await context.connectToPeer(peerId);
      }
    } else {
      // Re-initialize the service
      if (!context.isInitialized) {
        await context.initialize();
      }
    }
  }, [peerId, context]);

  // Disconnect function
  const disconnect = useCallback(async (): Promise<void> => {
    if (peerId) {
      await context.disconnectFromPeer(peerId);
    } else {
      // Disconnect all peers
      const peerIds = Array.from(context.peers.keys());
      await Promise.all(peerIds.map((id) => context.disconnectFromPeer(id)));
    }
  }, [peerId, context]);

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    unsubscribes.push(
      context.subscribe(P2PEventType.CONNECTION_STATE_CHANGED, (event) => {
        const data = event.data as { state: ConnectionState; reason?: string };
        // Update history with reason if available
        if (data.reason) {
          setConnectionHistory((prev) => {
            if (prev.length > 0) {
              const updated = [...prev];
              updated[0] = { ...updated[0], reason: data.reason };
              return updated;
            }
            return prev;
          });
        }
      })
    );

    // For peer-specific tracking
    if (peerId) {
      unsubscribes.push(
        context.subscribe(P2PEventType.PEER_UPDATED, (event) => {
          const data = event.data as { peerId: PeerId };
          if (data.peerId === peerId) {
            // Force re-render when tracked peer is updated
            setConnectionHistory((prev) => [...prev]);
          }
        })
      );

      unsubscribes.push(
        context.subscribe(P2PEventType.PEER_DISCONNECTED, (event) => {
          const data = event.data as { peerId: PeerId };
          if (data.peerId === peerId) {
            const disconnectEvent: ConnectionEvent = {
              timestamp: Date.now(),
              fromState: previousStateRef.current,
              toState: 'disconnected',
              reason: 'Peer disconnected',
            };
            setConnectionHistory((prev) => [disconnectEvent, ...prev].slice(0, MAX_HISTORY_SIZE));
            previousStateRef.current = 'disconnected';
          }
        })
      );
    }

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [context, peerId]);

  return {
    state,
    isConnected,
    isConnecting,
    isDisconnected,
    isError,
    peerState,
    quality,
    latencyMs,
    packetLossPercent,
    reconnect,
    disconnect,
    connectionHistory,
  };
}

export default useConnection;
