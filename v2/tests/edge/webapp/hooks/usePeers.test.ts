/**
 * usePeers Hook Tests
 *
 * Tests for the usePeers hook including:
 * - Peer list subscription
 * - Peer list updates
 * - Connect/disconnect actions
 * - CRDT sync operations
 *
 * @module tests/edge/webapp/hooks/usePeers.test
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import type { PeerInfo, DashboardState } from '../../../../src/edge/webapp/types';
import { usePeers, useP2P } from '../../../../src/edge/webapp/hooks/useP2P';
import { mockServiceInstance, __test__ } from '../setup';

// Helper hook that ensures subscription is set up for testing state updates
// Note: usePeers() calls useP2P({ autoInit: false }) internally which creates separate state
// So for state update tests, we access state.peers directly from useP2P({ autoInit: true })
function usePeersWithInit() {
  const p2p = useP2P({ autoInit: true });
  return {
    peers: p2p.state.peers,
    connect: p2p.connect,
    disconnect: p2p.disconnect,
    syncCRDT: p2p.syncCRDT,
    isInitialized: p2p.isInitialized,
  };
}

// ============================================
// Test Suite
// ============================================

describe('usePeers Hook', () => {
  beforeEach(() => {
    __test__.reset();
    mockServiceInstance.init.mockResolvedValue(undefined);
    mockServiceInstance.connect.mockResolvedValue(undefined);
    mockServiceInstance.disconnect.mockResolvedValue(undefined);
    mockServiceInstance.syncCRDT.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __test__.reset();
  });

  // ============================================
  // Initial State Tests
  // ============================================

  describe('Initial State', () => {
    it('should return empty peers array initially', () => {
      const { result } = renderHook(() => usePeers());

      expect(result.current.peers).toEqual([]);
    });

    it('should expose connect function', () => {
      const { result } = renderHook(() => usePeers());

      expect(typeof result.current.connect).toBe('function');
    });

    it('should expose disconnect function', () => {
      const { result } = renderHook(() => usePeers());

      expect(typeof result.current.disconnect).toBe('function');
    });

    it('should expose syncCRDT function', () => {
      const { result } = renderHook(() => usePeers());

      expect(typeof result.current.syncCRDT).toBe('function');
    });
  });

  // ============================================
  // Peer List Updates Tests
  // ============================================

  describe('Peer List Updates', () => {
    it('should update when peer is added', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const newPeer: PeerInfo = {
        id: 'peer-1',
        publicKey: 'pk-1',
        connectionState: 'connected',
        latencyMs: 25,
        lastSeen: Date.now(),
        patternsShared: 0,
      };

      act(() => {
        __test__.emitStateChange({ peers: [newPeer] });
      });

      expect(result.current.peers).toHaveLength(1);
      expect(result.current.peers[0].id).toBe('peer-1');
    });

    it('should update when multiple peers are added', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const peers: PeerInfo[] = [
        {
          id: 'peer-1',
          publicKey: 'pk-1',
          connectionState: 'connected',
          latencyMs: 25,
          lastSeen: Date.now(),
          patternsShared: 5,
        },
        {
          id: 'peer-2',
          publicKey: 'pk-2',
          connectionState: 'connected',
          latencyMs: 35,
          lastSeen: Date.now(),
          patternsShared: 10,
        },
        {
          id: 'peer-3',
          publicKey: 'pk-3',
          connectionState: 'connecting',
          latencyMs: 0,
          lastSeen: Date.now(),
          patternsShared: 0,
        },
      ];

      act(() => {
        __test__.emitStateChange({ peers });
      });

      expect(result.current.peers).toHaveLength(3);
      expect(result.current.peers.map(p => p.id)).toEqual(['peer-1', 'peer-2', 'peer-3']);
    });

    it('should update when peer is removed', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Add peers first
      const peers: PeerInfo[] = [
        { id: 'peer-1', publicKey: 'pk-1', connectionState: 'connected', latencyMs: 25, lastSeen: Date.now(), patternsShared: 0 },
        { id: 'peer-2', publicKey: 'pk-2', connectionState: 'connected', latencyMs: 35, lastSeen: Date.now(), patternsShared: 0 },
      ];

      act(() => {
        __test__.emitStateChange({ peers });
      });

      expect(result.current.peers).toHaveLength(2);

      // Remove peer-1
      act(() => {
        __test__.emitStateChange({ peers: peers.filter(p => p.id !== 'peer-1') });
      });

      expect(result.current.peers).toHaveLength(1);
      expect(result.current.peers[0].id).toBe('peer-2');
    });

    it('should update when peer info changes', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const peer: PeerInfo = {
        id: 'peer-1',
        publicKey: 'pk-1',
        connectionState: 'connected',
        latencyMs: 25,
        lastSeen: Date.now(),
        patternsShared: 0,
      };

      act(() => {
        __test__.emitStateChange({ peers: [peer] });
      });

      expect(result.current.peers[0].latencyMs).toBe(25);

      // Update latency
      const updatedPeer = { ...peer, latencyMs: 50, patternsShared: 5 };
      act(() => {
        __test__.emitStateChange({ peers: [updatedPeer] });
      });

      expect(result.current.peers[0].latencyMs).toBe(50);
      expect(result.current.peers[0].patternsShared).toBe(5);
    });

    it('should handle connection state transitions', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const peer: PeerInfo = {
        id: 'peer-1',
        publicKey: 'pk-1',
        connectionState: 'connecting',
        latencyMs: 0,
        lastSeen: Date.now(),
        patternsShared: 0,
      };

      // Start connecting
      act(() => {
        __test__.emitStateChange({ peers: [peer] });
      });

      expect(result.current.peers[0].connectionState).toBe('connecting');

      // Connected
      act(() => {
        __test__.emitStateChange({ peers: [{ ...peer, connectionState: 'connected', latencyMs: 25 }] });
      });

      expect(result.current.peers[0].connectionState).toBe('connected');

      // Disconnected
      act(() => {
        __test__.emitStateChange({ peers: [{ ...peer, connectionState: 'disconnected' }] });
      });

      expect(result.current.peers[0].connectionState).toBe('disconnected');
    });
  });

  // ============================================
  // Connect Action Tests
  // ============================================

  describe('Connect Action', () => {
    it('should call service connect with peer id', async () => {
      const { result } = renderHook(() => usePeers());

      await act(async () => {
        await result.current.connect('peer-123');
      });

      expect(mockServiceInstance.connect).toHaveBeenCalledWith('peer-123');
      expect(mockServiceInstance.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle connect errors', async () => {
      mockServiceInstance.connect.mockRejectedValueOnce(new Error('Connection refused'));

      const { result } = renderHook(() => usePeers());

      await expect(async () => {
        await act(async () => {
          await result.current.connect('bad-peer');
        });
      }).rejects.toThrow('Connection refused');
    });

    it('should allow connecting to multiple peers', async () => {
      const { result } = renderHook(() => usePeers());

      await act(async () => {
        await result.current.connect('peer-1');
        await result.current.connect('peer-2');
        await result.current.connect('peer-3');
      });

      expect(mockServiceInstance.connect).toHaveBeenCalledTimes(3);
      expect(mockServiceInstance.connect).toHaveBeenNthCalledWith(1, 'peer-1');
      expect(mockServiceInstance.connect).toHaveBeenNthCalledWith(2, 'peer-2');
      expect(mockServiceInstance.connect).toHaveBeenNthCalledWith(3, 'peer-3');
    });
  });

  // ============================================
  // Disconnect Action Tests
  // ============================================

  describe('Disconnect Action', () => {
    it('should call service disconnect with peer id', async () => {
      const { result } = renderHook(() => usePeers());

      await act(async () => {
        await result.current.disconnect('peer-123');
      });

      expect(mockServiceInstance.disconnect).toHaveBeenCalledWith('peer-123');
      expect(mockServiceInstance.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle disconnect errors', async () => {
      mockServiceInstance.disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

      const { result } = renderHook(() => usePeers());

      await expect(async () => {
        await act(async () => {
          await result.current.disconnect('peer-123');
        });
      }).rejects.toThrow('Disconnect failed');
    });

    it('should handle disconnecting non-existent peer gracefully', async () => {
      mockServiceInstance.disconnect.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => usePeers());

      await act(async () => {
        await result.current.disconnect('non-existent-peer');
      });

      expect(mockServiceInstance.disconnect).toHaveBeenCalledWith('non-existent-peer');
    });
  });

  // ============================================
  // SyncCRDT Action Tests
  // ============================================

  describe('SyncCRDT Action', () => {
    it('should call service syncCRDT with peer id', async () => {
      const { result } = renderHook(() => usePeers());

      await act(async () => {
        await result.current.syncCRDT('peer-123');
      });

      expect(mockServiceInstance.syncCRDT).toHaveBeenCalledWith('peer-123');
      expect(mockServiceInstance.syncCRDT).toHaveBeenCalledTimes(1);
    });

    it('should handle syncCRDT errors', async () => {
      mockServiceInstance.syncCRDT.mockRejectedValueOnce(new Error('Sync failed'));

      const { result } = renderHook(() => usePeers());

      await expect(async () => {
        await act(async () => {
          await result.current.syncCRDT('peer-123');
        });
      }).rejects.toThrow('Sync failed');
    });

    it('should allow syncing with multiple peers', async () => {
      const { result } = renderHook(() => usePeers());

      await act(async () => {
        await Promise.all([
          result.current.syncCRDT('peer-1'),
          result.current.syncCRDT('peer-2'),
        ]);
      });

      expect(mockServiceInstance.syncCRDT).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty peer list updates', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Add some peers
      act(() => {
        __test__.emitStateChange({ peers: [
          { id: 'peer-1', publicKey: 'pk-1', connectionState: 'connected', latencyMs: 25, lastSeen: Date.now(), patternsShared: 0 },
        ]});
      });

      expect(result.current.peers).toHaveLength(1);

      // Clear all peers
      act(() => {
        __test__.emitStateChange({ peers: [] });
      });

      expect(result.current.peers).toHaveLength(0);
    });

    it('should handle rapid peer updates', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        for (let i = 0; i < 10; i++) {
          __test__.emitStateChange({ peers: [
            { id: `peer-${i}`, publicKey: `pk-${i}`, connectionState: 'connected', latencyMs: i * 10, lastSeen: Date.now(), patternsShared: i },
          ]});
        }
      });

      expect(result.current.peers).toHaveLength(1);
      expect(result.current.peers[0].id).toBe('peer-9');
    });

    it('should handle peers with different connection states', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const peers: PeerInfo[] = [
        { id: 'peer-1', publicKey: 'pk-1', connectionState: 'connected', latencyMs: 25, lastSeen: Date.now(), patternsShared: 5 },
        { id: 'peer-2', publicKey: 'pk-2', connectionState: 'connecting', latencyMs: 0, lastSeen: Date.now(), patternsShared: 0 },
        { id: 'peer-3', publicKey: 'pk-3', connectionState: 'disconnected', latencyMs: 0, lastSeen: Date.now() - 60000, patternsShared: 10 },
        { id: 'peer-4', publicKey: 'pk-4', connectionState: 'error', latencyMs: 0, lastSeen: Date.now() - 30000, patternsShared: 2 },
      ];

      act(() => {
        __test__.emitStateChange({ peers });
      });

      expect(result.current.peers).toHaveLength(4);

      const connectedPeers = result.current.peers.filter(p => p.connectionState === 'connected');
      expect(connectedPeers).toHaveLength(1);

      const connectingPeers = result.current.peers.filter(p => p.connectionState === 'connecting');
      expect(connectingPeers).toHaveLength(1);
    });

    it('should handle lastSeen updates', async () => {
      const { result } = renderHook(() => usePeersWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const initialTimestamp = Date.now() - 5000;
      const peer: PeerInfo = {
        id: 'peer-1',
        publicKey: 'pk-1',
        connectionState: 'connected',
        latencyMs: 25,
        lastSeen: initialTimestamp,
        patternsShared: 0,
      };

      act(() => {
        __test__.emitStateChange({ peers: [peer] });
      });

      expect(result.current.peers[0].lastSeen).toBe(initialTimestamp);

      // Update lastSeen
      const newTimestamp = Date.now();
      act(() => {
        __test__.emitStateChange({ peers: [{ ...peer, lastSeen: newTimestamp }] });
      });

      expect(result.current.peers[0].lastSeen).toBe(newTimestamp);
    });
  });
});
