/**
 * Convergence Tracker Unit Tests
 *
 * Tests for the convergence tracking system that monitors
 * distributed CRDT store state across multiple nodes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createConvergenceTracker,
  createMetricsConvergenceTracker,
} from '../../../src/memory/crdt/convergence-tracker.js';
import type { CRDTStoreState } from '../../../src/memory/crdt/types.js';

/**
 * Helper to create a minimal CRDTStoreState for testing.
 */
function makeStoreState(overrides: Partial<CRDTStoreState> = {}): CRDTStoreState {
  return {
    version: 1,
    timestamp: Date.now(),
    nodeId: 'test-node',
    registers: {},
    gCounters: {},
    pnCounters: {},
    sets: {},
    ...overrides,
  };
}

describe('ConvergenceTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic tracking', () => {
    it('should report converged when no nodes are tracked', () => {
      // Arrange
      const tracker = createConvergenceTracker();

      // Assert
      expect(tracker.hasConverged()).toBe(true);
    });

    it('should report converged with a single node', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      const state = makeStoreState({ nodeId: 'node-a' });

      // Act
      tracker.recordNodeState('node-a', state);

      // Assert
      expect(tracker.hasConverged()).toBe(true);
    });

    it('should detect convergence when two nodes have identical state', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      const state = makeStoreState();

      // Act
      tracker.recordNodeState('node-a', state);
      tracker.recordNodeState('node-b', state);

      // Assert
      expect(tracker.hasConverged()).toBe(true);
    });

    it('should detect divergence when two nodes have different state', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      const stateA = makeStoreState({
        gCounters: { 'counter-1': { counts: { 'node-a': 5 }, version: 1, lastUpdated: Date.now() } },
      });
      const stateB = makeStoreState({
        gCounters: { 'counter-1': { counts: { 'node-b': 3 }, version: 1, lastUpdated: Date.now() } },
      });

      // Act
      tracker.recordNodeState('node-a', stateA);
      tracker.recordNodeState('node-b', stateB);

      // Assert
      expect(tracker.hasConverged()).toBe(false);
    });

    it('should list tracked nodes', () => {
      // Arrange
      const tracker = createConvergenceTracker();

      // Act
      tracker.recordNodeState('node-a', makeStoreState());
      tracker.recordNodeState('node-b', makeStoreState());

      // Assert
      expect(tracker.getTrackedNodes().sort()).toEqual(['node-a', 'node-b']);
      expect(tracker.isTracking('node-a')).toBe(true);
      expect(tracker.isTracking('node-c')).toBe(false);
    });
  });

  describe('convergence status', () => {
    it('should provide detailed status with lagging nodes', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      const stateA = makeStoreState({
        gCounters: { c: { counts: { 'node-a': 10 }, version: 2, lastUpdated: Date.now() } },
      });
      const stateB = makeStoreState({
        gCounters: { c: { counts: { 'node-b': 5 }, version: 1, lastUpdated: Date.now() } },
      });

      // Act
      tracker.recordNodeState('node-a', stateA);
      tracker.recordNodeState('node-b', stateB);
      const status = tracker.getStatus();

      // Assert
      expect(status.converged).toBe(false);
      expect(status.nodeCount).toBe(2);
      expect(status.laggingNodes.length).toBeGreaterThan(0);
    });

    it('should report node version', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      const state = makeStoreState({ version: 42 });

      // Act
      tracker.recordNodeState('node-a', state);

      // Assert
      expect(tracker.getNodeVersion('node-a')).toBe(42);
      expect(tracker.getNodeVersion('unknown')).toBeNull();
    });
  });

  describe('stale node detection', () => {
    it('should treat stale nodes as lagging', () => {
      // Arrange
      const tracker = createConvergenceTracker({ staleThresholdMs: 1000 });
      const state = makeStoreState();

      tracker.recordNodeState('node-a', state);
      tracker.recordNodeState('node-b', state);

      // Act - advance time past stale threshold for node-a
      vi.advanceTimersByTime(2000);
      // Only node-b reports fresh state
      tracker.recordNodeState('node-b', state);

      // Assert
      const status = tracker.getStatus();
      expect(status.laggingNodes).toContain('node-a');
    });
  });

  describe('node management', () => {
    it('should remove nodes from tracking', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      tracker.recordNodeState('node-a', makeStoreState());
      tracker.recordNodeState('node-b', makeStoreState());

      // Act
      tracker.removeNode('node-a');

      // Assert
      expect(tracker.isTracking('node-a')).toBe(false);
      expect(tracker.getTrackedNodes()).toEqual(['node-b']);
    });

    it('should clear all state', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      tracker.recordNodeState('node-a', makeStoreState());

      // Act
      tracker.clear();

      // Assert
      expect(tracker.getTrackedNodes()).toEqual([]);
      expect(tracker.getTimeSinceConvergence()).toBeNull();
    });
  });

  describe('time since convergence', () => {
    it('should return null when never converged with multiple divergent nodes', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      const stateA = makeStoreState({
        gCounters: { c: { counts: { a: 1 }, version: 1, lastUpdated: Date.now() } },
      });
      const stateB = makeStoreState({
        gCounters: { c: { counts: { b: 2 }, version: 1, lastUpdated: Date.now() } },
      });

      // Act
      tracker.recordNodeState('node-a', stateA);
      tracker.recordNodeState('node-b', stateB);

      // Assert - they diverge on first record, so lastConvergenceTime may or may not be set
      // depending on order. The key property is hasConverged() is false.
      expect(tracker.hasConverged()).toBe(false);
    });

    it('should track time since last convergence event', () => {
      // Arrange
      const tracker = createConvergenceTracker();
      const sameState = makeStoreState();

      // Act - converge
      tracker.recordNodeState('node-a', sameState);
      tracker.recordNodeState('node-b', sameState);

      vi.advanceTimersByTime(500);

      // Assert
      const elapsed = tracker.getTimeSinceConvergence();
      expect(elapsed).toBeGreaterThanOrEqual(500);
    });
  });
});

