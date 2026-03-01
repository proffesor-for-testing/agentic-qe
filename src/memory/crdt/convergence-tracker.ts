/**
 * Convergence Tracker Implementation
 *
 * Tracks the state of multiple CRDT stores to determine when they have
 * converged to the same state. Used for monitoring distributed system health
 * and ensuring eventual consistency.
 *
 * @module memory/crdt/convergence-tracker
 */

import type {
  ConvergenceTracker,
  ConvergenceTrackerConfig,
  ConvergenceStatus,
  NodeStateSnapshot,
  CRDTStoreState,
} from './types.js';

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<ConvergenceTrackerConfig> = {
  historyRetentionMs: 60_000, // 1 minute
  staleThresholdMs: 30_000,   // 30 seconds
};

// =============================================================================
// Hash Utilities
// =============================================================================

/**
 * Generate a content-based hash of CRDT store state for quick comparison.
 * This hash is based on the *semantic value* of the CRDTs (what they evaluate to),
 * not the internal representations, so that stores with equivalent data produce
 * the same hash regardless of how they arrived at that state.
 *
 * Not cryptographic - just for detecting differences.
 */
function hashState(state: CRDTStoreState): string {
  const parts: string[] = [];

  // Hash registers by their current value (timestamp/nodeId determine winner, but we
  // compare the result - if both have same winner, they have same value)
  for (const [key, reg] of Object.entries(state.registers)) {
    // Include value, timestamp, and nodeId - these together determine the LWW winner
    parts.push(`r:${key}:${JSON.stringify(reg.value)}:${reg.timestamp}:${reg.nodeId}`);
  }

  // Hash G-Counters by their TOTAL value (not per-node breakdown)
  // Two stores are converged if they produce the same sum, even if the internal
  // per-node counts differ (e.g., one has extra nodes with count 0)
  for (const [key, counter] of Object.entries(state.gCounters)) {
    const total = Object.values(counter.counts).reduce((sum, c) => sum + c, 0);
    // Also include non-zero counts to detect semantic differences
    const nonZeroCounts = Object.entries(counter.counts)
      .filter(([_, count]) => count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nodeId, count]) => `${nodeId}=${count}`)
      .join(',');
    parts.push(`g:${key}:${total}:{${nonZeroCounts}}`);
  }

  // Hash PN-Counters by their NET value (positive - negative)
  // Two stores are converged if they evaluate to the same number
  for (const [key, counter] of Object.entries(state.pnCounters)) {
    const posTotal = Object.values(counter.positive.counts).reduce((sum, c) => sum + c, 0);
    const negTotal = Object.values(counter.negative.counts).reduce((sum, c) => sum + c, 0);
    const netValue = posTotal - negTotal;
    // Include non-zero contributions for semantic comparison
    const nonZeroPos = Object.entries(counter.positive.counts)
      .filter(([_, count]) => count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nodeId, count]) => `${nodeId}=+${count}`)
      .join(',');
    const nonZeroNeg = Object.entries(counter.negative.counts)
      .filter(([_, count]) => count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nodeId, count]) => `${nodeId}=-${count}`)
      .join(',');
    parts.push(`p:${key}:${netValue}:{${nonZeroPos}|${nonZeroNeg}}`);
  }

  // Hash OR-Sets by their active elements (elements with at least one non-tombstoned tag)
  for (const [key, set] of Object.entries(state.sets)) {
    // Compute active elements: elements where at least one tag is not tombstoned
    const activeElements: string[] = [];
    for (const [elem, tags] of Object.entries(set.elements)) {
      const tombstoneTags = new Set(set.tombstones[elem] || []);
      const hasActiveTag = tags.some(tag => !tombstoneTags.has(tag));
      if (hasActiveTag) {
        activeElements.push(elem);
      }
    }
    activeElements.sort();
    parts.push(`s:${key}:[${activeElements.join(',')}]`);
  }

  // Sort for consistency
  parts.sort();

  // Simple hash: join and get a fingerprint
  const joined = parts.join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    const char = joined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Return hash without version - version is per-node and shouldn't affect convergence check
  return hash.toString(16);
}

// =============================================================================
// Convergence Tracker Implementation
// =============================================================================

