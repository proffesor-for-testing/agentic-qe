/**
 * Positive-Negative Counter Implementation
 *
 * A CRDT counter that supports both increment and decrement operations.
 * Implemented as two G-Counters: one for positive increments, one for decrements.
 * The value is the difference: positive - negative.
 *
 * @module memory/crdt/pn-counter
 */

import type { PNCounter, PNCounterState, GCounterState } from './types.js';
import { createGCounter, createGCounterFromState } from './g-counter.js';

// =============================================================================
// PN-Counter Implementation
// =============================================================================

/**
 * Create a new PN-Counter
 *
 * @param nodeId - Unique identifier for this node
 * @returns PN-Counter instance
 *
 * @example
 * ```typescript
 * const counter = createPNCounter('node-1');
 * counter.increment(10);
 * counter.decrement(3);
 * console.log(counter.get()); // 7
 * ```
 */
export function createPNCounter(nodeId: string): PNCounter {
  // Two G-Counters: one for increments, one for decrements
  const positive = createGCounter(nodeId);
  const negative = createGCounter(nodeId);

  // Track version separately for the combined counter
  let version = 0;
  let lastUpdated = Date.now();

  return {
    get(): number {
      return positive.get() - negative.get();
    },

    increment(n: number = 1): void {
      if (n < 0) {
        throw new Error('Use decrement() for negative values');
      }
      if (n === 0) {
        return;
      }

      positive.increment(n);
      version++;
      lastUpdated = Date.now();
    },

    decrement(n: number = 1): void {
      if (n < 0) {
        throw new Error('Use increment() for negative values');
      }
      if (n === 0) {
        return;
      }

      negative.increment(n);
      version++;
      lastUpdated = Date.now();
    },

    merge(other: PNCounter): void {
      const otherState = other.getState();
      this.applyState(otherState);
    },

    getState(): PNCounterState {
      return {
        positive: positive.getState(),
        negative: negative.getState(),
        version,
        lastUpdated,
      };
    },

    applyState(incoming: PNCounterState): void {
      const oldValue = this.get();

      // Apply to both underlying G-Counters
      positive.applyState(incoming.positive);
      negative.applyState(incoming.negative);

      const newValue = this.get();
      if (oldValue !== newValue) {
        version = Math.max(version, incoming.version) + 1;
        lastUpdated = Date.now();
      }
    },

    getNodeId(): string {
      return nodeId;
    },
  };
}

// =============================================================================
// Factory with State
// =============================================================================

/**
 * Create a PN-Counter from existing state
 *
 * @param nodeId - Unique identifier for this node
 * @param existingState - State to restore from
 * @returns PN-Counter instance
 */
export function createPNCounterFromState(
  nodeId: string,
  existingState: PNCounterState
): PNCounter {
  const counter = createPNCounter(nodeId);
  counter.applyState(existingState);
  return counter;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a valid PN-Counter state
 */
export function isPNCounterState(value: unknown): value is PNCounterState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.positive === 'object' &&
    state.positive !== null &&
    typeof state.negative === 'object' &&
    state.negative !== null &&
    typeof state.version === 'number' &&
    typeof state.lastUpdated === 'number' &&
    isGCounterStateValid(state.positive as GCounterState) &&
    isGCounterStateValid(state.negative as GCounterState)
  );
}

/**
 * Helper to validate G-Counter state structure
 */
function isGCounterStateValid(state: GCounterState): boolean {
  return (
    typeof state.counts === 'object' &&
    state.counts !== null &&
    typeof state.version === 'number' &&
    typeof state.lastUpdated === 'number'
  );
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get detailed breakdown of counter state
 */
export interface PNCounterBreakdown {
  total: number;
  positiveTotal: number;
  negativeTotal: number;
  positiveByNode: Record<string, number>;
  negativeByNode: Record<string, number>;
}

/**
 * Get breakdown of PN-Counter state
 */
export function getPNCounterBreakdown(state: PNCounterState): PNCounterBreakdown {
  const positiveTotal = Object.values(state.positive.counts).reduce(
    (sum, count) => sum + count,
    0
  );
  const negativeTotal = Object.values(state.negative.counts).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    total: positiveTotal - negativeTotal,
    positiveTotal,
    negativeTotal,
    positiveByNode: { ...state.positive.counts },
    negativeByNode: { ...state.negative.counts },
  };
}

// =============================================================================
// Exports
// =============================================================================

export type { PNCounter, PNCounterState };
