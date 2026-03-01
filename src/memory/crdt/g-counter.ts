/**
 * Grow-only Counter Implementation
 *
 * A CRDT counter that only supports increment operations.
 * Each node maintains its own count, and the total is the sum of all counts.
 * Merge takes the maximum of each node's count.
 *
 * @module memory/crdt/g-counter
 */

import type { GCounter, GCounterState } from './types.js';

// =============================================================================
// G-Counter Implementation
// =============================================================================

/**
 * Create a new G-Counter
 *
 * @param nodeId - Unique identifier for this node
 * @returns G-Counter instance
 *
 * @example
 * ```typescript
 * const counter = createGCounter('node-1');
 * counter.increment(5);
 * counter.increment();
 * console.log(counter.get()); // 6
 * ```
 */
export function createGCounter(nodeId: string): GCounter {
  // Internal state: per-node counts
  const state: GCounterState = {
    counts: {},
    version: 0,
    lastUpdated: Date.now(),
  };

  // Initialize this node's count
  state.counts[nodeId] = 0;

  return {
    get(): number {
      // Sum all node counts
      return Object.values(state.counts).reduce((sum, count) => sum + count, 0);
    },

    increment(n: number = 1): void {
      if (n < 0) {
        throw new Error('G-Counter can only increment by positive values');
      }
      if (n === 0) {
        return;
      }

      state.counts[nodeId] = (state.counts[nodeId] || 0) + n;
      state.version++;
      state.lastUpdated = Date.now();
    },

    merge(other: GCounter): void {
      const otherState = other.getState();
      this.applyState(otherState);
    },

    getState(): GCounterState {
      // Return a deep copy to prevent external mutation
      return {
        counts: { ...state.counts },
        version: state.version,
        lastUpdated: state.lastUpdated,
      };
    },

    applyState(incoming: GCounterState): void {
      let changed = false;

      // Merge counts: take max for each node
      for (const [incomingNodeId, incomingCount] of Object.entries(incoming.counts)) {
        const currentCount = state.counts[incomingNodeId] || 0;
        if (incomingCount > currentCount) {
          state.counts[incomingNodeId] = incomingCount;
          changed = true;
        }
      }

      if (changed) {
        state.version = Math.max(state.version, incoming.version) + 1;
        state.lastUpdated = Date.now();
      }
    },

    getNodeId(): string {
      return nodeId;
    },

    getLocalCount(): number {
      return state.counts[nodeId] || 0;
    },
  };
}

// =============================================================================
// Factory with State
// =============================================================================

/**
 * Create a G-Counter from existing state
 *
 * @param nodeId - Unique identifier for this node
 * @param existingState - State to restore from
 * @returns G-Counter instance
 */
export function createGCounterFromState(
  nodeId: string,
  existingState: GCounterState
): GCounter {
  const counter = createGCounter(nodeId);
  counter.applyState(existingState);
  return counter;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a valid G-Counter state
 */
export function isGCounterState(value: unknown): value is GCounterState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.counts === 'object' &&
    state.counts !== null &&
    typeof state.version === 'number' &&
    typeof state.lastUpdated === 'number' &&
    Object.values(state.counts).every((v) => typeof v === 'number' && v >= 0)
  );
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get the count for a specific node from state
 */
export function getNodeCountFromState(
  state: GCounterState,
  nodeId: string
): number {
  return state.counts[nodeId] || 0;
}

/**
 * Get all contributing nodes from state
 */
export function getContributingNodes(state: GCounterState): string[] {
  return Object.keys(state.counts).filter((k) => state.counts[k] > 0);
}

// =============================================================================
// Exports
// =============================================================================

export type { GCounter, GCounterState };
