/**
 * useConnectionStatus Hook Tests
 *
 * Tests for the useConnectionStatus hook including:
 * - Connection state transitions
 * - State persistence
 * - Error states
 *
 * @module tests/edge/webapp/hooks/useConnection.test
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import type { DashboardState, ConnectionStatus } from '../../../../src/edge/webapp/types';
import { useConnectionStatus, useP2P } from '../../../../src/edge/webapp/hooks/useP2P';
import { mockServiceInstance, __test__ } from '../setup';

// Helper hook that ensures subscription is set up for testing state updates
function useConnectionStatusWithInit() {
  const p2p = useP2P({ autoInit: true });
  return { status: p2p.state.connectionStatus, isInitialized: p2p.isInitialized };
}

// ============================================
// Test Suite
// ============================================

describe('useConnectionStatus Hook', () => {
  beforeEach(() => {
    __test__.reset();
    mockServiceInstance.init.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __test__.reset();
  });

  // ============================================
  // Initial State Tests
  // ============================================

  describe('Initial State', () => {
    it('should return disconnected initially', () => {
      const { result } = renderHook(() => useConnectionStatus());

      expect(result.current).toBe('disconnected');
    });

    it('should be a valid ConnectionStatus type', () => {
      const { result } = renderHook(() => useConnectionStatus());

      const validStatuses: ConnectionStatus[] = ['disconnected', 'connecting', 'connected', 'error'];
      expect(validStatuses).toContain(result.current);
    });
  });

  // ============================================
  // State Transition Tests
  // ============================================

  describe('State Transitions', () => {
    it('should update to connecting', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connecting' });
      });

      expect(result.current.status).toBe('connecting');
    });

    it('should update to connected', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connected' });
      });

      expect(result.current.status).toBe('connected');
    });

    it('should update to error', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'error' });
      });

      expect(result.current.status).toBe('error');
    });

    it('should update back to disconnected', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Go through connection cycle
      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connecting' });
      });
      expect(result.current.status).toBe('connecting');

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connected' });
      });
      expect(result.current.status).toBe('connected');

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'disconnected' });
      });
      expect(result.current.status).toBe('disconnected');
    });

    it('should handle full connection lifecycle', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const stateHistory: ConnectionStatus[] = [];

      // Track all state changes
      stateHistory.push(result.current.status);

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connecting' });
      });
      stateHistory.push(result.current.status);

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connected' });
      });
      stateHistory.push(result.current.status);

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'error' });
      });
      stateHistory.push(result.current.status);

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'disconnected' });
      });
      stateHistory.push(result.current.status);

      expect(stateHistory).toEqual([
        'disconnected',
        'connecting',
        'connected',
        'error',
        'disconnected',
      ]);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle rapid state transitions', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connecting' });
        __test__.emitStateChange({ connectionStatus: 'connected' });
        __test__.emitStateChange({ connectionStatus: 'disconnected' });
        __test__.emitStateChange({ connectionStatus: 'connecting' });
        __test__.emitStateChange({ connectionStatus: 'error' });
      });

      // Should reflect the last state
      expect(result.current.status).toBe('error');
    });

    it('should handle repeated same-state updates', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connected' });
      });
      expect(result.current.status).toBe('connected');

      // Multiple updates with same status
      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connected' });
        __test__.emitStateChange({ connectionStatus: 'connected' });
        __test__.emitStateChange({ connectionStatus: 'connected' });
      });

      expect(result.current.status).toBe('connected');
    });

    it('should handle transition from error to connecting', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Go to error state
      act(() => {
        __test__.emitStateChange({ connectionStatus: 'error' });
      });
      expect(result.current.status).toBe('error');

      // Retry connection
      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connecting' });
      });
      expect(result.current.status).toBe('connecting');
    });

    it('should handle transition from error to connected directly', async () => {
      const { result } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // This might happen with reconnection logic
      act(() => {
        __test__.emitStateChange({ connectionStatus: 'error' });
      });
      expect(result.current.status).toBe('error');

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connected' });
      });
      expect(result.current.status).toBe('connected');
    });
  });

  // ============================================
  // Multiple Instances Tests
  // ============================================

  describe('Multiple Instances', () => {
    it('should share state across multiple hook instances', async () => {
      const { result: result1 } = renderHook(() => useConnectionStatusWithInit());
      const { result: result2 } = renderHook(() => useConnectionStatusWithInit());

      await waitFor(() => {
        expect(result1.current.isInitialized).toBe(true);
        expect(result2.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({ connectionStatus: 'connected' });
      });

      expect(result1.current.status).toBe('connected');
      expect(result2.current.status).toBe('connected');
    });
  });
});

// ============================================
// Integration with useP2P
// ============================================

describe('Connection Status Integration', () => {
  beforeEach(() => {
    __test__.reset();
    mockServiceInstance.init.mockResolvedValue(undefined);
  });

  it('should reflect connection status from useP2P state', async () => {
    const { result } = renderHook(() => useP2P({ autoInit: true }));

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    act(() => {
      __test__.emitStateChange({ connectionStatus: 'connected' });
    });

    expect(result.current.state.connectionStatus).toBe('connected');
  });

  it('should track connection status alongside other state changes', async () => {
    const { result } = renderHook(() => useP2P({ autoInit: true }));

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    act(() => {
      __test__.emitStateChange({
        connectionStatus: 'connected',
        peers: [{ id: 'peer-1', publicKey: 'pk-1', connectionState: 'connected', latencyMs: 25, lastSeen: Date.now(), patternsShared: 0 }],
        metrics: { memoryUsage: 100, cpuUsage: 10, networkLatency: 25, messagesPerSecond: 5, uptime: 60000 },
      });
    });

    expect(result.current.state.connectionStatus).toBe('connected');
    expect(result.current.state.peers).toHaveLength(1);
    expect(result.current.state.metrics.memoryUsage).toBe(100);
  });

  it('should handle error state with error info', async () => {
    const { result } = renderHook(() => useP2P({ autoInit: true }));

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    act(() => {
      __test__.emitStateChange({ connectionStatus: 'error' });
    });

    expect(result.current.state.connectionStatus).toBe('error');
  });
});

// ============================================
// Connection State with Peers
// ============================================

describe('Connection Status with Peer Activity', () => {
  beforeEach(() => {
    __test__.reset();
    mockServiceInstance.init.mockResolvedValue(undefined);
  });

  it('should be connected when peers are present', async () => {
    const { result } = renderHook(() => useConnectionStatusWithInit());

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    act(() => {
      __test__.emitStateChange({
        connectionStatus: 'connected',
        peers: [
          { id: 'peer-1', publicKey: 'pk-1', connectionState: 'connected', latencyMs: 25, lastSeen: Date.now(), patternsShared: 0 },
        ],
      });
    });

    expect(result.current.status).toBe('connected');
  });

  it('should reflect overall connection status even if some peers disconnect', async () => {
    const { result } = renderHook(() => useConnectionStatusWithInit());

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // Connected with multiple peers
    act(() => {
      __test__.emitStateChange({
        connectionStatus: 'connected',
        peers: [
          { id: 'peer-1', publicKey: 'pk-1', connectionState: 'connected', latencyMs: 25, lastSeen: Date.now(), patternsShared: 0 },
          { id: 'peer-2', publicKey: 'pk-2', connectionState: 'connected', latencyMs: 35, lastSeen: Date.now(), patternsShared: 0 },
        ],
      });
    });

    expect(result.current.status).toBe('connected');

    // One peer disconnects but overall status stays connected
    act(() => {
      __test__.emitStateChange({
        connectionStatus: 'connected', // Overall still connected
        peers: [
          { id: 'peer-1', publicKey: 'pk-1', connectionState: 'connected', latencyMs: 25, lastSeen: Date.now(), patternsShared: 0 },
          { id: 'peer-2', publicKey: 'pk-2', connectionState: 'disconnected', latencyMs: 0, lastSeen: Date.now(), patternsShared: 0 },
        ],
      });
    });

    expect(result.current.status).toBe('connected');
  });
});