/**
 * Create a new Convergence Tracker
 *
 * @param config - Tracker configuration
 * @returns Convergence Tracker instance
 *
 * @example
 * ```typescript
 * const tracker = createConvergenceTracker();
 *
 * // Record state from each node
 * tracker.recordNodeState('node-1', store1.getState());
 * tracker.recordNodeState('node-2', store2.getState());
 *
 * // Check if they've converged
 * if (tracker.hasConverged()) {
 *   console.log('All nodes have same state!');
 * }
 * ```
 */
export function createConvergenceTracker(
  config?: ConvergenceTrackerConfig
): ConvergenceTracker {
  const cfg: Required<ConvergenceTrackerConfig> = { ...DEFAULT_CONFIG, ...config };
  const { historyRetentionMs, staleThresholdMs } = cfg;

  // Track node states: nodeId -> latest snapshot
  const nodeStates = new Map<string, NodeStateSnapshot>();

  // Track state history for each node: nodeId -> array of snapshots
  const stateHistory = new Map<string, NodeStateSnapshot[]>();

  // Track last convergence time
  let lastConvergenceTime: number | null = null;

  /**
   * Clean up old history entries
   */
  function cleanupHistory(): void {
    const now = Date.now();
    const cutoff = now - historyRetentionMs;

    for (const [nodeId, history] of stateHistory) {
      const filtered = history.filter((s) => s.timestamp >= cutoff);
      if (filtered.length !== history.length) {
        stateHistory.set(nodeId, filtered);
      }
    }
  }

  /**
   * Check if a node is stale (hasn't reported recently)
   */
  function isNodeStale(snapshot: NodeStateSnapshot): boolean {
    return Date.now() - snapshot.timestamp > staleThresholdMs;
  }

  return {
    recordNodeState(nodeId: string, state: CRDTStoreState): void {
      const snapshot: NodeStateSnapshot = {
        nodeId,
        version: state.version,
        timestamp: Date.now(),
        stateHash: hashState(state),
      };

      // Update current state
      nodeStates.set(nodeId, snapshot);

      // Add to history
      if (!stateHistory.has(nodeId)) {
        stateHistory.set(nodeId, []);
      }
      stateHistory.get(nodeId)!.push(snapshot);

      // Cleanup old history
      cleanupHistory();

      // Check if convergence just happened
      if (this.hasConverged()) {
        lastConvergenceTime = Date.now();
      }
    },

    hasConverged(): boolean {
      if (nodeStates.size < 2) {
        return true; // Single node is always converged with itself
      }

      // Get non-stale nodes
      const activeSnapshots: NodeStateSnapshot[] = [];
      for (const snapshot of nodeStates.values()) {
        if (!isNodeStale(snapshot)) {
          activeSnapshots.push(snapshot);
        }
      }

      if (activeSnapshots.length < 2) {
        return true; // Only one active node
      }

      // Check if all active nodes have the same hash
      const firstHash = activeSnapshots[0].stateHash;
      return activeSnapshots.every((s) => s.stateHash === firstHash);
    },

    getStatus(): ConvergenceStatus {
      const activeSnapshots: NodeStateSnapshot[] = [];
      const staleSnapshots: NodeStateSnapshot[] = [];

      for (const snapshot of nodeStates.values()) {
        if (isNodeStale(snapshot)) {
          staleSnapshots.push(snapshot);
        } else {
          activeSnapshots.push(snapshot);
        }
      }

      // Find max version
      let maxVersion = 0;
      let minVersion = Number.MAX_SAFE_INTEGER;
      for (const snapshot of activeSnapshots) {
        maxVersion = Math.max(maxVersion, snapshot.version);
        minVersion = Math.min(minVersion, snapshot.version);
      }

      if (activeSnapshots.length === 0) {
        minVersion = 0;
      }

      // Find lagging nodes
      const laggingNodes: string[] = [];
      if (activeSnapshots.length > 1) {
        const maxHash = activeSnapshots.reduce(
          (best, s) => (s.version > best.version ? s : best),
          activeSnapshots[0]
        ).stateHash;

        for (const snapshot of activeSnapshots) {
          if (snapshot.stateHash !== maxHash) {
            laggingNodes.push(snapshot.nodeId);
          }
        }
      }

      // Add stale nodes as lagging
      for (const snapshot of staleSnapshots) {
        laggingNodes.push(snapshot.nodeId);
      }

      const converged = laggingNodes.length === 0 && activeSnapshots.length > 0;

      return {
        converged,
        nodeCount: nodeStates.size,
        syncedNodes: activeSnapshots.length - laggingNodes.filter(
          (id) => !staleSnapshots.some((s) => s.nodeId === id)
        ).length,
        laggingNodes,
        lastConvergenceTime,
        maxVersion,
        minVersion,
      };
    },

    getLaggingNodes(): string[] {
      return this.getStatus().laggingNodes;
    },

    getTimeSinceConvergence(): number | null {
      if (lastConvergenceTime === null) {
        return null;
      }
      return Date.now() - lastConvergenceTime;
    },

    removeNode(nodeId: string): void {
      nodeStates.delete(nodeId);
      stateHistory.delete(nodeId);
    },

    clear(): void {
      nodeStates.clear();
      stateHistory.clear();
      lastConvergenceTime = null;
    },

    getTrackedNodes(): string[] {
      return Array.from(nodeStates.keys());
    },

    isTracking(nodeId: string): boolean {
      return nodeStates.has(nodeId);
    },

    getNodeVersion(nodeId: string): number | null {
      const snapshot = nodeStates.get(nodeId);
      return snapshot?.version ?? null;
    },
  };
}

