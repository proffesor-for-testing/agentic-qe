/**
 * Last-Write-Wins Register Implementation
 *
 * A CRDT register where concurrent writes are resolved using timestamps.
 * The write with the highest timestamp wins. In case of ties, the node ID
 * is used as a tiebreaker (lexicographic order).
 *
 * @module memory/crdt/lww-register
 */

import type { LWWRegister, LWWRegisterState } from './types.js';

// =============================================================================
// LWW Register Implementation
// =============================================================================

/**
 * Create a new LWW Register
 *
 * @param nodeId - Unique identifier for this node
 * @param initialValue - Optional initial value
 * @param initialTimestamp - Optional initial timestamp
 * @returns LWW Register instance
 *
 * @example
 * ```typescript
 * const register = createLWWRegister<string>('node-1');
 * register.set('hello', Date.now());
 * console.log(register.get()); // 'hello'
 * ```
 */
export function createLWWRegister<T>(
  nodeId: string,
  initialValue?: T,
  initialTimestamp?: number
): LWWRegister<T> {
  // Internal state
  let state: LWWRegisterState<T> = {
    value: initialValue,
    timestamp: initialTimestamp ?? (initialValue !== undefined ? Date.now() : 0),
    nodeId: initialValue !== undefined ? nodeId : '',
    version: initialValue !== undefined ? 1 : 0,
    lastUpdated: Date.now(),
  };

  /**
   * Compare two timestamps with nodeId as tiebreaker
   * Returns positive if a wins, negative if b wins, 0 if equal
   */
  function compareTimestamps(
    timestampA: number,
    nodeIdA: string,
    timestampB: number,
    nodeIdB: string
  ): number {
    if (timestampA !== timestampB) {
      return timestampA - timestampB;
    }
    // Tiebreaker: lexicographic comparison of node IDs
    return nodeIdA.localeCompare(nodeIdB);
  }

  return {
    get(): T | undefined {
      return state.value;
    },

    set(value: T, timestamp?: number): void {
      const ts = timestamp ?? Date.now();

      // Only update if new timestamp wins
      if (
        state.timestamp === 0 ||
        compareTimestamps(ts, nodeId, state.timestamp, state.nodeId) > 0
      ) {
        state = {
          value,
          timestamp: ts,
          nodeId,
          version: state.version + 1,
          lastUpdated: Date.now(),
        };
      }
    },

    merge(other: LWWRegister<T>): void {
      const otherState = other.getState();
      this.applyState(otherState);
    },

    getState(): LWWRegisterState<T> {
      // Return a copy to prevent external mutation
      return {
        value: state.value,
        timestamp: state.timestamp,
        nodeId: state.nodeId,
        version: state.version,
        lastUpdated: state.lastUpdated,
      };
    },

    applyState(incoming: LWWRegisterState<T>): void {
      // Only update if incoming timestamp wins
      if (
        state.timestamp === 0 ||
        compareTimestamps(
          incoming.timestamp,
          incoming.nodeId,
          state.timestamp,
          state.nodeId
        ) > 0
      ) {
        state = {
          value: incoming.value,
          timestamp: incoming.timestamp,
          nodeId: incoming.nodeId,
          version: Math.max(state.version, incoming.version) + 1,
          lastUpdated: Date.now(),
        };
      }
    },

    getNodeId(): string {
      return nodeId;
    },

    getTimestamp(): number {
      return state.timestamp;
    },
  };
}

// =============================================================================
// Factory with State
// =============================================================================

/**
 * Create a LWW Register from existing state
 *
 * @param nodeId - Unique identifier for this node
 * @param existingState - State to restore from
 * @returns LWW Register instance
 */
export function createLWWRegisterFromState<T>(
  nodeId: string,
  existingState: LWWRegisterState<T>
): LWWRegister<T> {
  const register = createLWWRegister<T>(nodeId);
  register.applyState(existingState);
  return register;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a valid LWW Register state
 */
export function isLWWRegisterState<T>(value: unknown): value is LWWRegisterState<T> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.timestamp === 'number' &&
    typeof state.nodeId === 'string' &&
    typeof state.version === 'number' &&
    typeof state.lastUpdated === 'number' &&
    'value' in state
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { LWWRegister, LWWRegisterState };
