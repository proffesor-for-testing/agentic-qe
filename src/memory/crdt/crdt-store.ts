/**
 * Unified CRDT Store Implementation
 *
 * A unified store managing multiple CRDT types with support for:
 * - Full state replication
 * - Delta-based incremental sync
 * - Change event emission
 * - Type-safe access to different CRDT types
 *
 * @module memory/crdt/crdt-store
 */

import type {
  CRDTStore,
  CRDTStoreConfig,
  CRDTStoreState,
  CRDTStoreDelta,
  CRDTStoreStats,
  CRDTChangeEvent,
  CRDTChangeListener,
  CRDTType,
  LWWRegister,
  LWWRegisterState,
  GCounter,
  GCounterState,
  PNCounter,
  PNCounterState,
  ORSet,
  ORSetState,
} from './types.js';

import { createLWWRegister, createLWWRegisterFromState } from './lww-register.js';
import { createGCounter, createGCounterFromState } from './g-counter.js';
import { createPNCounter, createPNCounterFromState } from './pn-counter.js';
import { createORSet, createORSetFromState } from './or-set.js';

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<CRDTStoreConfig> = {
  nodeId: 'default-node',
  enableDeltaTracking: true,
  maxDeltaHistory: 100,
};

// =============================================================================
// CRDT Store Implementation
// =============================================================================

/**
 * Create a new CRDT Store
 *
 * @param config - Store configuration
 * @returns CRDT Store instance
 *
 * @example
 * ```typescript
 * const store = createCRDTStore({ nodeId: 'agent-1' });
 *
 * // Use registers
 * store.setRegister('config', { maxAgents: 100 });
 *
 * // Use counters
 * store.incrementCounter('tasks-completed');
 *
 * // Use sets
 * store.addToSet('active-agents', 'agent-1');
 *
 * // Merge with another store
 * store.merge(otherStore);
 * ```
 */