// =============================================================================
// Extended Convergence Utilities
// =============================================================================

/**
 * Convergence metrics for monitoring
 */
export interface ConvergenceMetrics {
  /** Average time to convergence (ms) */
  averageConvergenceTime: number | null;
  /** Number of convergence events recorded */
  convergenceCount: number;
  /** Time since tracking started (ms) */
  trackingDuration: number;
  /** Percentage of time system was converged */
  convergenceRatio: number;
}

/**
 * Extended tracker with metrics collection
 */
export interface MetricsConvergenceTracker extends ConvergenceTracker {
  /** Get convergence metrics */
  getMetrics(): ConvergenceMetrics;
  /** Reset metrics (keeps node tracking) */
  resetMetrics(): void;
}

/**
 * Create a convergence tracker with metrics collection
 */
export function createMetricsConvergenceTracker(
  config?: ConvergenceTrackerConfig
): MetricsConvergenceTracker {
  const baseTracker = createConvergenceTracker(config);

  // Metrics tracking
  const startTime = Date.now();
  let convergenceCount = 0;
  let totalConvergedTime = 0;
  let lastStateChangeTime = startTime;
  let wasConverged = true;
  const convergenceTimes: number[] = [];

  // Wrap recordNodeState to track metrics
  const originalRecord = baseTracker.recordNodeState.bind(baseTracker);

  return {
    ...baseTracker,

    recordNodeState(nodeId: string, state: CRDTStoreState): void {
      const wasConvergedBefore = baseTracker.hasConverged();
      originalRecord(nodeId, state);
      const isConvergedNow = baseTracker.hasConverged();

      const now = Date.now();

      // Track state changes
      if (wasConvergedBefore !== isConvergedNow) {
        const duration = now - lastStateChangeTime;

        if (wasConvergedBefore) {
          // Was converged, now diverged
          totalConvergedTime += duration;
        } else {
          // Was diverged, now converged
          convergenceCount++;
          convergenceTimes.push(duration);
        }

        lastStateChangeTime = now;
        wasConverged = isConvergedNow;
      }
    },

    getMetrics(): ConvergenceMetrics {
      const now = Date.now();
      const trackingDuration = now - startTime;

      // Add current state duration
      let convergedTime = totalConvergedTime;
      if (wasConverged) {
        convergedTime += now - lastStateChangeTime;
      }

      return {
        averageConvergenceTime:
          convergenceTimes.length > 0
            ? convergenceTimes.reduce((a, b) => a + b, 0) / convergenceTimes.length
            : null,
        convergenceCount,
        trackingDuration,
        convergenceRatio: trackingDuration > 0 ? convergedTime / trackingDuration : 1,
      };
    },

    resetMetrics(): void {
      convergenceCount = 0;
      totalConvergedTime = 0;
      convergenceTimes.length = 0;
      lastStateChangeTime = Date.now();
      wasConverged = baseTracker.hasConverged();
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

export type {
  ConvergenceTracker,
  ConvergenceTrackerConfig,
  ConvergenceStatus,
  NodeStateSnapshot,
};