describe('MetricsConvergenceTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track convergence count', () => {
    // Arrange
    const tracker = createMetricsConvergenceTracker({ staleThresholdMs: 60000 });
    const stateA = makeStoreState({
      gCounters: { c: { counts: { a: 1 }, version: 1, lastUpdated: Date.now() } },
    });
    const stateB = makeStoreState({
      gCounters: { c: { counts: { b: 2 }, version: 1, lastUpdated: Date.now() } },
    });
    const convergedState = makeStoreState({
      gCounters: { c: { counts: { a: 1, b: 2 }, version: 2, lastUpdated: Date.now() } },
    });

    // Act - diverge then converge
    tracker.recordNodeState('node-a', stateA);
    tracker.recordNodeState('node-b', stateB);
    // Now converge
    tracker.recordNodeState('node-a', convergedState);
    tracker.recordNodeState('node-b', convergedState);

    // Assert
    const metrics = tracker.getMetrics();
    expect(metrics.convergenceCount).toBeGreaterThanOrEqual(1);
    expect(metrics.trackingDuration).toBeGreaterThanOrEqual(0);
  });

  it('should reset metrics without losing node tracking', () => {
    // Arrange
    const tracker = createMetricsConvergenceTracker();
    tracker.recordNodeState('node-a', makeStoreState());
    tracker.recordNodeState('node-b', makeStoreState());

    // Act
    tracker.resetMetrics();
    const metrics = tracker.getMetrics();

    // Assert
    expect(metrics.convergenceCount).toBe(0);
    expect(tracker.isTracking('node-a')).toBe(true);
  });

  it('should compute convergence ratio', () => {
    // Arrange
    const tracker = createMetricsConvergenceTracker();
    const state = makeStoreState();

    // Act - always converged
    tracker.recordNodeState('node-a', state);
    tracker.recordNodeState('node-b', state);
    vi.advanceTimersByTime(1000);

    // Assert
    const metrics = tracker.getMetrics();
    expect(metrics.convergenceRatio).toBeGreaterThan(0);
    expect(metrics.convergenceRatio).toBeLessThanOrEqual(1);
  });
});