export function createCRDTStore(config: CRDTStoreConfig): CRDTStore {
  const cfg: Required<CRDTStoreConfig> = { ...DEFAULT_CONFIG, ...config };
  const { nodeId, enableDeltaTracking, maxDeltaHistory } = cfg;

  // Storage for each CRDT type
  const registers = new Map<string, LWWRegister<unknown>>();
  const gCounters = new Map<string, GCounter>();
  const pnCounters = new Map<string, PNCounter>();
  const sets = new Map<string, ORSet<unknown>>();

  // Versioning for delta tracking
  let version = 0;
  const deltaHistory: CRDTStoreDelta[] = [];

  // Change listeners
  const changeListeners = new Set<CRDTChangeListener>();

  // Track changes for delta generation
  const pendingChanges = {
    registers: new Set<string>(),
    gCounters: new Set<string>(),
    pnCounters: new Set<string>(),
    sets: new Set<string>(),
  };

  /**
   * Emit a change event
   */
  function emitChange(
    key: string,
    type: CRDTType,
    operation: CRDTChangeEvent['operation']
  ): void {
    const event: CRDTChangeEvent = {
      key,
      type,
      operation,
      timestamp: Date.now(),
      nodeId,
    };

    for (const listener of changeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[CRDTStore] Error in change listener:', error);
      }
    }
  }

  /**
   * Increment version and track change
   */
  function recordChange(
    type: 'registers' | 'gCounters' | 'pnCounters' | 'sets',
    key: string
  ): void {
    version++;
    if (enableDeltaTracking) {
      pendingChanges[type].add(key);
    }
  }

  /**
   * Flush pending changes to delta history
   */
  function flushDelta(): void {
    if (!enableDeltaTracking) return;

    const hasChanges =
      pendingChanges.registers.size > 0 ||
      pendingChanges.gCounters.size > 0 ||
      pendingChanges.pnCounters.size > 0 ||
      pendingChanges.sets.size > 0;

    if (!hasChanges) return;

    const delta: CRDTStoreDelta = {
      fromVersion: deltaHistory.length > 0 ? deltaHistory[deltaHistory.length - 1].toVersion : 0,
      toVersion: version,
      timestamp: Date.now(),
      nodeId,
    };

    if (pendingChanges.registers.size > 0) {
      delta.registers = {};
      for (const key of pendingChanges.registers) {
        const reg = registers.get(key);
        if (reg) {
          delta.registers[key] = reg.getState();
        }
      }
      pendingChanges.registers.clear();
    }

    if (pendingChanges.gCounters.size > 0) {
      delta.gCounters = {};
      for (const key of pendingChanges.gCounters) {
        const counter = gCounters.get(key);
        if (counter) {
          delta.gCounters[key] = counter.getState();
        }
      }
      pendingChanges.gCounters.clear();
    }

    if (pendingChanges.pnCounters.size > 0) {
      delta.pnCounters = {};
      for (const key of pendingChanges.pnCounters) {
        const counter = pnCounters.get(key);
        if (counter) {
          delta.pnCounters[key] = counter.getState();
        }
      }
      pendingChanges.pnCounters.clear();
    }

    if (pendingChanges.sets.size > 0) {
      delta.sets = {};
      for (const key of pendingChanges.sets) {
        const set = sets.get(key);
        if (set) {
          delta.sets[key] = set.getState();
        }
      }
      pendingChanges.sets.clear();
    }

    deltaHistory.push(delta);

    // Trim history if needed
    while (deltaHistory.length > maxDeltaHistory) {
      deltaHistory.shift();
    }
  }

  const store: CRDTStore = {
    // -------------------------------------------------------------------------
    // Register Management
    // -------------------------------------------------------------------------

    getRegister<T>(key: string): LWWRegister<T> {
      if (!registers.has(key)) {
        registers.set(key, createLWWRegister<T>(nodeId));
      }
      return registers.get(key) as LWWRegister<T>;
    },

    setRegister<T>(key: string, value: T): void {
      const register = store.getRegister<T>(key);
      register.set(value);
      recordChange('registers', key);
      emitChange(key, 'lww-register', 'set');
    },

    hasRegister(key: string): boolean {
      return registers.has(key);
    },

    deleteRegister(key: string): boolean {
      const deleted = registers.delete(key);
      if (deleted) {
        recordChange('registers', key);
      }
      return deleted;
    },

    // -------------------------------------------------------------------------
    // G-Counter Management
    // -------------------------------------------------------------------------

    getGCounter(key: string): GCounter {
      if (!gCounters.has(key)) {
        gCounters.set(key, createGCounter(nodeId));
      }
      return gCounters.get(key)!;
    },

    incrementGCounter(key: string, n?: number): void {
      const counter = store.getGCounter(key);
      counter.increment(n);
      recordChange('gCounters', key);
      emitChange(key, 'g-counter', 'increment');
    },

    hasGCounter(key: string): boolean {
      return gCounters.has(key);
    },

    deleteGCounter(key: string): boolean {
      const deleted = gCounters.delete(key);
      if (deleted) {
        recordChange('gCounters', key);
      }
      return deleted;
    },

    // -------------------------------------------------------------------------
    // PN-Counter Management
    // -------------------------------------------------------------------------

    getCounter(key: string): PNCounter {
      if (!pnCounters.has(key)) {
        pnCounters.set(key, createPNCounter(nodeId));
      }
      return pnCounters.get(key)!;
    },

    incrementCounter(key: string, n?: number): void {
      const counter = store.getCounter(key);
      counter.increment(n);
      recordChange('pnCounters', key);
      emitChange(key, 'pn-counter', 'increment');
    },

    decrementCounter(key: string, n?: number): void {
      const counter = store.getCounter(key);
      counter.decrement(n);
      recordChange('pnCounters', key);
      emitChange(key, 'pn-counter', 'decrement');
    },

    hasCounter(key: string): boolean {
      return pnCounters.has(key);
    },

    deleteCounter(key: string): boolean {
      const deleted = pnCounters.delete(key);
      if (deleted) {
        recordChange('pnCounters', key);
      }
      return deleted;
    },

    // -------------------------------------------------------------------------
    // OR-Set Management
    // -------------------------------------------------------------------------

    getSet<T>(key: string): ORSet<T> {
      if (!sets.has(key)) {
        sets.set(key, createORSet<T>(nodeId));
      }
      return sets.get(key) as ORSet<T>;
    },

    addToSet<T>(key: string, element: T): void {
      const set = store.getSet<T>(key);
      set.add(element);
      recordChange('sets', key);
      emitChange(key, 'or-set', 'add');
    },

    removeFromSet<T>(key: string, element: T): void {
      const set = store.getSet<T>(key);
      set.remove(element);
      recordChange('sets', key);
      emitChange(key, 'or-set', 'remove');
    },

    hasSet(key: string): boolean {
      return sets.has(key);
    },

    deleteSet(key: string): boolean {
      const deleted = sets.delete(key);
      if (deleted) {
        recordChange('sets', key);
      }
      return deleted;
    },

    // -------------------------------------------------------------------------
    // Store Operations
    // -------------------------------------------------------------------------

    merge(other: CRDTStore): void {
      const otherState = other.getState();
      store.applyState(otherState);
    },

    getState(): CRDTStoreState {
      // Flush any pending changes
      flushDelta();

      const state: CRDTStoreState = {
        version,
        timestamp: Date.now(),
        nodeId,
        registers: {},
        gCounters: {},
        pnCounters: {},
        sets: {},
      };

      for (const [key, reg] of registers) {
        state.registers[key] = reg.getState();
      }

      for (const [key, counter] of gCounters) {
        state.gCounters[key] = counter.getState();
      }

      for (const [key, counter] of pnCounters) {
        state.pnCounters[key] = counter.getState();
      }

      for (const [key, set] of sets) {
        state.sets[key] = set.getState();
      }

      return state;
    },

    applyState(incoming: CRDTStoreState): void {
      // Apply registers
      for (const [key, state] of Object.entries(incoming.registers)) {
        if (!registers.has(key)) {
          registers.set(
            key,
            createLWWRegisterFromState(nodeId, state as LWWRegisterState<unknown>)
          );
        } else {
          registers.get(key)!.applyState(state as LWWRegisterState<unknown>);
        }
        recordChange('registers', key);
        emitChange(key, 'lww-register', 'merge');
      }

      // Apply G-Counters
      for (const [key, state] of Object.entries(incoming.gCounters)) {
        if (!gCounters.has(key)) {
          gCounters.set(key, createGCounterFromState(nodeId, state));
        } else {
          gCounters.get(key)!.applyState(state);
        }
        recordChange('gCounters', key);
        emitChange(key, 'g-counter', 'merge');
      }

      // Apply PN-Counters
      for (const [key, state] of Object.entries(incoming.pnCounters)) {
        if (!pnCounters.has(key)) {
          pnCounters.set(key, createPNCounterFromState(nodeId, state));
        } else {
          pnCounters.get(key)!.applyState(state);
        }
        recordChange('pnCounters', key);
        emitChange(key, 'pn-counter', 'merge');
      }

      // Apply OR-Sets
      for (const [key, state] of Object.entries(incoming.sets)) {
        if (!sets.has(key)) {
          sets.set(
            key,
            createORSetFromState(nodeId, state as ORSetState<unknown>)
          );
        } else {
          sets.get(key)!.applyState(state as ORSetState<unknown>);
        }
        recordChange('sets', key);
        emitChange(key, 'or-set', 'merge');
      }

      // Update version
      version = Math.max(version, incoming.version) + 1;
    },

    getDelta(sinceVersion: number): CRDTStoreDelta | null {
      // Flush pending changes first
      flushDelta();

      if (deltaHistory.length === 0) {
        // No deltas recorded yet - return null if no changes since version 0
        if (sinceVersion >= version) {
          return null;
        }
        // For initial state, need full state - caller should use getState instead
        return null;
      }

      // Find deltas that contain changes after the requested version
      // A delta is relevant if its toVersion > sinceVersion
      const relevantDeltas = deltaHistory.filter((d) => d.toVersion > sinceVersion);

      if (relevantDeltas.length === 0) {
        return null; // Already up to date
        return null;
      }

      // Merge relevant deltas
      const mergedDelta: CRDTStoreDelta = {
        fromVersion: sinceVersion,
        toVersion: version,
        timestamp: Date.now(),
        nodeId,
        registers: {},
        gCounters: {},
        pnCounters: {},
        sets: {},
      };

      for (const delta of relevantDeltas) {
        if (delta.registers) {
          Object.assign(mergedDelta.registers!, delta.registers);
        }
        if (delta.gCounters) {
          Object.assign(mergedDelta.gCounters!, delta.gCounters);
        }
        if (delta.pnCounters) {
          Object.assign(mergedDelta.pnCounters!, delta.pnCounters);
        }
        if (delta.sets) {
          Object.assign(mergedDelta.sets!, delta.sets);
        }
      }

      // Clean up empty objects
      if (Object.keys(mergedDelta.registers!).length === 0) {
        delete mergedDelta.registers;
      }
      if (Object.keys(mergedDelta.gCounters!).length === 0) {
        delete mergedDelta.gCounters;
      }
      if (Object.keys(mergedDelta.pnCounters!).length === 0) {
        delete mergedDelta.pnCounters;
      }
      if (Object.keys(mergedDelta.sets!).length === 0) {
        delete mergedDelta.sets;
      }

      return mergedDelta;
    },

    applyDelta(delta: CRDTStoreDelta): void {
      // Apply delta similar to full state, but only for included keys
      if (delta.registers) {
        for (const [key, state] of Object.entries(delta.registers)) {
          if (!registers.has(key)) {
            registers.set(
              key,
              createLWWRegisterFromState(nodeId, state as LWWRegisterState<unknown>)
            );
          } else {
            registers.get(key)!.applyState(state as LWWRegisterState<unknown>);
          }
          recordChange('registers', key);
          emitChange(key, 'lww-register', 'merge');
        }
      }

      if (delta.gCounters) {
        for (const [key, state] of Object.entries(delta.gCounters)) {
          if (!gCounters.has(key)) {
            gCounters.set(key, createGCounterFromState(nodeId, state));
          } else {
            gCounters.get(key)!.applyState(state);
          }
          recordChange('gCounters', key);
          emitChange(key, 'g-counter', 'merge');
        }
      }

      if (delta.pnCounters) {
        for (const [key, state] of Object.entries(delta.pnCounters)) {
          if (!pnCounters.has(key)) {
            pnCounters.set(key, createPNCounterFromState(nodeId, state));
          } else {
            pnCounters.get(key)!.applyState(state);
          }
          recordChange('pnCounters', key);
          emitChange(key, 'pn-counter', 'merge');
        }
      }

      if (delta.sets) {
        for (const [key, state] of Object.entries(delta.sets)) {
          if (!sets.has(key)) {
            sets.set(
              key,
              createORSetFromState(nodeId, state as ORSetState<unknown>)
            );
          } else {
            sets.get(key)!.applyState(state as ORSetState<unknown>);
          }
          recordChange('sets', key);
          emitChange(key, 'or-set', 'merge');
        }
      }

      version = Math.max(version, delta.toVersion) + 1;
    },

    getVersion(): number {
      return version;
    },

    getNodeId(): string {
      return nodeId;
    },

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    on(event: 'change', callback: CRDTChangeListener): () => void {
      if (event === 'change') {
        changeListeners.add(callback);
        return () => {
          changeListeners.delete(callback);
        };
      }
      throw new Error(`Unknown event type: ${event}`);
    },

    removeAllListeners(): void {
      changeListeners.clear();
    },

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    keys(type?: CRDTType): string[] {
      const allKeys: string[] = [];

      if (!type || type === 'lww-register') {
        allKeys.push(...Array.from(registers.keys()));
      }
      if (!type || type === 'g-counter') {
        allKeys.push(...Array.from(gCounters.keys()));
      }
      if (!type || type === 'pn-counter') {
        allKeys.push(...Array.from(pnCounters.keys()));
      }
      if (!type || type === 'or-set') {
        allKeys.push(...Array.from(sets.keys()));
      }

      return allKeys;
    },

    clear(): void {
      registers.clear();
      gCounters.clear();
      pnCounters.clear();
      sets.clear();
      deltaHistory.length = 0;
      pendingChanges.registers.clear();
      pendingChanges.gCounters.clear();
      pendingChanges.pnCounters.clear();
      pendingChanges.sets.clear();
      version = 0;
    },

    getStats(): CRDTStoreStats {
      return {
        total: registers.size + gCounters.size + pnCounters.size + sets.size,
        registers: registers.size,
        gCounters: gCounters.size,
        pnCounters: pnCounters.size,
        sets: sets.size,
        version,
        nodeId,
        deltaHistorySize: deltaHistory.length,
      };
    },
  };

  return store;
}

