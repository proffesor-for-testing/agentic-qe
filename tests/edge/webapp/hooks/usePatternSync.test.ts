/**
 * usePatterns Hook Tests - Pattern Sync Event Handling
 *
 * Tests for the usePatterns hook including:
 * - Pattern event handling
 * - Pattern stats updates
 * - Share pattern operations
 * - Add pattern operations
 *
 * @module tests/edge/webapp/hooks/usePatternSync.test
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import type { DashboardState, PatternStats, WebAppEvent } from '../../../../src/edge/webapp/types';
import { usePatterns, useP2PEvents, useP2P } from '../../../../src/edge/webapp/hooks/useP2P';
import { mockServiceInstance, __test__ } from '../setup';

// Helper hook that ensures subscription is set up for testing state updates
// Note: usePatterns() calls useP2P({ autoInit: false }) internally which creates separate state
// So for state update tests, we access state.patterns directly from useP2P({ autoInit: true })
function usePatternsWithInit() {
  const p2p = useP2P({ autoInit: true });
  return {
    stats: p2p.state.patterns,
    sharePattern: p2p.sharePattern,
    addPattern: p2p.addPattern,
    isInitialized: p2p.isInitialized,
  };
}

// ============================================
// Test Suite
// ============================================

describe('usePatterns Hook', () => {
  beforeEach(() => {
    __test__.reset();
    mockServiceInstance.init.mockResolvedValue(undefined);
    mockServiceInstance.sharePattern.mockResolvedValue(undefined);
    mockServiceInstance.addPattern.mockImplementation((name: string) =>
      Promise.resolve(`pattern-${Date.now()}`)
    );
  });

  afterEach(() => {
    __test__.reset();
  });

  // ============================================
  // Initial State Tests
  // ============================================

  describe('Initial State', () => {
    it('should return initial pattern stats', () => {
      const { result } = renderHook(() => usePatterns());

      expect(result.current.stats).toEqual({
        total: 0,
        local: 0,
        synced: 0,
        pending: 0,
        categories: {},
      });
    });

    it('should expose sharePattern function', () => {
      const { result } = renderHook(() => usePatterns());

      expect(typeof result.current.sharePattern).toBe('function');
    });

    it('should expose addPattern function', () => {
      const { result } = renderHook(() => usePatterns());

      expect(typeof result.current.addPattern).toBe('function');
    });
  });

  // ============================================
  // Pattern Stats Updates Tests
  // ============================================

  describe('Pattern Stats Updates', () => {
    it('should update when total count changes', async () => {
      const { result } = renderHook(() => usePatternsWithInit());

      // Wait for initialization to complete (subscription set up)
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({
          patterns: { total: 50, local: 40, synced: 10, pending: 5, categories: {} },
        });
      });

      expect(result.current.stats.total).toBe(50);
      expect(result.current.stats.local).toBe(40);
      expect(result.current.stats.synced).toBe(10);
      expect(result.current.stats.pending).toBe(5);
    });

    it('should update category counts', async () => {
      const { result } = renderHook(() => usePatternsWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const categories = {
        'security': 20,
        'performance': 15,
        'accessibility': 10,
        'test': 5,
      };

      act(() => {
        __test__.emitStateChange({
          patterns: { total: 50, local: 40, synced: 10, pending: 0, categories },
        });
      });

      expect(result.current.stats.categories).toEqual(categories);
      expect(result.current.stats.categories['security']).toBe(20);
      expect(result.current.stats.categories['performance']).toBe(15);
    });

    it('should update when patterns are synced', async () => {
      const { result } = renderHook(() => usePatternsWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Initial state with pending patterns
      act(() => {
        __test__.emitStateChange({
          patterns: { total: 100, local: 80, synced: 10, pending: 10, categories: {} },
        });
      });

      expect(result.current.stats.pending).toBe(10);

      // Patterns synced
      act(() => {
        __test__.emitStateChange({
          patterns: { total: 100, local: 80, synced: 20, pending: 0, categories: {} },
        });
      });

      expect(result.current.stats.synced).toBe(20);
      expect(result.current.stats.pending).toBe(0);
    });

    it('should handle category additions', async () => {
      const { result } = renderHook(() => usePatternsWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Start with some categories
      act(() => {
        __test__.emitStateChange({
          patterns: { total: 30, local: 30, synced: 0, pending: 0, categories: { 'security': 20, 'test': 10 } },
        });
      });

      expect(Object.keys(result.current.stats.categories)).toHaveLength(2);

      // Add new category
      act(() => {
        __test__.emitStateChange({
          patterns: { total: 45, local: 45, synced: 0, pending: 0, categories: { 'security': 20, 'test': 10, 'performance': 15 } },
        });
      });

      expect(Object.keys(result.current.stats.categories)).toHaveLength(3);
      expect(result.current.stats.categories['performance']).toBe(15);
    });
  });

  // ============================================
  // Share Pattern Tests
  // ============================================

  describe('Share Pattern', () => {
    it('should call service sharePattern with pattern id', async () => {
      const { result } = renderHook(() => usePatterns());

      await act(async () => {
        await result.current.sharePattern('pattern-123');
      });

      expect(mockServiceInstance.sharePattern).toHaveBeenCalledWith('pattern-123', undefined);
    });

    it('should call service sharePattern with peer ids', async () => {
      const { result } = renderHook(() => usePatterns());

      const peerIds = ['peer-1', 'peer-2', 'peer-3'];

      await act(async () => {
        await result.current.sharePattern('pattern-123', peerIds);
      });

      expect(mockServiceInstance.sharePattern).toHaveBeenCalledWith('pattern-123', peerIds);
    });

    it('should handle sharePattern errors', async () => {
      mockServiceInstance.sharePattern.mockRejectedValueOnce(new Error('Pattern not found'));

      const { result } = renderHook(() => usePatterns());

      await expect(async () => {
        await act(async () => {
          await result.current.sharePattern('invalid-pattern');
        });
      }).rejects.toThrow('Pattern not found');
    });

    it('should allow sharing multiple patterns', async () => {
      const { result } = renderHook(() => usePatterns());

      await act(async () => {
        await result.current.sharePattern('pattern-1');
        await result.current.sharePattern('pattern-2');
        await result.current.sharePattern('pattern-3');
      });

      expect(mockServiceInstance.sharePattern).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================
  // Add Pattern Tests
  // ============================================

  describe('Add Pattern', () => {
    it('should call service addPattern with correct params', async () => {
      const { result } = renderHook(() => usePatterns());

      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

      await act(async () => {
        await result.current.addPattern('Test Pattern', 'test-category', embedding);
      });

      expect(mockServiceInstance.addPattern).toHaveBeenCalledWith('Test Pattern', 'test-category', embedding);
    });

    it('should return pattern id from service', async () => {
      mockServiceInstance.addPattern.mockResolvedValueOnce('custom-pattern-id');

      const { result } = renderHook(() => usePatterns());

      let patternId: string;
      await act(async () => {
        patternId = await result.current.addPattern('Test', 'cat', [0.1]);
      });

      expect(patternId!).toBe('custom-pattern-id');
    });

    it('should handle addPattern errors', async () => {
      mockServiceInstance.addPattern.mockRejectedValueOnce(new Error('Invalid embedding dimensions'));

      const { result } = renderHook(() => usePatterns());

      await expect(async () => {
        await act(async () => {
          await result.current.addPattern('Test', 'cat', []);
        });
      }).rejects.toThrow('Invalid embedding dimensions');
    });

    it('should handle different embedding sizes', async () => {
      const { result } = renderHook(() => usePatterns());

      // Small embedding
      await act(async () => {
        await result.current.addPattern('Small', 'cat', Array(64).fill(0.1));
      });

      // Large embedding
      await act(async () => {
        await result.current.addPattern('Large', 'cat', Array(512).fill(0.1));
      });

      expect(mockServiceInstance.addPattern).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle zero patterns', async () => {
      const { result } = renderHook(() => usePatternsWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        __test__.emitStateChange({
          patterns: { total: 0, local: 0, synced: 0, pending: 0, categories: {} },
        });
      });

      expect(result.current.stats.total).toBe(0);
      expect(Object.keys(result.current.stats.categories)).toHaveLength(0);
    });

    it('should handle large pattern counts', async () => {
      const { result } = renderHook(() => usePatternsWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const categories: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        categories[`category-${i}`] = i * 10;
      }

      act(() => {
        __test__.emitStateChange({
          patterns: { total: 100000, local: 80000, synced: 20000, pending: 500, categories },
        });
      });

      expect(result.current.stats.total).toBe(100000);
      expect(Object.keys(result.current.stats.categories)).toHaveLength(100);
    });

    it('should handle rapid pattern updates', async () => {
      const { result } = renderHook(() => usePatternsWithInit());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        for (let i = 0; i < 20; i++) {
          __test__.emitStateChange({
            patterns: { total: i * 10, local: i * 8, synced: i * 2, pending: i, categories: { test: i * 5 } },
          });
        }
      });

      // Should reflect the last update
      expect(result.current.stats.total).toBe(190);
      expect(result.current.stats.categories.test).toBe(95);
    });

    it('should handle concurrent share operations', async () => {
      const { result } = renderHook(() => usePatterns());

      await act(async () => {
        await Promise.all([
          result.current.sharePattern('pattern-1'),
          result.current.sharePattern('pattern-2'),
          result.current.sharePattern('pattern-3'),
        ]);
      });

      expect(mockServiceInstance.sharePattern).toHaveBeenCalledTimes(3);
    });
  });
});

// ============================================
// useP2PEvents Hook Tests
// ============================================

describe('useP2PEvents Hook', () => {
  beforeEach(() => {
    __test__.reset();
    mockServiceInstance.init.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __test__.reset();
  });

  it('should receive pattern:received events', async () => {
    const eventHandler = jest.fn();

    renderHook(() => useP2PEvents(eventHandler));

    act(() => {
      __test__.emitEvent({ type: 'pattern:received', patternId: 'pattern-123', from: 'peer-1' });
    });

    expect(eventHandler).toHaveBeenCalledWith({
      type: 'pattern:received',
      patternId: 'pattern-123',
      from: 'peer-1',
    });
  });

  it('should receive pattern:synced events', async () => {
    const eventHandler = jest.fn();

    renderHook(() => useP2PEvents(eventHandler));

    act(() => {
      __test__.emitEvent({ type: 'pattern:synced', count: 10 });
    });

    expect(eventHandler).toHaveBeenCalledWith({
      type: 'pattern:synced',
      count: 10,
    });
  });

  it('should receive crdt:updated events', async () => {
    const eventHandler = jest.fn();

    renderHook(() => useP2PEvents(eventHandler));

    act(() => {
      __test__.emitEvent({ type: 'crdt:updated', storeId: 'store-1' });
    });

    expect(eventHandler).toHaveBeenCalledWith({
      type: 'crdt:updated',
      storeId: 'store-1',
    });
  });

  it('should receive crdt:conflict events', async () => {
    const eventHandler = jest.fn();

    renderHook(() => useP2PEvents(eventHandler));

    act(() => {
      __test__.emitEvent({ type: 'crdt:conflict', storeId: 'store-1', resolved: true });
    });

    expect(eventHandler).toHaveBeenCalledWith({
      type: 'crdt:conflict',
      storeId: 'store-1',
      resolved: true,
    });
  });

  it('should receive peer:connected events', async () => {
    const eventHandler = jest.fn();

    renderHook(() => useP2PEvents(eventHandler));

    const peer = {
      id: 'peer-1',
      publicKey: 'pk-1',
      connectionState: 'connected',
      latencyMs: 25,
      lastSeen: Date.now(),
      patternsShared: 0,
    };

    act(() => {
      __test__.emitEvent({ type: 'peer:connected', peer });
    });

    expect(eventHandler).toHaveBeenCalledWith({
      type: 'peer:connected',
      peer,
    });
  });

  it('should receive peer:disconnected events', async () => {
    const eventHandler = jest.fn();

    renderHook(() => useP2PEvents(eventHandler));

    act(() => {
      __test__.emitEvent({ type: 'peer:disconnected', peerId: 'peer-1' });
    });

    expect(eventHandler).toHaveBeenCalledWith({
      type: 'peer:disconnected',
      peerId: 'peer-1',
    });
  });

  it('should receive error events', async () => {
    const eventHandler = jest.fn();

    renderHook(() => useP2PEvents(eventHandler));

    act(() => {
      __test__.emitEvent({ type: 'error', message: 'Connection failed', code: 'ERR_CONN' });
    });

    expect(eventHandler).toHaveBeenCalledWith({
      type: 'error',
      message: 'Connection failed',
      code: 'ERR_CONN',
    });
  });

  it('should handle multiple events in sequence', async () => {
    const eventHandler = jest.fn();

    renderHook(() => useP2PEvents(eventHandler));

    act(() => {
      __test__.emitEvent({ type: 'pattern:received', patternId: 'p1', from: 'peer-1' });
      __test__.emitEvent({ type: 'pattern:received', patternId: 'p2', from: 'peer-1' });
      __test__.emitEvent({ type: 'pattern:synced', count: 2 });
      __test__.emitEvent({ type: 'crdt:updated', storeId: 'store-1' });
    });

    expect(eventHandler).toHaveBeenCalledTimes(4);
  });

  it('should handle dependencies correctly', async () => {
    const eventHandler = jest.fn();
    let counter = 0;

    const { rerender } = renderHook(
      ({ deps }) => useP2PEvents(eventHandler, deps),
      { initialProps: { deps: [counter] } }
    );

    // Update dependency
    counter = 1;
    rerender({ deps: [counter] });

    // Should re-subscribe with new dependency
    expect(mockServiceInstance.onEvent).toHaveBeenCalledTimes(2);
  });
});
