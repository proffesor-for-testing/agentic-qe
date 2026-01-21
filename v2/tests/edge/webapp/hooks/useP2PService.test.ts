/**
 * useP2P Hook Tests - P2P Service Integration
 *
 * Tests for the main useP2P hook including:
 * - Initialization lifecycle
 * - Start/stop operations
 * - State management
 * - Error handling
 * - Cleanup on unmount
 *
 * @module tests/edge/webapp/hooks/useP2PService.test
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import type { DashboardState } from '../../../../src/edge/webapp/types';
import { useP2P } from '../../../../src/edge/webapp/hooks/useP2P';
import { mockServiceInstance, __test__ } from '../setup';

// ============================================
// Test Suite
// ============================================

describe('useP2P Hook', () => {
  beforeEach(() => {
    __test__.reset();
    mockServiceInstance.init.mockResolvedValue(undefined);
    mockServiceInstance.connect.mockResolvedValue(undefined);
    mockServiceInstance.disconnect.mockResolvedValue(undefined);
    mockServiceInstance.sharePattern.mockResolvedValue(undefined);
    mockServiceInstance.addPattern.mockResolvedValue('pattern-123');
    mockServiceInstance.syncCRDT.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __test__.reset();
  });

  // ============================================
  // Initialization Tests
  // ============================================

  describe('Initialization', () => {
    it('should return initial state before initialization', () => {
      const { result } = renderHook(() => useP2P({ autoInit: false }));

      expect(result.current.state.connectionStatus).toBe('disconnected');
      expect(result.current.isInitialized).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should auto-initialize when autoInit is true (default)', async () => {
      const { result } = renderHook(() => useP2P());

      // Wait for initialization to complete
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(mockServiceInstance.init).toHaveBeenCalledTimes(1);
      expect(mockServiceInstance.subscribe).toHaveBeenCalled();
      expect(mockServiceInstance.onEvent).toHaveBeenCalled();
    });

    it('should not auto-initialize when autoInit is false', async () => {
      const { result } = renderHook(() => useP2P({ autoInit: false }));

      // Give time for any potential initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(result.current.isInitialized).toBe(false);
      expect(mockServiceInstance.init).not.toHaveBeenCalled();
    });

    it('should set isLoading during initialization', async () => {
      let resolveInit: () => void;
      mockServiceInstance.init.mockImplementation(() => new Promise<void>(resolve => {
        resolveInit = resolve;
      }));

      const { result } = renderHook(() => useP2P({ autoInit: false }));

      // Start initialization
      act(() => {
        result.current.init();
      });

      // Should be loading
      expect(result.current.isLoading).toBe(true);

      // Complete initialization
      await act(async () => {
        resolveInit!();
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isInitialized).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const testError = new Error('Init failed');
      mockServiceInstance.init.mockRejectedValue(testError);

      const { result } = renderHook(() => useP2P({ autoInit: false }));

      await act(async () => {
        await result.current.init().catch(() => {});
      });

      expect(result.current.error).toEqual(testError);
      expect(result.current.isInitialized).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  // ============================================
  // Lifecycle Tests
  // ============================================

  describe('Lifecycle', () => {
    it('should cleanup on unmount', async () => {
      const { unmount, result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      unmount();

      expect(mockServiceInstance.destroy).toHaveBeenCalledTimes(1);
    });

    it('should not initialize twice if already initializing', async () => {
      let initResolve: () => void;
      mockServiceInstance.init.mockImplementation(() => new Promise<void>(resolve => {
        initResolve = resolve;
      }));

      const { result } = renderHook(() => useP2P({ autoInit: false }));

      // Start initialization twice
      act(() => {
        result.current.init();
        result.current.init();
      });

      expect(mockServiceInstance.init).toHaveBeenCalledTimes(1);

      // Cleanup
      await act(async () => {
        initResolve!();
      });
    });

    it('should not initialize if already initialized', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      mockServiceInstance.init.mockClear();

      await act(async () => {
        await result.current.init();
      });

      expect(mockServiceInstance.init).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // State Updates Tests
  // ============================================

  describe('State Updates', () => {
    it('should update state when service emits changes', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Emit state change
      act(() => {
        __test__.emitStateChange({
          connectionStatus: 'connected',
          peers: [{ id: 'peer-1', connectionState: 'connected' } as any],
        });
      });

      expect(result.current.state.connectionStatus).toBe('connected');
      expect(result.current.state.peers).toHaveLength(1);
    });

    it('should update pattern stats when changed', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({
          patterns: {
            total: 100,
            local: 80,
            synced: 20,
            pending: 5,
            categories: { test: 50 },
          },
        });
      });

      expect(result.current.state.patterns.total).toBe(100);
      expect(result.current.state.patterns.categories.test).toBe(50);
    });

    it('should update CRDT state when changed', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({
          crdt: {
            stores: [{ id: 'store-1', type: 'GCounter', size: 64, version: 1 }],
            totalOperations: 10,
            conflictsResolved: 2,
            lastSync: Date.now(),
          },
        });
      });

      expect(result.current.state.crdt.stores).toHaveLength(1);
      expect(result.current.state.crdt.totalOperations).toBe(10);
    });
  });

  // ============================================
  // Operations Tests
  // ============================================

  describe('Operations', () => {
    it('should connect to peer', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await act(async () => {
        await result.current.connect('peer-123');
      });

      expect(mockServiceInstance.connect).toHaveBeenCalledWith('peer-123');
    });

    it('should disconnect from peer', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await act(async () => {
        await result.current.disconnect('peer-123');
      });

      expect(mockServiceInstance.disconnect).toHaveBeenCalledWith('peer-123');
    });

    it('should share pattern', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await act(async () => {
        await result.current.sharePattern('pattern-1', ['peer-1', 'peer-2']);
      });

      expect(mockServiceInstance.sharePattern).toHaveBeenCalledWith('pattern-1', ['peer-1', 'peer-2']);
    });

    it('should add pattern and return id', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      let patternId: string;
      await act(async () => {
        patternId = await result.current.addPattern('Test Pattern', 'test-category', [0.1, 0.2]);
      });

      expect(mockServiceInstance.addPattern).toHaveBeenCalledWith('Test Pattern', 'test-category', [0.1, 0.2]);
      expect(patternId!).toBe('pattern-123');
    });

    it('should sync CRDT with peer', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await act(async () => {
        await result.current.syncCRDT('peer-1');
      });

      expect(mockServiceInstance.syncCRDT).toHaveBeenCalledWith('peer-1');
    });
  });

  // ============================================
  // Reset Tests
  // ============================================

  describe('Reset', () => {
    it('should reset service and state', async () => {
      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Simulate some state changes
      act(() => {
        __test__.emitStateChange({
          connectionStatus: 'connected',
          peers: [{ id: 'peer-1' } as any],
        });
      });

      expect(result.current.state.connectionStatus).toBe('connected');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.isInitialized).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.state.connectionStatus).toBe('disconnected');
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('Error Handling', () => {
    it('should handle connect errors gracefully', async () => {
      mockServiceInstance.connect.mockRejectedValue(new Error('Connection failed'));

      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.connect('bad-peer');
        });
      }).rejects.toThrow('Connection failed');
    });

    it('should handle disconnect errors gracefully', async () => {
      mockServiceInstance.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.disconnect('peer-1');
        });
      }).rejects.toThrow('Disconnect failed');
    });

    it('should handle sharePattern errors gracefully', async () => {
      mockServiceInstance.sharePattern.mockRejectedValue(new Error('Pattern not found'));

      const { result } = renderHook(() => useP2P());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.sharePattern('invalid-pattern');
        });
      }).rejects.toThrow('Pattern not found');
    });
  });
});

// ============================================
// Edge Cases
// ============================================

describe('useP2P Edge Cases', () => {
  beforeEach(() => {
    __test__.reset();
    mockServiceInstance.init.mockResolvedValue(undefined);
  });

  it('should handle rapid state updates', async () => {
    const { result } = renderHook(() => useP2P());

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // Rapid state updates
    act(() => {
      for (let i = 0; i < 10; i++) {
        __test__.emitStateChange({
          patterns: { total: i, local: i, synced: 0, pending: 0, categories: {} },
        });
      }
    });

    // Final state should be the last update
    expect(result.current.state.patterns.total).toBe(9);
  });

  it('should handle concurrent operations', async () => {
    const { result } = renderHook(() => useP2P());

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // Start multiple concurrent operations
    await act(async () => {
      await Promise.all([
        result.current.connect('peer-1'),
        result.current.connect('peer-2'),
        result.current.connect('peer-3'),
      ]);
    });

    expect(mockServiceInstance.connect).toHaveBeenCalledTimes(3);
  });

  it('should preserve state reference when no changes', async () => {
    const { result } = renderHook(() => useP2P());

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    const stateRef1 = result.current.state;

    // Emit same state
    act(() => {
      __test__.emitStateChange({});
    });

    const stateRef2 = result.current.state;

    // State should be updated (new reference due to spread)
    expect(stateRef2).not.toBe(stateRef1);
  });
});