// =============================================================================
// Factory from State
// =============================================================================

/**
 * Create a CRDT Store from existing state
 *
 * @param nodeId - Unique identifier for this node
 * @param existingState - State to restore from
 * @param config - Additional configuration
 * @returns CRDT Store instance
 */
export function createCRDTStoreFromState(
  nodeId: string,
  existingState: CRDTStoreState,
  config?: Partial<CRDTStoreConfig>
): CRDTStore {
  const store = createCRDTStore({ nodeId, ...config });
  store.applyState(existingState);
  return store;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a valid CRDT Store state
 */
export function isCRDTStoreState(value: unknown): value is CRDTStoreState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.version === 'number' &&
    typeof state.timestamp === 'number' &&
    typeof state.nodeId === 'string' &&
    typeof state.registers === 'object' &&
    typeof state.gCounters === 'object' &&
    typeof state.pnCounters === 'object' &&
    typeof state.sets === 'object'
  );
}

/**
 * Check if a value is a valid CRDT Store delta
 */
export function isCRDTStoreDelta(value: unknown): value is CRDTStoreDelta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const delta = value as Record<string, unknown>;
  return (
    typeof delta.fromVersion === 'number' &&
    typeof delta.toVersion === 'number' &&
    typeof delta.timestamp === 'number' &&
    typeof delta.nodeId === 'string'
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { CRDTStore, CRDTStoreConfig, CRDTStoreState, CRDTStoreDelta };
